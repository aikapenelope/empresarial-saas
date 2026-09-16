'use server';

import { z } from 'zod';
import { getPayload } from 'payload';
import config from '@payload-config';
import { headers } from 'next/headers';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { nextDocumentNumber } from '@/utilities/documentNumbering';
import { withTransaction } from '@/utilities/withTransaction';
import { ensureShareToken } from '@/utilities/shareTokens';

/**
 * ─── Sprint 50: Motor de Cotización B2B y Recepción de Pedidos Públicos ───────
 *
 * Server Action pública para el portal de pedidos B2B (estilo ERPNext / Vercel Commerce).
 * No requiere sesión de usuario en el ERP, pero aplica validaciones rigurosas en la frontera:
 *  1. Comprobación estricta de que el inquilino tiene el portal encendido (`storefrontConfig.enabled === true`).
 *  2. Anti-tampering: los precios nunca se aceptan del cliente; se consultan y congelan desde la BD oficial.
 *  3. Auto-asociación o creación de cliente en el CRM (`customers`) con lock transaccional.
 *  4. Generación de correlativo oficial COT-XXXXX y congelación de tasa BCV.
 *  5. Emisión de token seguro de compartición (CSPRNG) y enlace directo a WhatsApp (`wa.me`).
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

export interface CreateStorefrontQuoteResult {
  ok: true;
  quoteId: number;
  quoteNumber: string;
  totalUSD: number;
  totalVES: number;
  shareToken: string;
  shareUrl: string;
  whatsappUrl: string;
}

/**
 * Server Action principal para registrar un pedido/cotización desde el catálogo web.
 */
export async function createStorefrontQuoteAction(
  input: CreateStorefrontQuoteInput,
): Promise<CreateStorefrontQuoteResult> {
  const parsed = createStorefrontQuoteSchema.parse(input);
  const payload = await getPayload({ config });

  // 1. Verificar inquilino y activación del portal
  const tenantDocs = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: parsed.tenantSlug } },
    limit: 1,
    depth: 0,
  });

  const tenant = tenantDocs.docs[0];
  if (!tenant) {
    throw new Error('Empresa no encontrada.');
  }

  if (!tenant.storefrontConfig?.enabled) {
    throw new Error('El portal de pedidos no está habilitado para esta empresa.');
  }

  const tenantId = tenant.id;

  // 2. Consultar productos del catálogo activos y publicados en la web
  const requestedProductIds = Array.from(new Set(parsed.items.map((i) => i.productId)));
  const productsResult = await payload.find({
    collection: 'products',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { id: { in: requestedProductIds } },
        { isActive: { equals: true } },
        { isPublishedOnWeb: { equals: true } },
      ],
    },
    limit: requestedProductIds.length,
    depth: 0,
  });

  // 3. Resolver tasa de cambio oficial vigente para el inquilino
  const rateResult = await resolveEffectiveRate(
    tenant.currencyConfig
      ? {
          manualExchangeRate: tenant.currencyConfig.manualExchangeRate ?? undefined,
          autoSyncRate: tenant.currencyConfig.autoSyncRate ?? undefined,
        }
      : undefined,
  );
  const rate = rateResult.rate;

  // 4. Calcular totales inmutables con los precios de la BD
  const { lineItems, totalUSD, totalVES } = calculateStorefrontQuoteTotals(
    parsed.items,
    productsResult.docs.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      priceUSD: p.priceUSD,
    })),
    rate,
  );

  // 5. Transacción atómica de escritura (Customer + Quote + Correlativo)
  const transactionResult = await withTransaction(payload, undefined, async (req) => {
    // Resolver o registrar el cliente en el CRM
    let customerId: number;
    const existingCustomers = await payload.find({
      collection: 'customers',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { taxId: { equals: parsed.taxId } },
        ],
      },
      limit: 1,
      depth: 0,
      req,
    });

    if (existingCustomers.docs.length > 0) {
      customerId = existingCustomers.docs[0].id;
    } else {
      const newCustomer = await payload.create({
        collection: 'customers',
        data: {
          tenant: tenantId,
          name: parsed.companyName,
          taxId: parsed.taxId,
          phone: parsed.phone,
          email: parsed.email || undefined,
          status: 'lead',
          priceTier: 'retail',
        },
        req,
      });
      customerId = newCustomer.id;
    }

    // Numeración oficial COT-XXXXX
    const quoteNumber = await nextDocumentNumber(
      payload,
      'quotes',
      tenantId,
      'COT',
      req,
    );

    const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const notesSummary = `[Pedido Web B2B] Empresa: ${parsed.companyName} | RIF: ${parsed.taxId} | Teléfono: ${parsed.phone}${
      parsed.notes ? `\nObservaciones: ${parsed.notes}` : ''
    }`;

    const quote = await payload.create({
      collection: 'quotes',
      data: {
        tenant: tenantId,
        quoteNumber,
        customer: customerId,
        items: lineItems,
        issueDate: new Date().toISOString(),
        validUntil,
        status: 'draft',
        exchangeRateSnapshot: rate,
        notes: notesSummary,
      },
      req,
    });

    return {
      quoteId: quote.id,
      quoteNumber,
      totalUSD,
      totalVES,
    };
  });

  // 6. Emitir token de compartición
  const shareToken = await ensureShareToken(payload, 'quotes', transactionResult.quoteId);

  // 7. Resolver URL pública y enlace de WhatsApp
  const headerList = await headers();
  const host = headerList.get('host') || 'localhost:3000';
  const protocol = headerList.get('x-forwarded-proto') || 'https';
  const origin = `${protocol}://${host}`;
  const shareUrl = `${origin}/share/quote/${shareToken}`;

  const targetWhatsApp =
    tenant.storefrontConfig?.whatsappOrdersNumber || tenant.phone || '';

  const whatsappUrl = buildStorefrontWhatsAppUrl({
    targetPhone: targetWhatsApp,
    quoteNumber: transactionResult.quoteNumber,
    companyName: parsed.companyName,
    taxId: parsed.taxId,
    totalUSD: transactionResult.totalUSD,
    totalVES: transactionResult.totalVES,
    shareUrl,
  });

  return {
    ok: true,
    quoteId: transactionResult.quoteId,
    quoteNumber: transactionResult.quoteNumber,
    totalUSD: transactionResult.totalUSD,
    totalVES: transactionResult.totalVES,
    shareToken,
    shareUrl,
    whatsappUrl,
  };
}
