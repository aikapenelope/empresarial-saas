import React from 'react';
import { cn } from '@/utilities/cn';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'emerald' | 'amber' | 'rose' | 'indigo' | 'slate' | 'blue';
  size?: 'sm' | 'md';
  /** Punto de color a la izquierda (estilo Dashboard 4 para estados vivos). */
  dot?: boolean;
  className?: string;
}

/**
 * Badge del ERP sobre tokens bimodales (Fase 8 / Sprint 35).
 * Misma API pública de siempre (variantes emerald/amber/rose/indigo/blue/slate);
 * los colores de ESTADO ahora tienen par claro/oscuro para contraste AA y los
 * decorativos (indigo/blue/slate) usan tokens semánticos del design system.
 */
export function Badge({ children, variant = 'slate', size = 'sm', dot, className }: BadgeProps) {
  const variantStyles = {
    emerald:
      'border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400',
    amber:
      'border-amber-600/25 bg-amber-500/10 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400',
    rose: 'border-rose-600/25 bg-rose-500/10 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400',
    indigo: 'border-border bg-muted text-muted-foreground',
    blue: 'border-border bg-muted text-foreground',
    slate: 'border-border bg-secondary/60 text-secondary-foreground',
  };

  const dotStyles = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    indigo: 'bg-foreground/50',
    blue: 'bg-foreground/60',
    slate: 'bg-foreground/40',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full border',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotStyles[variant])} />}
      {children}
    </span>
  );
}
