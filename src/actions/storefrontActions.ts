'use server';

import { getPayload } from 'payload';
import config from '@payload-config';
import { headers } from 'next/headers';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { nextDocumentNumber } from '@/utilities/documentNumbering';
import { withTransaction } from '@/utilities/withTransaction';
import { ensureShareToken } from '@/utilities/shareTokens';
import {
  createStorefrontQuoteSchema,
  calculateStorefrontQuoteTotals,
  buildStorefrontWhatsAppUrl,
  type CreateStorefrontQuoteInput,
} from '@/utilities/storefrontQuotes';

/**
 * ─── Sprint 50/51: Motor de Cotización B2B y Recepción de Pedidos Públicos ────
 *
 * Server Action pública para el portal de pedidos B2B (estilo ERPNext / Vercel Commerce).
 * En Next.js 15+, los módulos con 'use server' sólo pueden exportar funciones async.
 * Los schemas Zod, interfaces y helpers puros viven en src/utilities/storefrontQuotes.ts.
 */

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
        origin: 'storefront',
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
