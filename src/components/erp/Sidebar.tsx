'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Trophy,
  Users,
  Package,
  Wallet,
  Truck,
  Layers,
  Sparkles,
  Receipt,
  Settings,
  ShoppingCart,
} from 'lucide-react';
import { cn } from '@/utilities/cn';

interface SidebarProps {
  tenantSlug: string;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ tenantSlug, isMobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();

  const navigation = [
    {
      group: 'OPERACIONES & FINANZAS',
      items: [
        {
          name: 'Dashboard Ejecutivo',
          href: `/${tenantSlug}/erp`,
          icon: LayoutDashboard,
          exact: true,
        },
        {
          name: 'Facturación & Ventas',
          href: `/${tenantSlug}/erp/invoices`,
          icon: Receipt,
        },
        {
          name: 'Clientes & Cartera CxC',
          href: `/${tenantSlug}/erp/customers`,
          icon: Users,
        },
        {
          name: 'Cotizaciones',
          href: `/${tenantSlug}/erp/quotes`,
          icon: FileText,
        },
        {
          name: 'Vendedores & Comisiones',
          href: `/${tenantSlug}/erp/vendors`,
          icon: Trophy,
        },
      ],
    },
    {
      group: 'INVENTARIO & PRODUCCIÓN',
      items: [
        {
          name: 'Catálogo, Stock & BOM',
          href: `/${tenantSlug}/erp/inventory`,
          icon: Package,
        },
      ],
    },
    {
      group: 'TESORERÍA & PUNTOS DE VENTA',
      items: [
        {
          name: 'Punto de Venta (POS)',
          href: `/${tenantSlug}/erp/pos`,
          icon: ShoppingCart,
        },
        {
          name: 'Cajas & Arqueos',
          href: `/${tenantSlug}/erp/cash-registers`,
          icon: Wallet,
        },
      ],
    },
    {
      group: 'COMPRAS & PROVEEDORES',
      items: [
        {
          name: 'Compras & CxP',
          href: `/${tenantSlug}/erp/purchases`,
          icon: ShoppingCart,
        },
        {
          name: 'Proveedores & CxP',
          href: `/${tenantSlug}/erp/suppliers`,
          icon: Truck,
        },
      ],
    },
    {
      group: 'CONFIGURACIÓN & SEEDER',
      items: [
        {
          name: 'Plantillas Industriales',
          href: `/${tenantSlug}/erp/templates`,
          icon: Layers,
        },
        {
          name: 'Ajustes de Empresa',
          href: `/${tenantSlug}/erp/settings`,
          icon: Settings,
        },
      ],
    },
  ];

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-slate-950 border-r border-slate-800/80">
      {/* Brand Header */}
      <div>
        <div className="flex h-16 items-center gap-3 px-6 border-b border-slate-800/80">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-md shadow-indigo-500/20 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base tracking-tight text-white">Cendaro</span>
              <span className="font-bold text-xs px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                ERP
              </span>
            </div>
            <p className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase">
              Bimonetario USD / VES
            </p>
          </div>
        </div>

        {/* Navigation Sections */}
        <nav className="p-4 space-y-6 overflow-y-auto max-h-[calc(100vh-8rem)]">
          {navigation.map((group) => (
            <div key={group.group} className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                {group.group}
              </p>
              {group.items.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname?.startsWith(`${item.href}/`);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={onCloseMobile}
                    className={cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition-all',
                      isActive
                        ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm'
                        : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4 transition-colors',
                        isActive
                          ? 'text-indigo-400'
                          : 'text-slate-400 group-hover:text-slate-300',
                      )}
                    />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-800/80">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-3">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>Inquilino Activo:</span>
            <span className="text-emerald-400 font-semibold">{tenantSlug}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0 z-20 print:hidden">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
