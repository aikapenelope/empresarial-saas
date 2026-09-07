'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSyncOnKeyChange } from './hooks/useSyncOnKeyChange';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft } from 'lucide-react';

interface CommandPaletteProps {
  tenantSlug: string;
  /** Inquilino de la sesión: obligatorio para aislar las búsquedas REST. */
  tenantId: number;
}

interface SearchResults {
  clientes: Array<{ id: number; name: string; taxId: string }>;
  productos: Array<{ id: number; name: string; sku: string }>;
}

/**
 * Paleta de comandos ⌘K (Sprint 17): navegación rápida a rutas del ERP y
 * búsqueda en vivo de clientes/productos vía REST (cookie de sesión incluida).
 */
export function CommandPalette({ tenantSlug, tenantId }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({ clientes: [], productos: [] });

  const navRoutes = useMemoRoutes(tenantSlug);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery('');
      router.push(href);
    },
    [router],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Reset síncrono de resultados cuando la búsqueda deja de ser válida:
  // ajuste de estado en render (patrón oficial de React) en lugar de useEffect.
  useSyncOnKeyChange(`${open}:${query}`, () => {
    if (!open || query.trim().length < 2) {
      setResults({ clientes: [], productos: [] });
    }
  });

  // Búsqueda en vivo (debounce simple)
  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    const timeout = setTimeout(async () => {
      try {
        const q = encodeURIComponent(query.trim());
        const [custRes, prodRes] = await Promise.all([
          // Aislamiento multi-inquilino: el acceso de colección sólo exige
          // sesión, así que la restricción por tenant va en la consulta.
          fetch(`/api/customers?depth=0&limit=5&where[tenant][equals]=${tenantId}&where[name][like]=${q}`, { credentials: 'include' }),
          fetch(`/api/products?depth=0&limit=5&where[tenant][equals]=${tenantId}&where[name][like]=${q}`, { credentials: 'include' }),
        ]);
        if (custRes.ok && prodRes.ok) {
          const cust = await custRes.json();
          const prod = await prodRes.json();
          setResults({
            clientes: (cust.docs || []).slice(0, 5),
            productos: (prod.docs || []).slice(0, 5),
          });
        }
      } catch {
        // silencioso: la paleta es un atajo, no un flujo crítico
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, open, tenantId]);

  if (!open) return null;

  const filteredRoutes = query.trim()
    ? navRoutes.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
    : navRoutes;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar rutas, clientes, productos..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-500">ESC</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2 text-sm">
          {filteredRoutes.length > 0 && (
            <p className="px-2 py-1 text-[10px] font-bold uppercase text-slate-500">Navegación</p>
          )}
          {filteredRoutes.map((r) => (
            <button
              key={r.href}
              onClick={() => navigate(r.href)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-200 flex items-center justify-between"
            >
              <span>{r.name}</span>
              <CornerDownLeft className="h-3 w-3 text-slate-600" />
            </button>
          ))}

          {results.clientes.length > 0 && (
            <p className="px-2 py-1 mt-2 text-[10px] font-bold uppercase text-slate-500">Clientes</p>
          )}
          {results.clientes.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/${tenantSlug}/erp/customers/${c.id}`)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-200"
            >
              {c.name} <span className="text-slate-500 font-mono text-xs">({c.taxId})</span>
            </button>
          ))}

          {results.productos.length > 0 && (
            <p className="px-2 py-1 mt-2 text-[10px] font-bold uppercase text-slate-500">Productos</p>
          )}
          {results.productos.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate(`/${tenantSlug}/erp/inventory`)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-200"
            >
              {p.name} <span className="text-slate-500 font-mono text-xs">({p.sku})</span>
            </button>
          ))}

          {filteredRoutes.length === 0 &&
            results.clientes.length === 0 &&
            results.productos.length === 0 &&
            query.trim().length >= 2 && (
              <p className="text-slate-500 text-center py-6">Sin resultados para &quot;{query}&quot;.</p>
            )}
        </div>
      </div>
    </div>
  );
}

function useMemoRoutes(tenantSlug: string) {
  // Nota: useMemoRoutes sin deps — las rutas son estáticas por montaje.
  return React.useMemo(
    () => [
      { name: 'Dashboard Ejecutivo', href: `/${tenantSlug}/erp` },
      { name: 'Punto de Venta', href: `/${tenantSlug}/erp/pos` },
      { name: 'Facturación & Ventas', href: `/${tenantSlug}/erp/invoices` },
      { name: 'Clientes & Cartera CxC', href: `/${tenantSlug}/erp/customers` },
      { name: 'Cotizaciones', href: `/${tenantSlug}/erp/quotes` },
      { name: 'Cotización rápida', href: `/${tenantSlug}/erp/quotes/quick` },
      { name: 'Pedidos de Venta', href: `/${tenantSlug}/erp/orders` },
      { name: 'Remisiones', href: `/${tenantSlug}/erp/delivery-notes` },
      { name: 'Cartera por Antigüedad (CxC)', href: `/${tenantSlug}/erp/receivables` },
      { name: 'Tasas de Cambio', href: `/${tenantSlug}/erp/rates` },
      { name: 'Centro de Alertas', href: `/${tenantSlug}/erp/alerts` },
      { name: 'Auditoría Global', href: `/${tenantSlug}/erp/audit` },
      { name: 'Catálogo, Stock & BOM', href: `/${tenantSlug}/erp/inventory` },
      { name: 'Cajas & Arqueos', href: `/${tenantSlug}/erp/cash-registers` },
      { name: 'Proveedores & CxP', href: `/${tenantSlug}/erp/suppliers` },
      { name: 'Vendedores & Comisiones', href: `/${tenantSlug}/erp/vendors` },
      { name: 'Plantillas Industriales', href: `/${tenantSlug}/erp/templates` },
      { name: 'Ajustes de Empresa', href: `/${tenantSlug}/erp/settings` },
    ],
    [tenantSlug],
  );
}
