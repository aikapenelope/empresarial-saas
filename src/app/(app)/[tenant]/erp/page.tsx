import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  TrendingUp,
  Truck,
  Wallet,
  AlertTriangle,
  Users,
  Package,
  ArrowRight,
  MessageCircle,
  ShieldAlert,
} from 'lucide-react';
import { getTenantBySlug, getDashboardMetrics } from '@/utilities/erpData';
import { KpiCard, formatUSD, formatVES } from '@/components/erp/KpiCard';
import { Badge } from '@/components/erp/Badge';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function ErpDashboardPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  if (!tenant) {
    notFound();
  }

  const data = await getDashboardMetrics(tenant);

  // Cálculos de porcentajes para barras de aging
  const totalAgingUSD =
    data.financials.aging.zeroToThirtyUSD +
    data.financials.aging.thirtyOneToSixtyUSD +
    data.financials.aging.sixtyPlusUSD;

  const pct0to30 = totalAgingUSD > 0 ? (data.financials.aging.zeroToThirtyUSD / totalAgingUSD) * 100 : 0;
  const pct31to60 = totalAgingUSD > 0 ? (data.financials.aging.thirtyOneToSixtyUSD / totalAgingUSD) * 100 : 0;
  const pct60plus = totalAgingUSD > 0 ? (data.financials.aging.sixtyPlusUSD / totalAgingUSD) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Encabezado del Dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            Dashboard Ejecutivo
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-mono font-medium">
              Tasa: {formatVES(data.rates.effectiveRate)}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Consolidado financiero bimonetario, cobranzas y control de operaciones en tiempo real.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/${tenantSlug}/erp/customers`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            <Users className="h-3.5 w-3.5 text-indigo-400" />
            <span>Cobranzas</span>
          </Link>
          <Link
            href={`/${tenantSlug}/erp/inventory`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm shadow-indigo-500/20"
          >
            <Package className="h-3.5 w-3.5" />
            <span>Inventario</span>
          </Link>
        </div>
      </div>

      {/* Fila 1: 4 Tarjetas KPI Clave */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Cuentas por Cobrar (CxC)"
          valueUSD={data.financials.totalReceivablesUSD}
          valueVES={data.financials.totalReceivablesVES}
          icon={TrendingUp}
          badgeText={data.operations.overdueCustomersCount > 0 ? `${data.operations.overdueCustomersCount} Vencidos` : 'Al Día'}
          badgeVariant={data.operations.overdueCustomersCount > 0 ? 'rose' : 'emerald'}
          description="Saldos pendientes de clientes por facturas emitidas"
          href={`/${tenantSlug}/erp/customers`}
        />

        <KpiCard
          title="Cuentas por Pagar (CxP)"
          valueUSD={data.financials.totalPayablesUSD}
          valueVES={data.financials.totalPayablesVES}
          icon={Truck}
          badgeText="Proveedores"
          badgeVariant="amber"
          description="Compromisos comerciales con proveedores"
          href={`/${tenantSlug}/erp/suppliers`}
        />

        <KpiCard
          title="Puntos de Venta & Cajas"
          valueUSD={`${data.operations.openRegistersCount} Abiertas`}
          valueVES={`${data.operations.totalRegistersCount} Cajas totales`}
          icon={Wallet}
          badgeText={data.operations.openRegistersCount > 0 ? 'En Turno' : 'Cerradas'}
          badgeVariant={data.operations.openRegistersCount > 0 ? 'emerald' : 'slate'}
          description="Estado de cajas de mostrador y cobranzas"
          href={`/${tenantSlug}/erp/cash-registers`}
        />

        <KpiCard
          title="Alertas de Stock"
          valueUSD={`${data.operations.lowStockCount} Críticos`}
          valueVES={`${data.operations.totalProducts} Artículos totales`}
          icon={AlertTriangle}
          badgeText={data.operations.lowStockCount > 0 ? 'Bajo Mínimo' : 'Óptimo'}
          badgeVariant={data.operations.lowStockCount > 0 ? 'rose' : 'emerald'}
          description="Insumos o productos en nivel de riesgo"
          href={`/${tenantSlug}/erp/inventory`}
        />
      </div>

      {/* Fila 2: Envejecimiento de Cartera (Aging) & Alertas Críticas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Antigüedad de Deuda */}
        <div className="lg:col-span-1 rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Envejecimiento de Cartera (CxC)</h3>
            <span className="text-[11px] font-mono text-slate-400">Aging</span>
          </div>

          <p className="text-xs text-slate-400">
            Segmentación del saldo pendiente por cobrar según días transcurridos desde emisión:
          </p>

          <div className="space-y-3 pt-1">
            {/* 0 a 30 días */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium">0 - 30 días (Vigente)</span>
                <span className="font-mono text-emerald-400 font-semibold">
                  {formatUSD(data.financials.aging.zeroToThirtyUSD)}
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct0to30}%` }} />
              </div>
            </div>

            {/* 31 a 60 días */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium">31 - 60 días</span>
                <span className="font-mono text-amber-400 font-semibold">
                  {formatUSD(data.financials.aging.thirtyOneToSixtyUSD)}
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct31to60}%` }} />
              </div>
            </div>

            {/* Más de 60 días */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium">+60 días (Crítico)</span>
                <span className="font-mono text-rose-400 font-semibold">
                  {formatUSD(data.financials.aging.sixtyPlusUSD)}
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-rose-500 rounded-full" style={{ width: `${pct60plus}%` }} />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-400">Total Vencido Acumulado:</span>
            <span className="font-mono text-white">
              {formatUSD(data.financials.totalReceivablesUSD)}
            </span>
          </div>
        </div>

        {/* Insumos & Productos en Alerta Crítica */}
        <div className="lg:col-span-2 rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-400" />
              <h3 className="text-sm font-semibold text-white">Stock Crítico & Materias Primas</h3>
            </div>
            <Link
              href={`/${tenantSlug}/erp/inventory`}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              Ver todo el inventario
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {data.criticalProducts.length === 0 ? (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
              <p className="text-xs text-emerald-300 font-medium">
                No hay productos en nivel crítico. Todos los artículos superan el stock de seguridad.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px]">
                    <th className="pb-2">SKU</th>
                    <th className="pb-2">Producto / Insumo</th>
                    <th className="pb-2">Tipo</th>
                    <th className="pb-2 text-right">Stock Actual</th>
                    <th className="pb-2 text-right">Stock Mínimo</th>
                    <th className="pb-2 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {data.criticalProducts.map((prod) => (
                    <tr key={prod.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 font-mono text-slate-400">{prod.sku}</td>
                      <td className="py-2.5 font-medium text-white">{prod.name}</td>
                      <td className="py-2.5">
                        <Badge
                          variant={
                            prod.productType === 'raw_material'
                              ? 'amber'
                              : prod.productType === 'manufactured'
                                ? 'indigo'
                                : 'slate'
                          }
                          size="sm"
                        >
                          {prod.productType}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold text-rose-400">
                        {prod.currentStock} {prod.unitOfMeasure}
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-400">
                        {prod.minStockAlert} {prod.unitOfMeasure}
                      </td>
                      <td className="py-2.5 text-center">
                        <Badge variant="rose" size="sm">
                          Crítico
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Fila 3: Top Clientes Deudores (WhatsApp Cobranza) + Últimas Facturas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Clientes Deudores con WhatsApp */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-white">Top Clientes con Saldo Deudor</h3>
            </div>
            <Link
              href={`/${tenantSlug}/erp/customers`}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              Ver cartera
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {data.topDebtors.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-6 text-center">
              <p className="text-xs text-slate-400">No hay clientes con saldos pendientes.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px]">
                    <th className="pb-2">Cliente / RIF</th>
                    <th className="pb-2 text-right">Deuda USD</th>
                    <th className="pb-2 text-right">Deuda VES</th>
                    <th className="pb-2 text-center">Cobranza</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {data.topDebtors.map((client) => (
                    <tr key={client.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5">
                        <div className="font-semibold text-white">{client.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{client.taxId}</div>
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold text-rose-400">
                        {formatUSD(Number(client.currentDebtUSD) || 0)}
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-300">
                        {formatVES(Number(client.currentDebtVES) || 0)}
                      </td>
                      <td className="py-2.5 text-center">
                        {client.whatsappDebtUrl ? (
                          <a
                            href={client.whatsappDebtUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition-colors shadow-sm"
                            title="Cobrar vía WhatsApp Web"
                          >
                            <MessageCircle className="h-3 w-3" />
                            <span>Cobrar</span>
                          </a>
                        ) : (
                          <span className="text-[10px] text-slate-400">Sin teléfono</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Facturas Recientes */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Facturación Reciente</h3>
            <span className="text-xs text-slate-400">Últimos registros</span>
          </div>

          {data.recentInvoices.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-6 text-center">
              <p className="text-xs text-slate-400">No hay facturas emitidas recientemente.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px]">
                    <th className="pb-2">N° Factura</th>
                    <th className="pb-2">Cliente</th>
                    <th className="pb-2 text-right">Total USD</th>
                    <th className="pb-2 text-right">Saldo</th>
                    <th className="pb-2 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {data.recentInvoices.map((inv) => {
                    const customerName =
                      typeof inv.customer === 'object' && inv.customer !== null
                        ? (inv.customer as { name: string }).name
                        : 'Cliente';

                    return (
                      <tr key={inv.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 font-mono text-indigo-400 font-medium">
                          {inv.invoiceNumber}
                        </td>
                        <td className="py-2.5 text-white font-medium truncate max-w-[120px]">
                          {customerName}
                        </td>
                        <td className="py-2.5 text-right font-mono text-slate-200">
                          {formatUSD(Number(inv.totalUSD) || 0)}
                        </td>
                        <td className="py-2.5 text-right font-mono font-semibold text-rose-400">
                          {formatUSD(Number(inv.balanceUSD) || 0)}
                        </td>
                        <td className="py-2.5 text-center">
                          <Badge
                            variant={
                              inv.status === 'paid'
                                ? 'emerald'
                                : inv.status === 'partially_paid'
                                  ? 'amber'
                                  : 'rose'
                            }
                            size="sm"
                          >
                            {inv.status === 'paid'
                              ? 'Pagada'
                              : inv.status === 'partially_paid'
                                ? 'Abono'
                                : 'Pendiente'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
