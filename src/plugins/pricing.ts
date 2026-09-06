import type {
  CollectionBeforeValidateHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
  Config,
  Field,
  Plugin,
} from 'payload';
import { resolveEffectiveRate } from '../utilities/exchangeRate';

/**
 * ─── Pricing Plugin (Sprint 11) ─────────────────────────────────────────────
 *
 * Motor de precios bimonetario siguiendo el patrón canónico de plugins
 * ((options) => (config) => Config), según AGENTS.md §2.1:
 *
 *  1. Inyecta en `products` el array `priceTiers` (mayorista / vendedor / promo).
 *     El precio base `priceUSD` existente ES el tier `retail` — no se duplica.
 *  2. Registra la colección `price-history`: bitácora inmutable de cambios de
 *     precio con snapshot de tasa.
 *  3. Compone en `products` un `beforeChange` que escribe el historial cuando
 *     cambia `priceUSD` (propagando `req` para la atomicidad transaccional).
 *  4. Compone un `beforeValidate` que garantiza unicidad de tiers por producto.
 *
 * Nota de modelo: el margen se fija en USD; el VES es SIEMPRE derivado con la
 * tasa snapshot del documento (decisión documentada en el ROADMAP — no hay
 * auto-aplicación masiva de precios).
 */

export interface PricingPluginOptions {
  enabled?: boolean;
  productsSlug?: string;
}

const TIERS = ['wholesale', 'vendor', 'promo'] as const;

/** Unicidad de tiers dentro del array de un producto. */
const validateUniqueTiers: CollectionBeforeValidateHook = async ({ data }) => {
  if (!data) return data;

  const tiers = (Array.isArray(data.priceTiers) ? data.priceTiers : []) as Array<{
    tier?: string;
  }>;
  const seen = new Set<string>();
  for (const entry of tiers) {
    const tier = String(entry?.tier ?? '');
    if (seen.has(tier)) {
      throw new Error(
        `Contrato inválido: el tier de precio "${tier}" está duplicado. Un producto tiene un solo precio por tier.`,
      );
    }
    seen.add(tier);
  }

  return data;
};

/** Bitácora de cambios: se dispara cuando `priceUSD` cambia en un update. */
const priceHistoryHook: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (operation !== 'update' || !originalDoc) return data;
  if (req.context?.skipPriceHistory) return data;

  const newPrice = Number(data.priceUSD);
  const oldPrice = Number(originalDoc.priceUSD) || 0;

  if (!Number.isFinite(newPrice) || Math.abs(newPrice - oldPrice) < 0.005) {
    return data;
  }

  const { rate } = await resolveEffectiveRate();

  await req.payload.create({
    collection: 'price-history',
    data: {
      tenant: originalDoc.tenant,
      product: originalDoc.id,
      oldPriceUSD: oldPrice,
      newPriceUSD: newPrice,
      exchangeRateSnapshot: rate,
      newPriceVES: Number((newPrice * rate).toFixed(2)),
      trigger: 'manual',
      changedBy: req.user?.id,
    },
    req,
    overrideAccess: true,
  });

  return data;
};

export const pricingPlugin =
  (options: PricingPluginOptions = {}): Plugin =>
  (incomingConfig: Config): Config => {
    if (options.enabled === false) {
      return incomingConfig;
    }

    const productsSlug = options.productsSlug ?? 'products';

    const priceHistoryCollection: CollectionConfig = {
      slug: 'price-history',
      labels: {
        singular: 'Cambio de Precio',
        plural: 'Historial de Precios',
      },
      admin: {
        useAsTitle: 'id',
        group: 'Inventario & Producción',
        defaultColumns: ['product', 'oldPriceUSD', 'newPriceUSD', 'newPriceVES', 'trigger', 'createdAt'],
        description: 'Bitácora inmutable de cambios de precio (escrita por el pricingPlugin).',
      },
      access: {
        read: ({ req: { user } }) => Boolean(user),
        create: () => false, // Solo el plugin escribe (hooks con overrideAccess)
        update: () => false,
        delete: () => false,
      },
      fields: [
        {
          name: 'product',
          label: 'Producto',
          type: 'relationship',
          relationTo: 'products',
          required: true,
          index: true,
        },
        {
          name: 'oldPriceUSD',
          label: 'Precio Anterior (USD)',
          type: 'number',
          required: true,
        },
        {
          name: 'newPriceUSD',
          label: 'Precio Nuevo (USD)',
          type: 'number',
          required: true,
        },
        {
          name: 'exchangeRateSnapshot',
          label: 'Tasa al Momento del Cambio',
          type: 'number',
          required: true,
        },
        {
          name: 'newPriceVES',
          label: 'Precio Nuevo (VES)',
          type: 'number',
          required: true,
        },
        {
          name: 'trigger',
          label: 'Origen del Cambio',
          type: 'select',
          required: true,
          defaultValue: 'manual',
          options: [
            { label: 'Manual', value: 'manual' },
            { label: 'Revisión por Tasa', value: 'rate_change' },
          ],
        },
        {
          name: 'changedBy',
          label: 'Modificado Por',
          type: 'relationship',
          relationTo: 'users',
          index: true,
        },
      ],
      timestamps: true,
    };

    const priceTiersField: Field = {
      name: 'priceTiers',
      label: 'Precios por Segmento (mayorista / vendedor / promo)',
      type: 'array',
      fields: [
        {
          name: 'tier',
          label: 'Segmento',
          type: 'select',
          required: true,
          options: TIERS.map((value) => ({ label: value, value })),
        },
        {
          name: 'priceUSD',
          label: 'Precio (USD)',
          type: 'number',
          required: true,
          min: 0,
        },
      ],
      admin: {
        description:
          'El precio base (retail) es el campo "Precio Base de Venta". Agrega aquí los tiers alternativos; los documentos seleccionan el tier según el cliente.',
      },
    };

    const collections: CollectionConfig[] = (incomingConfig.collections || []).map(
      (collection) => {
        if (collection.slug === productsSlug) {
          return {
            ...collection,
            fields: [...(collection.fields || []), priceTiersField],
            hooks: {
              ...(collection.hooks || {}),
              beforeValidate: [validateUniqueTiers, ...(collection.hooks?.beforeValidate || [])],
              beforeChange: [priceHistoryHook, ...(collection.hooks?.beforeChange || [])],
            },
          };
        }
        return collection;
      },
    );

    return {
      ...incomingConfig,
      collections: [...collections, priceHistoryCollection],
    };
  };

