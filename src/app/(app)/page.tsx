import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="max-w-2xl text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
          Sprint 0 · Cimientos Canónicos
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
          Empresarial SaaS
        </h1>
        <p className="text-base sm:text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
          Plataforma ERP Modular Multi-Tenant impulsada por{' '}
          <span className="text-white font-medium">Payload CMS 3.x</span>,{' '}
          <span className="text-white font-medium">Next.js 15</span> y{' '}
          <span className="text-white font-medium">Supabase PostgreSQL</span>.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href="/admin"
            className="w-full sm:w-auto px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2"
          >
            Acceder al Panel Administrativo
            <span aria-hidden="true">&rarr;</span>
          </Link>
          <a
            href="https://github.com/aikapenelope/empresarial-saas"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-6 py-3 rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-300 font-semibold transition-all flex items-center justify-center"
          >
            Ver Repositorio
          </a>
        </div>

        <div className="pt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left border-t border-slate-800/80">
          <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-800">
            <h3 className="font-semibold text-white text-sm">Multi-Tenancy Nativo</h3>
            <p className="text-xs text-slate-400 mt-1">Aislamiento estricto a nivel de fila por inquilino mediante plugin oficial.</p>
          </div>
          <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-800">
            <h3 className="font-semibold text-white text-sm">Transaction Pooler</h3>
            <p className="text-xs text-slate-400 mt-1">Optimizado para Vercel Serverless con Supabase puerto 6543.</p>
          </div>
          <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-800">
            <h3 className="font-semibold text-white text-sm">Arquitectura Canónica</h3>
            <p className="text-xs text-slate-400 mt-1">100% nativo de Payload 3.x sin hacks ni workarounds.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
