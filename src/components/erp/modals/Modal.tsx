'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/utilities/cn';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

/**
 * Wrapper del Dialog oficial de shadcn con la API pública histórica del ERP
 * (isOpen/onClose/title/description/maxWidth): los 22 modales del sistema no
 * cambiaron al migrar el contenedor. Escape, cierre por overlay, bloqueo de
 * scroll y botón de cierre los provee el Dialog de Radix/shadcn de forma
 * nativa (el Modal artesanal los reimplementaba a mano).
 */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'lg',
}: ModalProps) {
  const maxWidthClass = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
    '2xl': 'sm:max-w-2xl',
  }[maxWidth];

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={cn(
          // Formularios largos (tablas de líneas, adjuntos): scroll interno
          // con techo del 90% del viewport, igual que el modal anterior.
          'max-h-[90dvh] overflow-y-auto',
          maxWidthClass,
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-bold tracking-tight">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
