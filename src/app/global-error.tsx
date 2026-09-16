'use client';

import React, { useEffect } from 'react';
import { ErrorBoundaryView } from '@/components/erp/ErrorBoundaryView';
import './(app)/globals.css';

/**
 * ─── Global Error Boundary (Sprint 46) ─────────────────────────────────────
 *
 * Última línea de defensa en Next.js App Router. Captura errores producidos
 * en el RootLayout y en la capa global de la aplicación.
 *
 * Debe incluir sus propias etiquetas <html> y <body> porque reemplaza el
 * layout raíz cuando se activa.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError Boundary]', error);
  }, [error]);

  return (
    <html lang="es">
      <body className="antialiased min-h-screen bg-background text-foreground">
        <ErrorBoundaryView
          error={error}
          reset={reset}
          title="Fallo crítico de la aplicación"
          backUrl="/"
          backLabel="Reiniciar al inicio"
        />
      </body>
    </html>
  );
}
