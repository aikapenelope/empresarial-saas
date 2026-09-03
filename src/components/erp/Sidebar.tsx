import React from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Receipt,
  Users,
  Factory,
  Boxes,
  Truck,
  DollarSign,
  Sparkles,
  Settings,
  ExternalLink,
} from 'lucide-react';

interface SidebarProps {
  tenantSlug: string;
  tenantName?: string;
  currentPath?: string;
}

export function Sidebar({ tenantSlug, tenantName = 'Empresa Demo' }: SidebarProps) {
  const basePath = `/${tenantSlug}/erp`;

  const navItems = [
    { label: 'Dashboard', href: `${basePath}`, icon: LayoutDashboard },
    { label: 'Ventas & Facturas', href: `${basePath}#invoices`, icon: Receipt },
    { label: 'Clientes & CRM', href: `${basePath}#customers`, icon: Users },
    { label: 'Producción & BOM', href: `${basePath}#production`, icon: Factory },
    { label: 'Catálogo & Kardex', href: `${basePath}#products`, icon: Boxes },
    { label: 'Compras & Proveedores', href: `${basePath}#suppliers`, icon: Truck },
    { label: 'Cajas & Turnos POS', href: `${basePath}#cash`, icon: DollarSign },
    { label: 'Plantillas Industriales', href: `${basePath}#templates`, icon: Sparkles, highlight: true },
  ];

  return (
    <aside className="w-64 border-r border-zinc-800 bg-zinc-900/60 backdrop-blur-xl flex flex-col h-screen sticky top-0">
      {/* Brand Header */}
      <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
              C
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white block">Cendaro ERP</span>
              <span className="text-xs text-zinc-400 truncate block max-w-[140px]">{tenantName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 custom-scrollbar">
        <div className="px-3 pb-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          Módulos del Sistema
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                item.highlight
                  ? 'text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${item.highlight ? 'text-amber-400' : 'text-zinc-400'}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Technical Admin Footer */}
      <div className="p-3 border-t border-zinc-800 space-y-1">
        <Link
          href="/admin"
          target="_blank"
          className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-3.5 h-3.5" />
            <span>Panel Técnico CMS</span>
          </div>
          <ExternalLink className="w-3 h-3 text-zinc-500" />
        </Link>
      </div>
    </aside>
  );
}
