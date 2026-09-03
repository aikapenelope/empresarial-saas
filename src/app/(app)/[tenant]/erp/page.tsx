import React from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Receipt,
  Users,
  Factory,
  Boxes,
  Truck,
  DollarSign,
  AlertCircle,
  PlusCircle,
  MessageCircle,
} from 'lucide-react';
import { TemplateSelector } from '@/components/erp/TemplateSelector';

interface PageProps {
  params: Promise<{
    tenant: string;
  }>;
}

export default async function ERPDashboardPage({ params }: PageProps) {
  const { tenant } = await params;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Saludo y Contexto */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Panel Operativo Principal
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Control integral de Cuentas por Cobrar, Producción (BOM), Cuentas por Pagar y Caja en vivo para{' '}
            <span className="text-zinc-200 font-semibold">{tenant.toUpperCase()}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/admin`}
            target="_blank"
            className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            Configuración CMS
          </Link>
          <Link
            href={`/admin/collections/invoices/create`}
            target="_blank"
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/25 transition-all flex items-center gap-1.5"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Facturar Venta</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards de Finanzas y Operaciones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Cuentas por Cobrar */}
        <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-xl hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-zinc-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">Cuentas por Cobrar</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">$ 12,450.00</div>
          <div className="text-xs text-zinc-400 mt-1">
            Equivalente: <span className="text-zinc-300">Bs. 498,000.00</span>
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs">
            <span className="text-amber-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> $ 1,820.00 vencidos
            </span>
            <Link href="/admin/collections/invoices" target="_blank" className="text-zinc-500 hover:text-zinc-300">
              Ver facturas &rarr;
            </Link>
          </div>
        </div>

        {/* KPI 2: Cuentas por Pagar (Proveedores) */}
        <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-xl hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-zinc-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">Cuentas por Pagar (CxP)</span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">$ 4,890.00</div>
          <div className="text-xs text-zinc-400 mt-1">
            Compromisos con <span className="text-zinc-300">6 proveedores</span>
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs">
            <span className="text-zinc-400">Próx. vencimiento: 3 días</span>
            <Link href="/admin/collections/purchase-invoices" target="_blank" className="text-zinc-500 hover:text-zinc-300">
              Ver compras &rarr;
            </Link>
          </div>
        </div>

        {/* KPI 3: Producción & BOMs */}
        <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-xl hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-zinc-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">Producción en Planta</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Factory className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">3 Activas</div>
          <div className="text-xs text-zinc-400 mt-1">
            Órdenes en proceso de horneado/fabricación
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs">
            <span className="text-emerald-400">Insumos garantizados</span>
            <Link href="/admin/collections/production-orders" target="_blank" className="text-zinc-500 hover:text-zinc-300">
              Ver órdenes &rarr;
            </Link>
          </div>
        </div>

        {/* KPI 4: Caja Registradora */}
        <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-xl hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-zinc-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">Caja & Turno Actual</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <div className="text-2xl font-bold text-white tracking-tight">Abierta</div>
          </div>
          <div className="text-xs text-zinc-400 mt-1">
            Turno iniciado a las <span className="text-zinc-300">08:30 AM</span>
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs">
            <span className="text-zinc-400">CAJA-01 (Mostrador)</span>
            <Link href="/admin/collections/cash-closures" target="_blank" className="text-zinc-500 hover:text-zinc-300">
              Arqueo &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Acciones Rápidas del ERP */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href={`/admin/collections/invoices/create`}
          target="_blank"
          className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <Receipt className="w-4 h-4" />
          </div>
          <div className="text-xs font-semibold text-zinc-200">Factura / Nota de Entrega</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">Venta a crédito o contado</div>
        </Link>

        <Link
          href={`/admin/collections/customer-payments/create`}
          target="_blank"
          className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <DollarSign className="w-4 h-4" />
          </div>
          <div className="text-xs font-semibold text-zinc-200">Registrar Cobranza</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">Abono y recibo cliente</div>
        </Link>

        <Link
          href={`/admin/collections/production-orders/create`}
          target="_blank"
          className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all group"
        >
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <Factory className="w-4 h-4" />
          </div>
          <div className="text-xs font-semibold text-zinc-200">Nueva Orden BOM</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">Fabricación y consumo</div>
        </Link>

        <Link
          href={`/admin/collections/customers`}
          target="_blank"
          className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group"
        >
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <MessageCircle className="w-4 h-4" />
          </div>
          <div className="text-xs font-semibold text-zinc-200">Cobranza por WhatsApp</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">Estados de cuenta y avisos</div>
        </Link>
      </div>

      {/* Acelerador de Plantillas Industriales */}
      <div id="templates">
        <TemplateSelector tenantSlug={tenant} />
      </div>

      {/* Resumen de Módulos Operativos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Módulo Ventas & CxC */}
        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-blue-400" />
              <h3 className="font-semibold text-sm text-zinc-200">Últimas Facturas / Notas Emitidas</h3>
            </div>
            <Link href="/admin/collections/invoices" target="_blank" className="text-xs text-blue-400 hover:underline">
              Ver todas
            </Link>
          </div>
          <div className="space-y-2">
            {[
              { num: 'FAC-2026-0042', client: 'Distribuidora Los Andes C.A.', amount: '$ 450.00', status: 'Pendiente', color: 'text-amber-400 bg-amber-500/10' },
              { num: 'FAC-2026-0041', client: 'Automercado San Antonio', amount: '$ 1,280.00', status: 'Abonada', color: 'text-blue-400 bg-blue-500/10' },
              { num: 'FAC-2026-0040', client: 'Panadería Central', amount: '$ 320.00', status: 'Pagada', color: 'text-emerald-400 bg-emerald-500/10' },
            ].map((f) => (
              <div key={f.num} className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/60 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono font-medium text-zinc-200 block">{f.num}</span>
                  <span className="text-zinc-400">{f.client}</span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-zinc-100 block">{f.amount}</span>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${f.color}`}>
                    {f.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Módulo Producción Activa */}
        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Factory className="w-4 h-4 text-amber-400" />
              <h3 className="font-semibold text-sm text-zinc-200">Órdenes de Producción en Curso</h3>
            </div>
            <Link href="/admin/collections/production-orders" target="_blank" className="text-xs text-amber-400 hover:underline">
              Ver planta
            </Link>
          </div>
          <div className="space-y-2">
            {[
              { num: 'OP-0029', product: 'Pan Canilla Tradicional 250g', qty: '300 u', stage: 'Horneado', color: 'text-amber-400 bg-amber-500/10' },
              { num: 'OP-0028', product: 'Pan Campesino Rústico 500g', qty: '150 u', stage: 'Fermentación', color: 'text-purple-400 bg-purple-500/10' },
              { num: 'OP-0027', product: 'Croissant Mantequilla', qty: '200 u', stage: 'Formado', color: 'text-blue-400 bg-blue-500/10' },
            ].map((o) => (
              <div key={o.num} className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/60 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono font-medium text-zinc-200 block">{o.num}</span>
                  <span className="text-zinc-400">{o.product}</span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-zinc-100 block">{o.qty}</span>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${o.color}`}>
                    {o.stage}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
