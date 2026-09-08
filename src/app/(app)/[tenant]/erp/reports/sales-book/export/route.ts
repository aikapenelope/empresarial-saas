import { getPayload } from 'payload';
import config from '@payload-config';
import { getTenantBySlug, SALES_BOOK_STATUSES } from '@/utilities/erpData';
import { ErpAccessError, requireErpTenantAccess } from '@/utilities/erpAuth';
import { buildBusinessDateRange, businessDateRangeSchema } from '@/utilities/erpValidation';
import { csvCell } from '@/utilities/csv';
import type { Where } from 'payload';
import type { Invoice } from '@/payload-types';

/**
 * Export CSV del Libro de Ventas del período (Sprint 39): facturas EMITIDAS
 * (mismo predicado SALES_BOOK_STATUSES que el preview — sin borradores ni
 * anuladas) por fecha de emisión, con tasa snapshot y contravalor VES
 * histórico. Route handler server-side (streaming nativo de Next) — mismo
 * patrón de la plantilla de inventario.
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
    // El usuario verificado viaja a la Local API: con `overrideAccess:false`
    // el control de acceso de la colección necesita la identidad real.
    const user = await requireErpTenantAccess(tenant.id);

    // Mismo contrato que las páginas RSC: una fecha malformada se descarta en
    // lugar de llegar a `toISOString()` y responder 500.
    const { searchParams } = new URL(request.url);
    const q = businessDateRangeSchema.parse({
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
    });

    const and: Where[] = [
      { tenant: { equals: tenant.id } },
      { status: { in: [...SALES_BOOK_STATUSES] } },
    ];
    and.push(...buildBusinessDateRange(q.from, q.to, 'issueDate'));

    const res = await payload.find({
      collection: 'invoices',
      where: { and },
      depth: 1,
      limit: 5000,
      pagination: false,
      sort: '-createdAt',
      user,
      overrideAccess: false,
    });

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
          csvCell(inv.invoiceNumber),
          csvCell(customerName),
          inv.paymentTerms,
          inv.status,
          money(inv.totalUSD),
          money(inv.totalVES),
          money(inv.exchangeRateSnapshot),
        ].join(','),
      );
    }

    const csv = lines.join('\n');
    const suffix = q.from || q.to ? `-${q.from || 'ini'}-a-${q.to || 'hoy'}` : '';
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
