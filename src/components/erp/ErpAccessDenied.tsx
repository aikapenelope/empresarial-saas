import React from 'react';
import Link from 'next/link';

interface ErpAccessDeniedProps {
  status: 401 | 403;
}

/**
 * Pantalla de bloqueo del ERP: 401 sin sesión, 403 sin pertenencia al inquilino.
 * El control real se aplica en la capa de datos (erpData/erpActions); esto es la UX.
 */
export function ErpAccessDenied({ status }: ErpAccessDeniedProps) {
  const isUnauthenticated = status === 401;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-950 text-white">
      <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center space-y-4">
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-xl border ${
            isUnauthenticated
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
          }`}
        >
          !
        </div>
        <h2 className="text-xl font-bold">
          {isUnauthenticated ? 'Sesión requerida' : 'Acceso denegado'}
        </h2>
        <p className="text-sm text-slate-400">
          {isUnauthenticated
            ? 'Debe iniciar sesión para acceder al ERP operativo.'
            : 'Su usuario no pertenece a este inquilino. Solicite acceso al administrador de la empresa.'}
        </p>
        <div className="pt-2">
          <Link
            href="/admin"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all w-full"
          >
            {isUnauthenticated ? 'Iniciar Sesión' : 'Volver al Panel'}
          </Link>
        </div>
      </div>
    </main>
  );
}
