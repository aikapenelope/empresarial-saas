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
  ClipboardList,
  TrendingUp,
  BellRing,
} from 'lucide-react';
import { cn } from '@/utilities/cn';

interface SidebarProps {
  tenantSlug: string;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  userRole?: string | null;
  /** Alertas activas sin reconocer — badge en el ítem de Alertas (Sprint 22). */
  alertBadge?: number;
}

/**
 * Visibilidad de navegación por rol (Sprint 17). Los guards server-side de la
 * capa de datos son la autoridad real; esto es UX: cada rol ve solo su operación.
 */
const ROLE_NAV: Record<string, string[]> = {
  vendor: ['dashboard', 'alerts', 'pos', 'quotes', 'orders', 'delivery-notes', 'vendors', 'customers', 'receivables'],
  cashier: ['dashboard', 'alerts', 'pos', 'invoices', 'orders', 'delivery-notes', 'customers', 'cash-registers'],
  employee: ['dashboard', 'alerts', 'invoices', 'customers', 'inventory', 'quotes', 'orders', 'delivery-notes'],
  supervisor: [
    'dashboard',
    'pos',
    'invoices',
    'customers',
    'inventory',
    'quotes',
    'orders',
    'delivery-notes',
    'alerts',
    'receivables',
    'cash-registers',
    'purchases',
    'vendors',
  ],
};

const ALL_NAV = '*';

export function Sidebar({
  tenantSlug,
  isMobileOpen,
  onCloseMobile,
  userRole,
  alertBadge,
}: SidebarProps) {
  const pathname = usePathname();

  const navigation = [
    {
      group: 'OPERACIONES & FINANZAS',
      items: [
        {
          name: 'Dashboard Ejecutivo',
          href: `/${tenantSlug}/erp`,
          routeKey: 'dashboard',
          icon: LayoutDashboard,
          exact: true,
        },
        {
          name: 'Facturación & Ventas',
          href: `/${tenantSlug}/erp/invoices`,
          routeKey: 'invoices',
          icon: Receipt,
        },
        {
          name: 'Clientes & Cartera CxC',
          href: `/${tenantSlug}/erp/customers`,
          routeKey: 'customers',
          icon: Users,
        },
        {
          name: 'Alertas',
          href: `/${tenantSlug}/erp/alerts`,
          routeKey: 'alerts',
          icon: BellRing,
          badgeCount: alertBadge,
        },
        {
          name: 'Cartera por Antigüedad',
          href: `/${tenantSlug}/erp/receivables`,
          routeKey: 'receivables',
          icon: Wallet,
        },
        {
          name: 'Cotizaciones',
          href: `/${tenantSlug}/erp/quotes`,
          routeKey: 'quotes',
          icon: FileText,
        },
        {
          name: 'Pedidos de Venta',
          href: `/${tenantSlug}/erp/orders`,
          routeKey: 'orders',
          icon: ClipboardList,
        },
        {
          name: 'Remisiones',
          href: `/${tenantSlug}/erp/delivery-notes`,
          routeKey: 'delivery-notes',
          icon: Truck,
        },
        {
          name: 'Vendedores & Comisiones',
          href: `/${tenantSlug}/erp/vendors`,
          routeKey: 'vendors',
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
          routeKey: 'inventory',
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
          routeKey: 'pos',
          icon: ShoppingCart,
        },
        {
          name: 'Cajas & Arqueos',
          href: `/${tenantSlug}/erp/cash-registers`,
          routeKey: 'cash-registers',
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
          routeKey: 'templates',
          icon: Layers,
        },
        {
          name: 'Tasas de Cambio',
          href: `/${tenantSlug}/erp/rates`,
          routeKey: 'rates',
          icon: TrendingUp,
        },
        {
          name: 'Ajustes de Empresa',
          href: `/${tenantSlug}/erp/settings`,
          routeKey: 'settings',
          icon: Settings,
        },
      ],
    },
  ];

  // Filtrado por rol (UX; la autoridad real es la capa de datos server-side)
  const allowed = userRole ? ROLE_NAV[userRole] || ALL_NAV : ALL_NAV;
  const filteredNavigation = navigation
    .map((group) => ({
      ...group,
      items: allowed === ALL_NAV
        ? group.items
        : group.items.filter((item) => {
            const key = (item as { routeKey?: string }).routeKey;
            return key && (allowed as string[]).includes(key);
          }),
    }))
    .filter((group) => group.items.length > 0);

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
          {filteredNavigation.map((group) => (
            <div key={group.group} className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                {group.group}
              </p>
              {group.items.map((item) => {
                const isActive = (item as { exact?: boolean }).exact
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
                    {'badgeCount' in item && typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
                      <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white">
                        {item.badgeCount > 99 ? '99+' : item.badgeCount}
                      </span>
                    )}
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
