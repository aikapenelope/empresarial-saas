import { getPayload } from 'payload';
import config from '@payload-config';
import type { Where } from 'payload';
import { getTenantBySlug } from '@/utilities/erpData';
import {
  ErpAccessError,
  requireErpTenantAccess,
  ERP_REPORT_ROLES,
} from '@/utilities/erpAuth';
import {
  buildBusinessDateRange,
  businessDateRangeSchema,
  formatBusinessDate,
} from '@/utilities/erpValidation';
import { csvCell } from '@/utilities/csv';
import type { StockMovement } from '@/payload-types';

const TYPE_LABELS: Record<string, string> = {
  purchase_in: 'Entrada por Compra',
  sale_out: 'Salida por Venta',
  sale_return: 'Devolución de Venta',
  production_consume: 'Consumo Producción',
  production_output: 'Producto Fabricado',
  transfer: 'Transferencia',
  adjustment_positive: 'Ajuste (+)',
  adjustment_negative: 'Ajuste (−)',
  scrap: 'Merma',
};

/**
 * Export CSV del Kardex (Sprint 39): movimientos del período con producto,
 * almacenes, cantidad y costo. `pagination:false` trae el conjunto completo
 * filtrado (hasta el límite) en una sola consulta. El kardex es una bitácora
 * inmutable: su período se define por `createdAt` (a diferencia de los
 * documentos de venta, que usan la fecha de emisión).
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

    // El kardex completo del inquilino es un reporte tenant-wide: reservado a
    // los roles administrativos (mismo RBAC que la página de reportes). El
    // usuario verificado viaja a la Local API: con `overrideAccess:false` el
    // control de acceso de la colección necesita la identidad real.
    const user = await requireErpTenantAccess(tenant.id, ERP_REPORT_ROLES);

    // Mismo contrato que las páginas RSC: una fecha malformada se descarta en
    // lugar de llegar a `toISOString()` y responder 500.
    const { searchParams } = new URL(request.url);
    const q = businessDateRangeSchema.parse({
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
    });

    const and: Where[] = [{ tenant: { equals: tenant.id } }];
    and.push(...buildBusinessDateRange(q.from, q.to, 'createdAt'));

    const res = await payload.find({
      collection: 'stock-movements',
      where: { and },
      depth: 1,
      limit: 10000,
      pagination: false,
      sort: '-createdAt',
      user,
      overrideAccess: false,
    });

    const lines: string[] = [
      'fecha,referencia,tipo,producto,origen,destino,cantidad,costo_usd',
    ];
    for (const m of res.docs as StockMovement[]) {
      const productName =
        typeof m.product === 'object' && m.product !== null ? m.product.name : `#${m.product}`;
      const sourceName =
        typeof m.sourceWarehouse === 'object' && m.sourceWarehouse !== null
          ? m.sourceWarehouse.name
          : '';
      const targetName =
        typeof m.targetWarehouse === 'object' && m.targetWarehouse !== null
          ? m.targetWarehouse.name
          : '';
      lines.push(
        [
          formatBusinessDate(m.createdAt),
          csvCell(m.reference),
          TYPE_LABELS[m.movementType] || m.movementType,
          csvCell(productName),
          csvCell(sourceName),
          csvCell(targetName),
          String(m.quantity),
          Number(m.totalCostUSD || 0).toFixed(2),
        ].join(','),
      );
    }

    const csv = lines.join('\n');
    const suffix = q.from || q.to ? `-${q.from || 'ini'}-a-${q.to || 'hoy'}` : '';
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="kardex-${tenantSlug}${suffix}.csv"`,
      },
    });
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error('[kardex-export]', error);
    return Response.json({ error: 'No se pudo generar el export.' }, { status: 500 });
  }
}
