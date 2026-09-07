import React from 'react';
import { notFound } from 'next/navigation';
import {
  Receipt,
  ShoppingCart,
  Wallet,
  Zap,
} from 'lucide-react';
import { getTenantBySlug } from '@/utilities/erpData';
import { getDashboardData } from '@/utilities/dashboardData';
import { requireErpTenantAccess, ErpAccessError } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { Dashboard } from '@/components/dashboard';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function ErpDashboardPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;

  let tenant: Awaited<ReturnType<typeof getTenantBySlug>> = null;
  let actor: Awaited<ReturnType<typeof requireErpTenantAccess>> | null = null;
  try {
    tenant = await getTenantBySlug(tenantSlug);
    if (tenant) {
      actor = await requireErpTenantAccess(tenant.id);
    }
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  if (!tenant || !actor) {
    notFound();
  }

  const data = await getDashboardData(tenant.id, actor);

  const quickActions = [
    {
      title: 'Nueva factura',
      description: 'Factura con descuento de kardex.',
      href: `/${tenantSlug}/erp/invoices`,
      icon: Receipt,
    },
    {
      title: 'Punto de venta',
      description: 'Cobra en el mostrador.',
      href: `/${tenantSlug}/erp/pos`,
      icon: ShoppingCart,
    },
    {
      title: 'Cotización rápida',
      description: 'Arma y envía en un paso.',
      href: `/${tenantSlug}/erp/quotes/quick`,
      icon: Zap,
    },
    {
      title: 'Registrar pago',
      description: 'Abona la cartera del cliente.',
      href: `/${tenantSlug}/erp/receivables`,
      icon: Wallet,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-5">
        <h1 className="text-2xl font-bold tracking-tight">Hola, {actor.name.split(' ')[0]} 👋</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Así va <span className="font-semibold text-foreground">{tenant.name}</span> en los últimos 30 días.
        </p>
      </div>

      <Dashboard
        stats={data.stats}
        revenueDaily={data.revenueDaily}
        categoryMix={data.categoryMix}
        returnDaily={data.returnDaily}
        refundedSharePct={data.refundedSharePct}
        quickActions={quickActions}
      />
    </div>
  );
}
