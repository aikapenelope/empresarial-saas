'use client';

import React from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Botón de impresión (Client Component): window.print requiere un handler de
 * evento, imposible en un Server Component. La página lo renderiza desde el
 * encabezado manteniendo el resto como RSC.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => window.print()}
      className="no-print"
    >
      <Printer className="h-3.5 w-3.5 mr-1" />
      <span>{label}</span>
    </Button>
  );
}
