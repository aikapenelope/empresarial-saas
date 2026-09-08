import { getAllTenants } from '@/utilities/erpData';
import { getLiveExchangeRates } from '@/utilities/exchangeRate';
import { formatVES } from '@/components/erp/format';
import { Sparkles, ShieldCheck, Cpu, Database, LogIn } from 'lucide-react';
import { HomeTenantList } from '@/components/erp/HomeTenantList';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Link from 'next/link';
import { ErpAccessError } from '@/utilities/erpAuth';

// El contenido depende de la sesión (anti-enumeración): nunca debe
// prerenderizarse durante el build ni cachearse (patrón de los templates
// oficiales de Payload para páginas que leen sesión).
export const dynamic = 'force-dynamic';

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
    <main className="flex min-h-screen flex-col items-center justify-between p-6 sm:p-12 bg-background text-foreground">
      {/* Top Banner Ticker */}
      <div className="w-full max-w-5xl flex items-center justify-between border-b border-border pb-4 mb-8">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground border border-border">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="font-extrabold text-base tracking-tight">Cendaro ERP</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground uppercase">
            SaaS Bimonetario
          </span>
        </div>

        {liveRates.bcv && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Tasa Oficial BCV:</span>
            <span className="font-mono font-bold text-foreground">{formatVES(liveRates.bcv)}</span>
          </div>
        )}
      </div>

      {/* Hero Section */}
      <div className="max-w-3xl text-center space-y-6 my-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-border bg-muted text-muted-foreground text-xs font-semibold uppercase tracking-wider">
          Next.js 15 · Payload CMS 3.x · Supabase Postgres
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-balance">
          Plataforma ERP Operativa de Alta Densidad
        </h1>

        <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed text-pretty">
          Gestión empresarial bimonetaria (USD/VES), control de inventario y fórmulas de producción BOM, cuentas por cobrar con cobranza directa por WhatsApp y arqueo ciego de cajas registradoras.
        </p>

        {/* Empresas Registradas & Modal de Creación (requiere sesión) */}
        {tenants ? (
          <HomeTenantList tenants={tenants} />
        ) : (
          <Button size="lg" asChild>
            <Link href="/login">
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span>Iniciar Sesión para ver sus Empresas</span>
            </Link>
          </Button>
        )}
      </div>

      {/* Feature Pills Footer */}
      <div className="w-full max-w-5xl pt-12 mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-border text-left">
        <Card className="rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 font-semibold text-xs">
            <Database className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span>0 ms Latencia de Red</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            UI operativa construida con React Server Components consumiendo la Payload Local API en el mismo proceso.
          </p>
        </Card>

        <Card className="rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 font-semibold text-xs">
            <Cpu className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span>Bimonetariedad Nativa</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Precios, balances y facturación en USD con contravalor en Bolívares sincronizado a la tasa del día.
          </p>
        </Card>

        <Card className="rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 font-semibold text-xs">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span>Aislamiento Multi-Tenant</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Gobernado a nivel de fila por el plugin oficial con credenciales independientes por inquilino.
          </p>
        </Card>
      </div>
    </main>
  );
}
