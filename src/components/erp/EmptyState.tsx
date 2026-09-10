import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** Icono de lucide-react (sin renderizar: `<EmptyState icon={FileText} … />`). */
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Slot de CTA (botón "Nuevo…" / "Registrar…" bajo el texto). */
  children?: React.ReactNode;
  className?: string;
}

/**
 * ─── EmptyState estándar (Implementaciones Estructurales, item 15) ───────────
 *
 * Reemplaza los párrafos ad-hoc de "no hay datos" dispersos por las vistas:
 * icono + título + descripción opcional + slot de CTA. Componente puro de
 * render (sin estado) — usable desde vistas cliente y páginas servidor.
 */
export function EmptyState({ icon: Icon, title, description, children, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-12 px-4 text-center', className)}>
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground max-w-sm">{description}</p>}
      {children && <div className="pt-2">{children}</div>}
    </div>
  );
}
