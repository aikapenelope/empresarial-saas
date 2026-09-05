import { getAllTenants } from '@/utilities/erpData';
import { getLiveExchangeRates } from '@/utilities/exchangeRate';
import { formatVES } from '@/components/erp/KpiCard';
import { Sparkles, ShieldCheck, Cpu, Database, LogIn } from 'lucide-react';
import { HomeTenantList } from '@/components/erp/HomeTenantList';
import Link from 'next/link';
import { ErpAccessError } from '@/utilities/erpAuth';

export default async function HomePage() {
  // Anti-enumeración: el listado de empresas exige sesión. Anónimos ven el hero
  // con un CTA de inicio de sesión, nunca nombres ni slugs de inquilinos.
  const [tenantListResult, liveRates] = await Promise.all([
    getAllTenants()
      .then((tenants) => ({ ok: true as const, tenants }))
      .catch((error: unknown) => {
        if (error instanceof ErpAccessError) return { ok: false as const };
        throw error;
      }),
    getLiveExchangeRates(),
  ]);

  const tenants = tenantListResult.ok ? tenantListResult.tenants : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-6 sm:p-12 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Top Banner Ticker */}
      <div className="w-full max-w-5xl flex items-center justify-between border-b border-slate-800/80 pb-4 mb-8">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-extrabold text-base tracking-tight text-white">Cendaro ERP</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase">
            SaaS Bimonetario
          </span>
        </div>

        {liveRates.bcv && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Tasa Oficial BCV:</span>
            <span className="font-mono font-bold text-emerald-400">{formatVES(liveRates.bcv)}</span>
          </div>
        )}
      </div>

      {/* Hero Section */}
      <div className="max-w-3xl text-center space-y-6 my-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
          Next.js 15 · Payload CMS 3.x · Supabase Postgres
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-300 bg-clip-text text-transparent">
          Plataforma ERP Operativa de Alta Densidad
        </h1>

        <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Gestión empresarial bimonetaria (USD/VES), control de inventario y fórmulas de producción BOM, cuentas por cobrar con cobranza directa por WhatsApp y arqueo ciego de cajas registradoras.
        </p>

        {/* Empresas Registradas & Modal de Creación (requiere sesión) */}
        {tenants ? (
          <HomeTenantList tenants={tenants} />
        ) : (
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-all"
          >
            <LogIn className="h-4 w-4" />
            <span>Iniciar Sesión para ver sus Empresas</span>
          </Link>
        )}
      </div>

      {/* Feature Pills Footer */}
      <div className="w-full max-w-5xl pt-12 mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-800/80 text-left">
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-1">
          <div className="flex items-center gap-2 text-white font-semibold text-xs">
            <Database className="h-4 w-4 text-indigo-400" />
            <span>0 ms Latencia de Red</span>
          </div>
          <p className="text-[11px] text-slate-400">
            UI operativa construida con React Server Components consumiendo la Payload Local API en el mismo proceso.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-1">
          <div className="flex items-center gap-2 text-white font-semibold text-xs">
            <Cpu className="h-4 w-4 text-emerald-400" />
            <span>Bimonetariedad Nativa</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Precios, balances y facturación en USD con contravalor en Bolívares sincronizado a la tasa del día.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-1">
          <div className="flex items-center gap-2 text-white font-semibold text-xs">
            <ShieldCheck className="h-4 w-4 text-amber-400" />
            <span>Aislamiento Multi-Tenant</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Gobernado a nivel de fila por el plugin oficial con credenciales independientes por inquilino.
          </p>
        </div>
      </div>
    </main>
  );
}
