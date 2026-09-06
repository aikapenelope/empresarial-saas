import { getPayload } from 'payload';
import config from '@payload-config';
import { getTenantBySlug } from '@/utilities/erpData';
import { ErpAccessError, requireErpTenantAccess } from '@/utilities/erpAuth';

/**
 * Plantilla CSV de inventario con el catálogo actual del inquilino (SKU + nombre
 * + existencia total). Sirve de base para la carga masiva: el usuario edita la
 * columna y elige modo Ajustar (Δ) o Fijar. Solo operadores autorizados.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ tenant: string }> },
) {
  try {
    const { tenant: tenantSlug } = await context.params;
    const payload = await getPayload({ config });

    const tenant = await getTenantBySlug(tenantSlug);
    if (!tenant) {
      return Response.json({ error: 'Inquilino no encontrado.' }, { status: 404 });
    }

    await requireErpTenantAccess(tenant.id);

    const products = await payload.find({
      collection: 'products',
      where: { tenant: { equals: tenant.id } },
      pagination: false,
      depth: 0,
      sort: 'sku',
      overrideAccess: false,
    });

    const lines: string[] = ['sku,nombre,existencia_total'];
    for (const p of products.docs) {
      const name = String(p.name).replace(/"/g, '""');
      lines.push(`${p.sku},"${name}",${Number(p.currentStock) || 0}`);
    }

    const csv = lines.join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="plantilla-inventario-${tenantSlug}.csv"`,
      },
    });
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error('[template-export]', error);
    return Response.json({ error: 'No se pudo generar la plantilla.' }, { status: 500 });
  }
}
