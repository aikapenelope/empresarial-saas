import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface BusinessFiltersBarProps {
  /** Ruta base de la vista (p. ej. `/${tenantSlug}/erp/invoices`). */
  basePath: string;
  /** Valores actuales tal como vienen en la URL (searchParams ya validados). */
  current: {
    from?: string;
    to?: string;
    status?: string;
  };
  /** Opciones del filtro de estado con valor/label. */
  statusOptions: Array<{ value: string; label: string }>;
  /** Nombre del parámetro URL del select (default 'status'; cobros usa 'method'). */
  filterName?: string;
  /** Etiqueta del campo de estado (p. ej. "Estado"). */
  statusLabel?: string;
  /** Parámetros adicionales a preservar en inputs ocultos y enlaces de paginación. */
  extraHiddenParams?: Record<string, string | undefined>;
  /** Metadatos de paginación para el bloque de navegación. */
  pagination?: {
    page: number;
    totalPages: number;
    totalDocs: number;
  };
}

/**
 * Barra de filtros de negocio compartida (Sprint 39): rango de fechas
 * (calendario Venezuela UTC-4) + estado, vía form GET server-side — cero JS,
 * mismo patrón del kardex. Incluye el bloque de paginación con links que
 * preservan los filtros activos.
 */
export function BusinessFiltersBar({
  basePath,
  current,
  statusOptions,
  statusLabel = 'Estado',
  filterName = 'status',
  extraHiddenParams,
  pagination,
}: BusinessFiltersBarProps) {
  const buildQuery = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const filterValue = (current as Record<string, unknown>)[filterName];
    const merged: Record<string, string | number | undefined> = {
      from: current.from,
      to: current.to,
      ...(filterName !== 'status' ? { [filterName]: filterValue as string | undefined } : { status: current.status }),
      ...extraHiddenParams,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  };

  const filterSelectClass =
    'w-full rounded-lg border border-input bg-background px-2 py-2 text-foreground text-xs';

  return (
    <>
      <form
        method="get"
        className="rounded-xl border border-border bg-card p-4 grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs"
      >
        <div>
          <label className="block font-semibold text-foreground mb-1" htmlFor="filter-from">
            Desde
          </label>
          <Input type="date" id="filter-from" name="from" defaultValue={current.from || ''} />
        </div>
        <div>
          <label className="block font-semibold text-foreground mb-1" htmlFor="filter-to">
            Hasta
          </label>
          <Input type="date" id="filter-to" name="to" defaultValue={current.to || ''} />
        </div>
        {statusOptions.length > 0 && (
          <div>
            <label className="block font-semibold text-foreground mb-1" htmlFor={`filter-${filterName}`}>
              {statusLabel}
            </label>
            <select
              id={`filter-${filterName}`}
              name={filterName}
              defaultValue={(current as Record<string, unknown>)[filterName] as string || ''}
              className={filterSelectClass}
            >
              <option value="">Todos</option>
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {extraHiddenParams &&
          Object.entries(extraHiddenParams).map(([key, val]) =>
            val !== undefined && val !== '' ? (
              <input key={key} type="hidden" name={key} value={val} />
            ) : null,
          )}
        <div className="flex items-end gap-2 sm:col-span-2">
          <Button type="submit" size="sm">
            Filtrar
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <a href={basePath}>Limpiar</a>
          </Button>
        </div>
      </form>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {pagination.totalDocs} documento(s) · página {pagination.page} de{' '}
            {pagination.totalPages}
          </span>
          <div className="flex items-center gap-2">
            {pagination.page > 1 ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`${basePath}${buildQuery({ page: pagination.page - 1 })}`}>
                  ← Anterior
                </Link>
              </Button>
            ) : (
              <span />
            )}
            {pagination.page < pagination.totalPages ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`${basePath}${buildQuery({ page: pagination.page + 1 })}`}>
                  Siguiente →
                </Link>
              </Button>
            ) : (
              <span />
            )}
          </div>
        </div>
      )}
    </>
  );
}
