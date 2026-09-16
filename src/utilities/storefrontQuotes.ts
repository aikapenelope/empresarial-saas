import { z } from 'zod';

/**
 * ─── Helpers Puros y Validación para Cotizaciones de Storefront B2B ──────────
 *
 * Separados de `src/actions/storefrontActions.ts` (constitución §2.1):
 * Los módulos marcados con 'use server' sólo pueden exportar funciones async
 * (Server Actions). Los schemas Zod, interfaces y helpers puros de cálculo
 * pertenecen a `src/utilities/`.
 */

export const storefrontQuoteItemSchema = z.object({
  productId: z.number().int().positive('ID de producto inválido'),
  quantity: z
    .number()
    .positive('La cantidad debe ser mayor a cero')
    .max(100000, 'Cantidad excesiva'),
});

export const createStorefrontQuoteSchema = z.object({
  tenantSlug: z
    .string()
    .trim()
    .min(2, 'Slug de empresa requerido')
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug de empresa con formato inválido'),
  companyName: z
    .string()
    .trim()
    .min(2, 'La razón social o nombre debe tener al menos 2 caracteres')
    .max(200, 'La razón social no puede exceder 200 caracteres'),
  taxId: z
    .string()
    .trim()
    .min(3, 'El RIF o identificación fiscal debe tener al menos 3 caracteres')
    .max(30, 'El RIF no puede exceder 30 caracteres'),
  phone: z
    .string()
    .trim()
    .min(6, 'Número de teléfono o WhatsApp inválido')
    .max(30, 'Número de teléfono demasiado largo'),
  email: z
    .string()
    .trim()
    .email('Formato de correo electrónico inválido')
    .max(150)
    .optional()
    .or(z.literal('')),
  notes: z
    .string()
    .trim()
    .max(1000, 'Las observaciones no pueden superar los 1000 caracteres')
    .optional()
    .or(z.literal('')),
  items: z
    .array(storefrontQuoteItemSchema)
    .min(1, 'El pedido debe incluir al menos un producto'),
});

export type CreateStorefrontQuoteInput = z.infer<typeof createStorefrontQuoteSchema>;

export interface CalculatedStorefrontTotals {
  lineItems: Array<{
    product: number;
    sku?: string;
    description: string;
    quantity: number;
    unitPriceUSD: number;
    totalUSD: number;
  }>;
  totalUSD: number;
  totalVES: number;
}

/**
 * Calcula los subtotales y totales usando exclusivamente los precios del catálogo en la BD (anti-tampering).
 */
export function calculateStorefrontQuoteTotals(
  items: Array<{ productId: number; quantity: number }>,
  catalogProducts: Array<{ id: number; name: string; sku?: string | null; priceUSD: number }>,
  exchangeRate: number,
): CalculatedStorefrontTotals {
  const productMap = new Map(catalogProducts.map((p) => [p.id, p]));
  let sumUSD = 0;

  const lineItems = items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new Error(`El producto con ID ${item.productId} no está disponible en este catálogo.`);
    }

    const unitPriceUSD = Number(product.priceUSD) || 0;
    const lineTotalUSD = Number((unitPriceUSD * item.quantity).toFixed(2));
    sumUSD += lineTotalUSD;

    return {
      product: product.id,
      sku: product.sku || undefined,
      description: product.name,
      quantity: item.quantity,
      unitPriceUSD,
      totalUSD: lineTotalUSD,
    };
  });

  const totalUSD = Number(sumUSD.toFixed(2));
  const totalVES = Number((totalUSD * exchangeRate).toFixed(2));

  return {
    lineItems,
    totalUSD,
    totalVES,
  };
}

export interface BuildWhatsAppUrlParams {
  targetPhone?: string | null;
  quoteNumber: string;
  companyName: string;
  taxId: string;
  totalUSD: number;
  totalVES: number;
  shareUrl: string;
}

/**
 * Formatea el enlace directo a WhatsApp (wa.me) con el mensaje de confirmación del pedido.
 */
export function buildStorefrontWhatsAppUrl(params: BuildWhatsAppUrlParams): string {
  const cleanPhone = (params.targetPhone || '').replace(/[^0-9]/g, '');
  if (!cleanPhone) return '';

  const message = `Hola, he generado la solicitud de cotización *${params.quoteNumber}* por un total de *$${params.totalUSD.toFixed(
    2,
  )} USD* (aprox. *Bs. ${params.totalVES.toFixed(2)}*) a nombre de *${params.companyName}* (RIF: ${params.taxId}).\n\nPuedes revisar el desglose oficial del pedido aquí:\n${params.shareUrl}`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Formatea el enlace directo a WhatsApp (wa.me) para consultas generales y contacto rápido en el catálogo.
 */
export function buildStorefrontContactWhatsAppUrl(
  targetPhone?: string | null,
  tenantName?: string | null,
): string {
  let cleanPhone = (targetPhone || '').replace(/[^0-9]/g, '');
  if (!cleanPhone) return '';

  // En Venezuela números locales suelen escribirse como 0414... (11 dígitos)
  if (cleanPhone.startsWith('04') && cleanPhone.length === 11) {
    cleanPhone = '58' + cleanPhone.slice(1);
  }

  const name = tenantName ? ` de *${tenantName}*` : '';
  const message = `Hola, estoy revisando el catálogo digital${name} y quisiera solicitar información sobre disponibilidad y pedidos.`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

