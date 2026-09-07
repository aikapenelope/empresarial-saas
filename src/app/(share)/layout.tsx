import React from 'react';
import '../(app)/globals.css';

// Grupo de rutas públicas de compartición: layout mínimo, sin sesión ni shell
// del ERP, para que un cliente que abre el enlace vea sólo el documento.
export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {children}
    </div>
  );
}
