'use client';

import React from 'react';
import { Printer } from 'lucide-react';

/**
 * Botón de impresión (Client Component): window.print requiere un handler de
 * evento, imposible en un Server Component. La página lo renderiza desde el
 * encabezado manteniendo el resto como RSC.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
    >
      <Printer className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}
