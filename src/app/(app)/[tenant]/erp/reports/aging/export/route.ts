import { getTenantBySlug, getCustomersWithDebt } from '@/utilities/erpData';
import {
  ErpAccessError,
  requireErpTenantAccess,
  ERP_REPORT_ROLES,
} from '@/utilities/erpAuth';
import { csvCell } from '@/utilities/csv';

/**
 * Export CSV de la cartera por antigüedad (Sprint 39): padrón completo con
 * ledger vigente (deuda, vencida y buckets). Los campos ledger los mantienen
 * los hooks transaccionales de pagos.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ tenant: string }> },
) {
  try {
    const { tenant: tenantSlug } = await context.params;

    const tenant = await getTenantBySlug(tenantSlug);
    if (!tenant) {
      return Response.json({ error: 'Inquilino no encontrado.' }, { status: 404 });
    }

    // El padrón completo con saldos es sensible: reservado a los roles
    // administrativos ANTES de consultar (el vendedor conserva su cartera
    // acotada a su canal en la vista de CxC, no este export tenant-wide).
    await requireErpTenantAccess(tenant.id, ERP_REPORT_ROLES);

    const customers = await getCustomersWithDebt(tenant.id);

    const money = (v: unknown) => Number(v || 0).toFixed(2);

    const lines: string[] = [
      'cliente,rif,telefono,segmento,deuda_usd,vencida_usd,aging_0_30,aging_31_60,aging_60_plus,limite_credito,dias_credito',
    ];
    for (const c of customers) {
      lines.push(
        [
          csvCell(c.name),
          csvCell(c.taxId),
          csvCell(c.phone || ''),
          c.status || 'general',
          money(c.currentDebtUSD),
          money(c.overdueDebtUSD),
          money(c.aging0to30),
          money(c.aging31to60),
          money(c.aging60Plus),
          money(c.creditLimitUSD),
          String(Number(c.creditDays) || 0),
        ].join(','),
      );
    }

    const csv = lines.join('\n');
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cartera-antiguedad-${tenantSlug}.csv"`,
      },
    });
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error('[aging-export]', error);
    return Response.json({ error: 'No se pudo generar el export.' }, { status: 500 });
  }
}
