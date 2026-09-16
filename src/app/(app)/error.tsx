'use client';

import React, { useEffect } from 'react';
import { ErrorBoundaryView } from '@/components/erp/ErrorBoundaryView';

/**
 * ─── Root Error Boundary para el grupo (app) (Sprint 46) ───────────────────
 *
 * Captura excepciones no controladas en páginas públicas, selector de empresa,
 * login y páginas fuera del AppShell del ERP.
 *
 * Especialmente importante ante caídas temporales de Supabase o falta de red,
 * evitando que Next.js renderice una pantalla 500 genérica en blanco o con
 * digest incomprensible para el usuario.
 */
export default function AppRootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[AppRootError Boundary]', error);
  }, [error]);

  return (
    <ErrorBoundaryView
      error={error}
      reset={reset}
      title="Problema de acceso al servicio"
      backUrl="/"
      backLabel="Volver al inicio"
    />
  );
}
