import { getPayload } from 'payload';
import config from '@payload-config';
import { getTenantBySlug } from '@/utilities/erpData';
import { ErpAccessError, requireErpTenantAccess } from '@/utilities/erpAuth';
import { buildBusinessDateRange } from '@/utilities/erpValidation';
import type { Where } from 'payload';
import type { Invoice } from '@/payload-types';

/**
 * Export CSV del Libro de Ventas del período (Sprint 39): facturas no anuladas
 * con tasa snapshot y contravalor VES histórico. Route handler server-side
 * (streaming nativo de Next) — mismo patrón de la plantilla de inventario.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ tenant: string }> },
) {
  try {
    const { tenant: tenantSlug } = await context.params;
    const payload = await getPayload({ config });

    const tenant = await getTenantBySlug(tenantSlug);
    if (!tenant) {
      return Response.json({ error: 'Inquilino no encontrado.' }, { status: 404 });
    }

    // Operadores autorizados (la vista de facturas ya exige sesión del tenant).
    await requireErpTenantAccess(tenant.id);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;

    const and: Where[] = [
      { tenant: { equals: tenant.id } },
      { status: { not_equals: 'voided' } },
    ];
    and.push(...buildBusinessDateRange(from, to));

    const res = await payload.find({
      collection: 'invoices',
      where: { and },
      depth: 1,
      limit: 5000,
      pagination: false,
      sort: '-createdAt',
      overrideAccess: false,
    });

    const csvEscape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const money = (v: unknown) => Number(v || 0).toFixed(2);

    const lines: string[] = [
      'fecha,factura,cliente,condicion,estado,total_usd,total_ves,tasa_snapshot',
    ];
    for (const inv of res.docs as Invoice[]) {
      const customerName =
        typeof inv.customer === 'object' && inv.customer !== null
          ? (inv.customer as { name: string }).name
          : 'Cliente';
      lines.push(
        [
          new Date(inv.issueDate).toISOString().slice(0, 10),
          csvEscape(inv.invoiceNumber),
          csvEscape(customerName),
          inv.paymentTerms,
          inv.status,
          money(inv.totalUSD),
          money(inv.totalVES),
          money(inv.exchangeRateSnapshot),
        ].join(','),
      );
    }

    const csv = lines.join('\n');
    const suffix = from || to ? `-${from || 'ini'}-a-${to || 'hoy'}` : '';
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="libro-ventas-${tenantSlug}${suffix}.csv"`,
      },
    });
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error('[sales-book-export]', error);
    return Response.json({ error: 'No se pudo generar el export.' }, { status: 500 });
  }
}
