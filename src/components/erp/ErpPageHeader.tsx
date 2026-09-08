import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/utilities/cn';

interface ErpPageHeaderProps {
  title: string;
  description?: string;
  /** Ruta del breadcrumb superior; por defecto el dashboard del tenant. */
  breadcrumbHref?: string;
  /** Texto del enlace del breadcrumb. */
  breadcrumbLabel?: string;
  /** Sección actual del breadcrumb (junto al enlace). */
  section?: string;
  /** Acciones a la derecha (botones, selects, etc.). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Header canónico de página ERP (Sprint 35): breadcrumb + título + descripción
 * y slot de acciones, con tokens del design system. Reemplaza el header
 * artesanal duplicado en cada vista.
 */
export function ErpPageHeader({
  title,
  description,
  breadcrumbHref,
  breadcrumbLabel = 'Dashboard',
  section,
  actions,
  className,
}: ErpPageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5',
        className,
      )}
    >
      <div>
        {breadcrumbHref && (
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={breadcrumbHref}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              {breadcrumbLabel}
            </Link>
            {section && (
              <>
                <span className="text-border">/</span>
                <span className="text-xs font-semibold text-foreground">{section}</span>
              </>
            )}
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
