import { getPayload } from 'payload';
import config from '@payload-config';
import { requireErpTenantAccess, ErpAccessError } from '@/utilities/erpAuth';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';

/**
 * Reporte de revisión de precios por tasa (Sprint 11). Sin auto-aplicación:
 * el margen se fija en USD y el VES es derivado con la tasa snapshot de cada
 * documento. Este reporte le da al administrador la lista de precios sugeridos
 * en VES con la tasa vigente para decidir ajustes (que luego aplica por admin
 * o importación; cada cambio queda en price-history).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { tenantId?: number };
    const tenantId = Number(body.tenantId);
    if (!tenantId) {
      return Response.json({ error: 'tenantId es requerido.' }, { status: 400 });
    }

    const user = await requireErpTenantAccess(tenantId);
    if (user.role !== 'super-admin' && user.role !== 'tenant-admin') {
      return Response.json(
        { error: 'Prohibido: solo super-admin o tenant-admin pueden generar el reporte.' },
        { status: 403 },
      );
    }

    const payload = await getPayload({ config });

    const [productsRes, rateResult] = await Promise.all([
      payload.find({
        collection: 'products',
        where: { tenant: { equals: tenantId } },
        pagination: false,
        depth: 0,
        sort: 'sku',
        user,
        overrideAccess: false,
      }),
      resolveEffectiveRate(),
    ]);

    const rate = rateResult.rate;
    const products = productsRes.docs.map((p) => ({
      sku: p.sku,
      name: p.name,
      priceUSD: Number(p.priceUSD) || 0,
      suggestedPriceVES: Number(((Number(p.priceUSD) || 0) * rate).toFixed(2)),
      tiers: (p.priceTiers || []).map((t) => ({
        tier: t.tier,
        priceUSD: Number(t.priceUSD) || 0,
        suggestedPriceVES: Number(((Number(t.priceUSD) || 0) * rate).toFixed(2)),
      })),
    }));

    return Response.json({
      success: true,
      effectiveRate: rate,
      rateSource: rateResult.source,
      generatedAt: new Date().toISOString(),
      totalProducts: products.length,
      products,
      note: 'Reporte informativo: el margen se fija en USD y el VES se deriva con la tasa snapshot de cada documento. Los ajustes se aplican manualmente (admin o importación) y quedan en price-history.',
    });
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error('[pricing-report]', error);
    return Response.json({ error: 'No se pudo generar el reporte de precios.' }, { status: 500 });
  }
}
