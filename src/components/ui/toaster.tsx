"use client";

import { useTheme } from 'next-themes';
import { Toaster as SonnerToaster } from 'sonner';

/** Toaster de sonner sincronizado con el tema claro/negro del ERP. */
export function Toaster() {
  const { theme } = useTheme();
  return <SonnerToaster theme={theme as 'light' | 'dark'} position="top-right" richColors closeButton />;
}
