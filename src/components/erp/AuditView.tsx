import React from 'react';
import Link from 'next/link';
import { History } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { Badge } from './Badge';
import { ErpPageHeader } from './ErpPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/utilities/cn';

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

const OPERATION_LABELS: Record<string, string> = {
  create: 'creó',
  update: 'actualizó',
  delete: 'eliminó',
};

/** Iniciales del actor para el avatar (máx. 2 caracteres). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/**
 * Vista global de auditoría (Sprint 22 → feed Sprint 36). Server Component:
 * los filtros viajan por GET (mismo patrón del kardex) y se validan en la
 * página con auditFiltersSchema; paginación server-side. Presentación como
 * feed de actividad con avatar-inicial del actor.
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

  const filterSelectClass =
    'w-full rounded-lg border border-input bg-background px-2 py-2 text-foreground text-xs';

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Registro de Auditoría"
        description="Quién cambió qué, cuándo y con qué diff (bitácora inmutable del auditPlugin)."
        breadcrumbHref={`/${tenantSlug}/erp`}
        section="Auditoría"
      />

      {/* Filtros (GET — server-side) */}
      <form
        method="get"
        className="rounded-xl border border-border bg-card p-4 grid grid-cols-1 sm:grid-cols-6 gap-3 text-xs"
      >
        <div className="sm:col-span-2">
          <label className="block font-semibold text-foreground mb-1" htmlFor="audit-collection">
            Colección
          </label>
          <select
            id="audit-collection"
            name="collection"
            defaultValue={filters.collection || ''}
            className={filterSelectClass}
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
          <label className="block font-semibold text-foreground mb-1" htmlFor="audit-operation">
            Operación
          </label>
          <select
            id="audit-operation"
            name="operation"
            defaultValue={filters.operation || ''}
            className={filterSelectClass}
          >
            <option value="">Todas</option>
            <option value="create">Creación</option>
            <option value="update">Actualización</option>
            <option value="delete">Eliminación</option>
          </select>
        </div>
        <div>
          <label className="block font-semibold text-foreground mb-1" htmlFor="audit-from">
            Desde
          </label>
          <Input type="date" id="audit-from" name="from" defaultValue={filters.from || ''} />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block font-semibold text-foreground mb-1" htmlFor="audit-to">
              Hasta
            </label>
            <Input type="date" id="audit-to" name="to" defaultValue={filters.to || ''} />
          </div>
          <Button type="submit" size="sm">
            Filtrar
          </Button>
        </div>
      </form>

      {/* Feed de actividad */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Actividad Reciente</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {totalDocs} evento(s) · página {page} de {totalPages}
          </span>
        </div>

        {entries.length === 0 ? (
          <EmptyState icon={History} title="No hay eventos de auditoría con esos filtros." />
        ) : (
          <ol className="divide-y divide-border">
            {entries.map((e) => {
              const route = COLLECTION_ROUTES[e.collection];
              const docHref = e.docId != null && route ? route(tenantSlug, e.docId) : null;
              const docLabel = COLLECTION_LABELS[e.collection] || e.collection;
              return (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-bold text-foreground',
                    )}
                    aria-hidden="true"
                  >
                    {initials(e.actorName)}
                  </span>
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="text-foreground">
                      <span className="font-semibold">{e.actorName}</span>{' '}
                      {OPERATION_LABELS[e.operation] ?? e.operation}{' '}
                      {docHref ? (
                        <Link
                          href={docHref}
                          className="font-semibold underline decoration-border underline-offset-2 hover:decoration-foreground"
                        >
                          {docLabel} #{e.docId}
                        </Link>
                      ) : (
                        <span className="font-semibold">
                          {docLabel}
                          {e.docId ? ` #${e.docId}` : ''}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {e.actorRole ? `${e.actorRole} · ` : ''}
                      {new Date(e.createdAt).toLocaleString('es-VE')}
                    </p>
                  </div>
                  <Badge variant={OPERATION_VARIANT[e.operation] || 'slate'} size="sm">
                    {e.operation}
                  </Badge>
                </li>
              );
            })}
          </ol>
        )}

        {totalPages > 1 && (
          <div className="p-3 border-t border-border flex items-center justify-between text-xs">
            {page > 1 ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/${tenantSlug}/erp/audit${buildQuery({ page: page - 1 })}`}>← Anterior</Link>
              </Button>
            ) : (
              <span />
            )}
            {page < totalPages ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/${tenantSlug}/erp/audit${buildQuery({ page: page + 1 })}`}>Siguiente →</Link>
              </Button>
            ) : (
              <span />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
