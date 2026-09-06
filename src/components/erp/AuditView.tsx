import React from 'react';
import Link from 'next/link';
import { History } from 'lucide-react';
import { Badge } from './Badge';

export interface AuditEntryView {
  id: number;
  actorName: string;
  actorRole: string | null;
  collection: string;
  docId: number | null;
  operation: string;
  diff: Record<string, unknown> | null;
  createdAt: string;
}

const COLLECTION_ROUTES: Record<string, (tenant: string, docId: number) => string> = {
  invoices: (t, id) => `/${t}/erp/invoices/${id}`,
  orders: (t, id) => `/${t}/erp/orders/${id}`,
  'delivery-notes': (t, id) => `/${t}/erp/delivery-notes/${id}`,
  customers: (t, id) => `/${t}/erp/customers/${id}`,
};

const COLLECTION_LABELS: Record<string, string> = {
  invoices: 'Facturas',
  'customer-payments': 'Cobros',
  'purchase-invoices': 'Compras',
  'supplier-payments': 'Pagos a Proveedores',
  products: 'Productos',
  'cash-closures': 'Cierres de Caja',
  quotes: 'Cotizaciones',
  orders: 'Pedidos',
  'delivery-notes': 'Remisiones',
  tenants: 'Inquilinos',
};

const OPERATION_VARIANT: Record<string, 'emerald' | 'amber' | 'rose'> = {
  create: 'emerald',
  update: 'amber',
  delete: 'rose',
};

/**
 * Vista global de auditoría (Sprint 22). Server Component: los filtros viajan
 * por GET (mismo patrón del kardex) y se validan en la página con
 * auditFiltersSchema; paginación server-side.
 */
export function AuditView({
  tenantSlug,
  entries,
  totalDocs,
  page,
  totalPages,
  filters,
}: {
  tenantSlug: string;
  entries: AuditEntryView[];
  totalDocs: number;
  page: number;
  totalPages: number;
  filters: { collection?: string; operation?: string; from?: string; to?: string };
}) {
  const buildQuery = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { ...filters, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  };

  return (
    <div className="space-y-6">
      {/* Filtros (GET — server-side) */}
      <form
        method="get"
        className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 grid grid-cols-1 sm:grid-cols-6 gap-3 text-xs"
      >
        <div className="sm:col-span-2">
          <label className="block font-semibold text-slate-300 mb-1">Colección</label>
          <select
            name="collection"
            defaultValue={filters.collection || ''}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-2 text-white"
          >
            <option value="">Todas</option>
            {Object.entries(COLLECTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-300 mb-1">Operación</label>
          <select
            name="operation"
            defaultValue={filters.operation || ''}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-2 text-white"
          >
            <option value="">Todas</option>
            <option value="create">Creación</option>
            <option value="update">Actualización</option>
            <option value="delete">Eliminación</option>
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-300 mb-1">Desde</label>
          <input
            type="date"
            name="from"
            defaultValue={filters.from || ''}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-2 text-white"
          />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block font-semibold text-slate-300 mb-1">Hasta</label>
            <input
              type="date"
              name="to"
              defaultValue={filters.to || ''}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-2 text-white"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
          >
            Filtrar
          </button>
        </div>
      </form>

      {/* Tabla */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden backdrop-blur">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Registro de Auditoría</h2>
          </div>
          <span className="text-xs text-slate-400">
            {totalDocs} evento(s) · página {page} de {totalPages}
          </span>
        </div>

        {entries.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-10">
            No hay eventos de auditoría con esos filtros.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Actor</th>
                  <th className="p-3">Colección</th>
                  <th className="p-3">Documento</th>
                  <th className="p-3 text-center">Operación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {entries.map((e) => {
                  const route = COLLECTION_ROUTES[e.collection];
                  const docHref = e.docId != null && route ? route(tenantSlug, e.docId) : null;
                  return (
                    <tr key={e.id} className="hover:bg-slate-800/30">
                      <td className="p-3 text-slate-400 text-[11px]">
                        {new Date(e.createdAt).toLocaleString('es-VE')}
                      </td>
                      <td className="p-3">
                        <span className="text-slate-200 font-semibold">{e.actorName}</span>
                        {e.actorRole && (
                          <span className="ml-2 text-[10px] uppercase text-slate-500">{e.actorRole}</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-300">{COLLECTION_LABELS[e.collection] || e.collection}</td>
                      <td className="p-3 font-mono text-[11px] text-indigo-300">
                        {docHref ? (
                          <Link href={docHref} className="hover:text-indigo-200 underline decoration-slate-700 underline-offset-2">
                            #{e.docId}
                          </Link>
                        ) : (
                          e.docId ? `#${e.docId}` : '—'
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={OPERATION_VARIANT[e.operation] || 'slate'} size="sm">
                          {e.operation}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
            {page > 1 ? (
              <Link
                href={`/${tenantSlug}/erp/audit${buildQuery({ page: page - 1 })}`}
                className="text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                ← Anterior
              </Link>
            ) : (
              <span />
            )}
            {page < totalPages ? (
              <Link
                href={`/${tenantSlug}/erp/audit${buildQuery({ page: page + 1 })}`}
                className="text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                Siguiente →
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
