"use client";

import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * Tema del ERP: sólo claro y negro (decisión de producto), sin "system".
 * Oscuro por defecto — el modo claro queda disponible desde el menú de
 * usuario. El admin de Payload usa su propio html/layout: no se afecta.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
