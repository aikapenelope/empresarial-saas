'use client';

import React, { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ErrorBoundaryView } from '@/components/erp/ErrorBoundaryView';

/**
 * ─── ERP Section Error Boundary (Sprint 46) ────────────────────────────────
 *
 * Captura excepciones dentro del espacio de trabajo del ERP de un inquilino
 * (/orders, /invoices, /inventory, /customers, /treasury, etc.).
 *
 * Permite reintentar la operación con reset(), recargar la vista o volver
 * al panel principal del ERP del inquilino sin perder el contexto de empresa.
 */
export default function ErpSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const tenantSlug = typeof params?.tenant === 'string' ? params.tenant : undefined;
  const backUrl = tenantSlug ? `/${tenantSlug}/erp` : '/';

  useEffect(() => {
    console.error('[ErpSectionError Boundary]', error);
  }, [error]);

  return (
    <div className="p-4 md:p-6 w-full max-w-4xl mx-auto">
      <ErrorBoundaryView
        error={error}
        reset={reset}
        title="Error al cargar la sección del ERP"
        backUrl={backUrl}
        backLabel={tenantSlug ? 'Volver al panel de la empresa' : 'Volver al inicio'}
      />
    </div>
  );
}
