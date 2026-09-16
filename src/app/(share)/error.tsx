'use client';

import React, { useEffect } from 'react';
import { ErrorBoundaryView } from '@/components/erp/ErrorBoundaryView';

/**
 * ─── Share Section Error Boundary (Sprint 46) ──────────────────────────────
 *
 * Captura excepciones en los enlaces públicos de documentos compartidos
 * (/share/[kind]/[token]). Muestra un estado limpio y comprensible para clientes
 * externos si la base de datos o el servicio están momentáneamente inaccesibles.
 */
export default function ShareError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ShareError Boundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <ErrorBoundaryView
        error={error}
        reset={reset}
        title="Documento no disponible temporalmente"
        backUrl="/"
        backLabel="Ir a la portada de Empresarial"
      />
    </div>
  );
}
