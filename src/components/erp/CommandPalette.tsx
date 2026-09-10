'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSyncOnKeyChange } from './hooks/useSyncOnKeyChange';
import { useRouter } from 'next/navigation';
import { getPaletteRoutes, type PaletteRoute } from '../app-shared';
import { Search, CornerDownLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommandPaletteProps {
  tenantSlug: string;
  /** Inquilino de la sesión: obligatorio para aislar las búsquedas REST. */
  tenantId: number;
  /** Rol del usuario en sesión: filtra las rutas EXACTAMENTE como el sidebar
   *  (misma fuente NAV_ITEMS + ROLE_NAV vía getPaletteRoutes). */
  userRole?: string | null;
  /** Estado controlado opcional: lo usa el App Shell (botón Buscar del header). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface SearchResults {
  clientes: Array<{ id: number; name: string; taxId: string }>;
  productos: Array<{ id: number; name: string; sku: string }>;
  pedidos: Array<{ id: number; orderNumber: string; status: string }>;
  cotizaciones: Array<{ id: number; quoteNumber: string; status: string }>;
}

type PaletteSection = 'nav' | 'pedidos' | 'cotizaciones' | 'clientes' | 'productos';

interface PaletteEntry {
  key: string;
  section: PaletteSection;
  label: string;
  hint?: string;
  href: string;
}

const SECTION_LABELS: Record<PaletteSection, string> = {
  nav: 'Navegación',
  pedidos: 'Pedidos por número',
  cotizaciones: 'Cotizaciones por número',
  clientes: 'Clientes',
  productos: 'Productos',
};

const EMPTY_RESULTS: SearchResults = { clientes: [], productos: [], pedidos: [], cotizaciones: [] };

/**
 * Paleta de comandos ⌘K (Sprint 17 → IE-PR3): navegación por teclado ↑↓/Enter
 * sobre una lista APLANADA y determinista (rutas del sidebar según rol +
 * resultados REST en vivo: pedidos/cotizaciones por número, clientes,
 * productos). Las rutas salen de la MISMA fuente que el sidebar
 * (NAV_ITEMS + ROLE_NAV vía getPaletteRoutes) con sinónimos `keywords`.
 */
export function CommandPalette({
  tenantSlug,
  tenantId,
  userRole,
  open: openProp,
  onOpenChange,
}: CommandPaletteProps) {
  const router = useRouter();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      if (onOpenChange) {
        onOpenChange(typeof value === 'function' ? value(open) : value);
      } else {
        setOpenState(value);
      }
    },
    [onOpenChange, open],
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [activeIndexRaw, setActiveIndexRaw] = useState(0);

  const paletteRoutes = React.useMemo(
    () => getPaletteRoutes(tenantSlug, userRole),
    [tenantSlug, userRole],
  );

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery('');
      router.push(href);
    },
    [router, setOpen],
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
  }, [setOpen]);

  // Reset síncrono de resultados/índice cuando la búsqueda deja de ser válida:
  // ajuste de estado en render (patrón oficial de React) en lugar de useEffect.
  useSyncOnKeyChange(`${open}:${query}`, () => {
    setActiveIndexRaw(0);
    if (!open || query.trim().length < 2) {
      setResults(EMPTY_RESULTS);
    }
  });

  // Búsqueda en vivo (debounce simple) — las rutas se filtran localmente; los
  // documentos van por REST con el tenant en la consulta (sesión + where
  // tenant, mismo aislamiento del sprint 17).
  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    const timeout = setTimeout(async () => {
      try {
        const q = encodeURIComponent(query.trim());
        const [custRes, prodRes, ordRes, quoteRes] = await Promise.all([
          fetch(`/api/customers?depth=0&limit=5&where[tenant][equals]=${tenantId}&where[name][like]=${q}`, { credentials: 'include' }),
          fetch(`/api/products?depth=0&limit=5&where[tenant][equals]=${tenantId}&where[name][like]=${q}`, { credentials: 'include' }),
          fetch(`/api/orders?depth=0&limit=5&where[tenant][equals]=${tenantId}&where[orderNumber][like]=${q}`, { credentials: 'include' }),
          fetch(`/api/quotes?depth=0&limit=5&where[tenant][equals]=${tenantId}&where[quoteNumber][like]=${q}`, { credentials: 'include' }),
        ]);
        if (custRes.ok && prodRes.ok && ordRes.ok && quoteRes.ok) {
          const [cust, prod, ord, quote] = (await Promise.all([
            custRes.json(),
            prodRes.json(),
            ordRes.json(),
            quoteRes.json(),
          ])) as Array<{ docs?: Array<Record<string, unknown>> }>;
          setResults({
            clientes: (cust.docs || []).slice(0, 5) as SearchResults['clientes'],
            productos: (prod.docs || []).slice(0, 5) as SearchResults['productos'],
            pedidos: (ord.docs || []).slice(0, 5) as SearchResults['pedidos'],
            cotizaciones: (quote.docs || []).slice(0, 5) as SearchResults['cotizaciones'],
          });
        }
      } catch {
        // silencioso: la paleta es un atajo, no un flujo crítico
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, open, tenantId]);

  const q = query.trim().toLowerCase();
  const navMatches: PaletteRoute[] = q
    ? paletteRoutes.filter(
        (r) => r.title.toLowerCase().includes(q) || (r.keywords ?? '').includes(q),
      )
    : paletteRoutes;

  // Lista APLANADA en orden determinista: rutas → pedidos → cotizaciones →
  // clientes → productos. Un único índice activo gobierna ↑↓/Enter.
  const entries: PaletteEntry[] = [
    ...navMatches.map((r) => ({
      key: `nav:${r.href}`,
      section: 'nav' as const,
      label: r.title,
      href: r.href,
    })),
    ...results.pedidos.map((o) => ({
      key: `pedido:${o.id}`,
      section: 'pedidos' as const,
      label: o.orderNumber,
      hint: o.status,
      href: `/${tenantSlug}/erp/orders/${o.id}`,
    })),
    ...results.cotizaciones.map((c) => ({
      key: `cot:${c.id}`,
      section: 'cotizaciones' as const,
      label: c.quoteNumber,
      hint: c.status,
      // No existe página de detalle de cotización (quotes/[id]): el resultado
      // lleva a la lista, donde la cotización se abre y gestiona.
      href: `/${tenantSlug}/erp/quotes`,
    })),
    ...results.clientes.map((c) => ({
      key: `cli:${c.id}`,
      section: 'clientes' as const,
      label: c.name,
      hint: c.taxId,
      href: `/${tenantSlug}/erp/customers/${c.id}`,
    })),
    ...results.productos.map((p) => ({
      key: `prod:${p.id}`,
      section: 'productos' as const,
      label: p.name,
      hint: p.sku,
      href: `/${tenantSlug}/erp/inventory`,
    })),
  ];

  const activeIndex = entries.length === 0 ? 0 : Math.min(activeIndexRaw, entries.length - 1);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (entries.length > 0) setActiveIndexRaw((i) => (i + 1) % entries.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (entries.length > 0) setActiveIndexRaw((i) => (i - 1 + entries.length) % entries.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = entries[activeIndex];
      if (item) navigate(item.href);
    }
  };

  // Mantiene la opción activa visible al navegar con ↑↓.
  useEffect(() => {
    document.getElementById(`palette-opt-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

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
            onKeyDown={handleInputKeyDown}
            role="combobox"
            aria-expanded
            aria-controls="palette-listbox"
            aria-autocomplete="list"
            placeholder="Buscar rutas, PED-…, QUE-…, clientes, productos…"
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-500">ESC</kbd>
        </div>

        <div id="palette-listbox" role="listbox" aria-label="Resultados de la paleta" className="max-h-[50vh] overflow-y-auto p-2 text-sm">
          {entries.map((item, idx) => (
            <React.Fragment key={item.key}>
              {(idx === 0 || entries[idx - 1].section !== item.section) && (
                <p className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase text-slate-500">
                  {SECTION_LABELS[item.section]}
                </p>
              )}
              <button
                id={`palette-opt-${idx}`}
                role="option"
                aria-selected={idx === activeIndex}
                onClick={() => navigate(item.href)}
                onMouseEnter={() => setActiveIndexRaw(idx)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg flex items-center justify-between gap-3',
                  idx === activeIndex ? 'bg-slate-800 text-white' : 'text-slate-200 hover:bg-slate-800/60',
                )}
              >
                <span className="truncate">
                  {item.label}
                  {item.hint && (
                    <span className="text-slate-500 font-mono text-xs ml-2">({item.hint})</span>
                  )}
                </span>
                {idx === activeIndex && <CornerDownLeft className="h-3 w-3 text-slate-600 shrink-0" />}
              </button>
            </React.Fragment>
          ))}

          {entries.length === 0 && query.trim().length >= 2 && (
            <p className="text-slate-500 text-center py-6">Sin resultados para &quot;{query}&quot;.</p>
          )}
        </div>
      </div>
    </div>
  );
}
