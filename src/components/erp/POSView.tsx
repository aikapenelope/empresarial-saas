'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSyncOnKeyChange } from './hooks/useSyncOnKeyChange';
import Link from 'next/link';
import {
  ShoppingCart,
  Trash2,
  Loader2,
  Plus,
  Store,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  Minus,
  ReceiptText,
  UserRound,
  ScanBarcode,
} from 'lucide-react';
import { EmptyState } from './EmptyState';
import { createInvoiceAction, ensureWalkInCustomerAction } from '@/actions/erpActions';
import { formatUSD, formatVES } from './format';
import { effectivePriceForTier } from '@/utilities/priceTiers';
import { Badge } from './Badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/utilities/cn';

interface POSViewProps {
  tenantId: number;
  tenantSlug: string;
  rate: number;
  products: Array<{
    id: number;
    name: string;
    sku: string;
    barcode?: string | null;
    priceUSD: number;
    unitOfMeasure: string;
    priceTiers?: Array<{ tier: string; priceUSD: number }> | null;
  }>;
  customers: Array<{
    id: number;
    name: string;
    taxId: string;
    currentDebtUSD?: number | null;
    priceTier?: string | null;
  }>;
  registers: Array<{ id: number; name: string; code: string; currentStatus: string }>;
  warehouses: Array<{ id: number; name: string; code: string; isDefault?: boolean | null }>;
}

type PosProduct = POSViewProps['products'][number];

interface CartLine {
  productId: number;
  sku: string;
  description: string;
  quantity: number;
  unitPriceUSD: number;
}

const PAYMENT_METHODS: Array<{ value: string; label: string }> = [
  { value: 'cash_usd', label: 'Efectivo USD ($)' },
  { value: 'cash_ves', label: 'Efectivo Bolívares (Bs.)' },
  { value: 'pos_ves', label: 'Punto de Venta / Tarjeta (VES)' },
  { value: 'pago_movil', label: 'Pago Móvil (VES)' },
  { value: 'transfer_ves', label: 'Transferencia Bancaria (VES)' },
  { value: 'zelle', label: 'Zelle ($ USD)' },
  { value: 'binance', label: 'Binance Pay (USDT)' },
];

const QUICK_QTYS = [1, 2, 3, 5, 10, 12] as const;

const posSelectClass = 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-foreground text-sm h-11';

/**
 * POS de mostrador (Sprint 37): diseño táctil de alta densidad operativa con
 * el design system — targets XL (h-11+), cantidades rápidas de un toque,
 * ticket lateral fijo y visor bimonetario siempre visible. La lógica de
 * venta (tiers, walk-in, turnos de caja, kardex) queda intacta.
 */
export function POSView({
  tenantId,
  tenantSlug,
  rate,
  products,
  customers,
  registers,
  warehouses,
}: POSViewProps) {
  const openRegisters = registers.filter((r) => r.currentStatus === 'open');

  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedSku, setSelectedSku] = useState<string>(products[0]?.sku || '');
  const [quantity, setQuantity] = useState<number>(1);
  // Precio del input como STRING: distingue el campo vacío (el cajero borrió,
  // no debe facturar gratis por accidente) del CERO explícito (cortesía).
  // Devin #52: un number input vacío coerce a 0 y handleAddLine no podía
  // diferenciarlos; el string preserva el estado vacío por separado.
  const [unitPriceInput, setUnitPriceInput] = useState<string>(
    products[0] ? String(products[0].priceUSD) : '',
  );

  const [customerMode, setCustomerMode] = useState<'walkin' | 'registered'>('walkin');
  const [customerId, setCustomerId] = useState<number>(customers[0]?.id || 0);
  const [paymentTerms, setPaymentTerms] = useState<'cash' | 'credit'>('cash');
  const [cashMethod, setCashMethod] = useState<string>('cash_usd');
  const [registerId, setRegisterId] = useState<number | undefined>(openRegisters[0]?.id);
  const [warehouseId, setWarehouseId] = useState<number | undefined>(
    warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id,
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState<string | null>(null);
  // IE-PR6: la venta a crédito sobre el límite no se rechaza — queda pendiente
  // de autorización y el cajero ve el aviso con el ID de la solicitud.
  const [approvalNotice, setApprovalNotice] = useState<string | null>(null);

  // Tier de precio: mostrador = retail; cliente registrado = su tier asignado
  const activeTier =
    customerMode === 'registered'
      ? customers.find((c) => c.id === customerId)?.priceTier || 'retail'
      : 'retail';
  const prevTierRef = useRef<string>(activeTier);

  // Cambio de cliente/tier: re-precia sólo las líneas "automáticas" — aquéllas
  // cuyo precio sigue siendo el efectivo del tier ANTERIOR (mismo criterio que
  // QuickQuoteBuilder). Las editadas manualmente por el cajero se conservan.
  useSyncOnKeyChange(activeTier, () => {
    setCart((prev) =>
      prev.map((line) => {
        const product = products.find((p) => p.id === line.productId);
        if (!product) return line;
        const prevPrice = effectivePriceForTier(product, prevTierRef.current);
        const nextPrice = effectivePriceForTier(product, activeTier);
        // Sólo re-precia si el precio actual sigue siendo el efectivo previo.
        if (Math.abs(line.unitPriceUSD - prevPrice) < 0.005) {
          return { ...line, unitPriceUSD: nextPrice };
        }
        return line;
      }),
    );
    prevTierRef.current = activeTier;
  });

  // Al cambiar el producto seleccionado o el tier activo, el input refleja el
  // precio efectivo del catálogo (punto de partida editable del cajero).
  useSyncOnKeyChange(`${selectedSku}::${activeTier}`, () => {
    const prod = products.find((p) => p.sku === selectedSku);
    if (prod) setUnitPriceInput(String(effectivePriceForTier(prod, activeTier)));
  });

  const totalUSD = useMemo(
    () => cart.reduce((acc, it) => acc + it.quantity * it.unitPriceUSD, 0),
    [cart],
  );
  const totalVES = totalUSD * rate;
  const totalItems = cart.reduce((acc, it) => acc + it.quantity, 0);

  // ── Escáner de barras / búsqueda rápida (IE-PR2) ───────────────────────────
  // Los escáneres HID escriben el código y envían Enter: el input auto-focusado
  // captura la coincidencia EXACTA por barcode/sku (case-insensitive) y agrega
  // al precio efectivo del tier SIN pasar por el input manual de precio — la
  // semántica Devin #52 (precio manual = sólo vía select) queda intacta.
  // barcode NO es único en el catálogo: con 2+ exactas NO se auto-agrega, el
  // dropdown se restringe a las exactas para que el cajero elija.
  const scannerRef = useRef<HTMLInputElement>(null);
  const [scanQuery, setScanQuery] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  // Devin #78 (2ª ronda): reconocimiento de ambigüedad SEPARADO de la
  // visibilidad del dropdown — mientras el escáner escribe, scanOpen ya está
  // true, así que el Enter del escáner no puede distinguir "reportar
  // ambigüedad" de "confirmar elección" fiándose de scanOpen.
  const [ambiguousPending, setAmbiguousPending] = useState(false);
  const [scanIndex, setScanIndex] = useState(0);
  const [amountGiven, setAmountGiven] = useState('');

  const normalizedScan = scanQuery.trim().toLowerCase();

  const exactMatches = useMemo(() => {
    if (!normalizedScan) return [];
    return products.filter(
      (p) =>
        p.sku.trim().toLowerCase() === normalizedScan ||
        (p.barcode ?? '').trim().toLowerCase() === normalizedScan,
    );
  }, [products, normalizedScan]);

  const scanSuggestions = useMemo(() => {
    if (!normalizedScan) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(normalizedScan) ||
          p.sku.toLowerCase().includes(normalizedScan) ||
          (p.barcode ?? '').toLowerCase().includes(normalizedScan),
      )
      .slice(0, 8);
  }, [products, normalizedScan]);

  const scanOptions: PosProduct[] = exactMatches.length > 1 ? exactMatches : scanSuggestions;

  const addProductAtTierPrice = (prod: PosProduct) => {
    const linePrice = effectivePriceForTier(prod, activeTier);
    setCart((prev) => {
      // Mismo producto al mismo precio de tier → el escaneo repetido suma +1
      // reutilizando la fusión de líneas que ya usaba el select.
      const existing = prev.find((l) => l.productId === prod.id && l.unitPriceUSD === linePrice);
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          productId: prod.id,
          sku: prod.sku,
          description: prod.name,
          quantity: 1,
          unitPriceUSD: linePrice,
        },
      ];
    });
    setError(null);
  };

  const clearScan = () => {
    setScanQuery('');
    setScanOpen(false);
    setScanIndex(0);
    setAmbiguousPending(false);
    scannerRef.current?.focus();
  };

  const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (exactMatches.length === 1) {
        addProductAtTierPrice(exactMatches[0]);
        clearScan();
        return;
      }
      if (exactMatches.length > 1) {
        // Ambigüedad (barcode no único). El reconocimiento de la ambigüedad es
        // INDEPENDIENTE de la visibilidad del dropdown (Devin #78, 2ª ronda):
        // mientras el escáner escribe los dígitos scanOpen ya está true, así
        // que el primer Enter NO puede fiarse de scanOpen — usa el estado
        // `ambiguousPending` (se resetea al cambiar la búsqueda). Primer Enter:
        // marca la solicitud y muestra las opciones; el cajero elige con ↑↓ y
        // confirma con un Enter posterior. Sin auto-selección del índice 0.
        if (!ambiguousPending) {
          setAmbiguousPending(true);
          setScanOpen(true);
          setScanIndex(0);
          return;
        }
        const picked = scanOptions[scanIndex];
        if (picked) {
          addProductAtTierPrice(picked);
          clearScan();
        }
        return;
      }
      const picked = scanOpen ? scanOptions[scanIndex] : undefined;
      if (picked) {
        addProductAtTierPrice(picked);
        clearScan();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (scanOptions.length === 0) return;
      setScanOpen(true);
      setScanIndex((i) => Math.min(i + 1, scanOptions.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setScanIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      clearScan();
    }
  };

  // Vuelto bimonetario (IE-PR2): puro cálculo de UI. El cobro registrado es
  // SIEMPRE el total de la factura y el arqueo compara lo físico declarado
  // contra esos totales, así que el "Entregado" sólo ayuda al cajero a dar el
  // cambio correcto — no viaja al backend ni altera el recibo del turno.
  const isCashChange =
    paymentTerms === 'cash' && (cashMethod === 'cash_usd' || cashMethod === 'cash_ves');
  const givenAmount = Number(amountGiven);
  const hasGiven = amountGiven.trim() !== '' && Number.isFinite(givenAmount) && givenAmount >= 0;
  const cashTotal = cashMethod === 'cash_usd' ? totalUSD : totalVES;
  const changeAmount = givenAmount - cashTotal;

  const handleAddLine = () => {
    const prod = products.find((p) => p.sku === selectedSku);
    if (!prod || quantity <= 0) {
      setError('Selecciona un producto y una cantidad válida.');
      return;
    }
    setError(null);
    // El precio facturado es el del input: tier efectivo por defecto o el
    // ajuste manual del cajero (el 0 explícito = cortesía prevalece). El campo
    // VACÍO no es válido: exige un valor explícito (Devin #52) para que borrar
    // el input nunca facture gratis por accidente.
    const parsedInput = unitPriceInput.trim();
    if (parsedInput === '') {
      setError('Indica el precio unitario (0 es válido para cortesías).');
      return;
    }
    const typedPrice = Number(parsedInput);
    if (!Number.isFinite(typedPrice) || typedPrice < 0) {
      setError('El precio unitario debe ser un número ≥ 0.');
      return;
    }
    const linePrice = typedPrice;
    setCart((prev) => {
      const existing = prev.find(
        (l) => l.productId === prod.id && l.unitPriceUSD === linePrice,
      );
      if (existing) {
        return prev.map((l) =>
          l === existing ? { ...l, quantity: l.quantity + quantity } : l,
        );
      }
      return [
        ...prev,
        {
          productId: prod.id,
          sku: prod.sku,
          description: prod.name,
          quantity,
          unitPriceUSD: linePrice,
        },
      ];
    });
    setQuantity(1);
  };

  const handleAdjustQty = (index: number, delta: number) => {
    setCart((prev) =>
      prev.map((l, i) => (i === index ? { ...l, quantity: l.quantity + delta } : l)),
    );
  };

  const handleRemoveLine = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const submitLockRef = useRef(false);

  /** Único camino de cobro (botón y F4): lock SÍNCRONO anti-re-entrada. */
  const handleSubmit = async () => {
    // Devin #83: el estado `loading` no es un lock — dos F4 en el mismo tick
    // entraban antes del re-render. La ref se setea/limpia sincrónicamente.
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    try {
      await runCheckout();
    } finally {
      submitLockRef.current = false;
    }
  };

  const runCheckout = async () => {
    setError(null);

    if (cart.length === 0) {
      setError('El carrito está vacío: agrega al menos un artículo.');
      return;
    }
    if (openRegisters.length === 0) {
      setError('No hay cajas con turno abierto. Abre el turno de una caja desde "Cajas & Arqueos" antes de vender en el POS.');
      return;
    }
    if (customerMode === 'registered' && !customerId) {
      setError('Debes seleccionar un cliente registrado.');
      return;
    }
    if (paymentTerms === 'credit' && customerMode === 'walkin') {
      setError('El cliente de mostrador no puede comprar a crédito: registra un cliente y selecciónalo.');
      return;
    }

    setLoading(true);

    let effectiveCustomerId = customerId;
    if (customerMode === 'walkin') {
      const walkIn = await ensureWalkInCustomerAction({ tenantId, tenantSlug });
      if (!walkIn.success) {
        setLoading(false);
        setError(walkIn.error || 'No se pudo preparar el cliente de mostrador.');
        return;
      }
      effectiveCustomerId = (walkIn.data as { id: number }).id;
    }

    const res = await createInvoiceAction({
      tenantId,
      tenantSlug,
      customerId: effectiveCustomerId,
      paymentTerms,
      cashMethod: paymentTerms === 'cash' ? (cashMethod as 'cash_usd') : undefined,
      cashRegisterId: registerId,
      warehouseId,
      items: cart.map((l) => ({
        productId: l.productId,
        sku: l.sku,
        description: l.description,
        quantity: l.quantity,
        unitPriceUSD: l.unitPriceUSD,
      })),
    });

    setLoading(false);

    if (res.success && 'status' in res && res.status === 'pending_approval') {
      setCart([]);
      setQuantity(1);
      setAmountGiven('');
      setApprovalNotice(
        `Solicitud #${res.approvalId} enviada a supervisión — la venta espera autorización en "Aprobaciones".`,
      );
      return;
    }

    if (res.success) {
      setLastInvoiceNumber((res.data as { invoiceNumber: string }).invoiceNumber);
      setCart([]);
      setQuantity(1);
      setAmountGiven('');
    } else {
      setError(res.error || 'Error al procesar la venta.');
    }
  };

  // Atajos globales (IE-PR2): F2 enfoca el escáner, F4 dispara "Cobrar y
  // Facturar". F4 invoca el MISMO handleSubmit del botón mediante ref de
  // closure fresca — un único camino de validaciones, el atajo no puede
  // saltarse ninguna guarda. Las F-keys no escriben texto: un listener global
  // de keydown no interfiere con ningún input.
  const submitRef = useRef<() => void>(() => {});
  // Devin #78: F4 con la tecla mantenida (auto-repeat) o durante un envío en
  // curso volvía a disparar handleSubmit y DUPLICABA la venta. El atajo ignora
  // key-repeat y respeta el estado loading vía ref (misma técnica que
  // submitRef, reasignada en efecto).
  const loadingRef = useRef(false);

  // Closure fresca: la ref se reasigna en cada render (dentro de un efecto, como
  // exige la regla react-hooks/refs), así F4 ejecuta siempre la versión vigente
  // — que internamente además lleva el lock síncrono anti-re-entrada.
  useEffect(() => {
    submitRef.current = handleSubmit;
    loadingRef.current = loading;
  });

  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'F2') {
        e.preventDefault();
        scannerRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (loadingRef.current) return;
        submitRef.current();
      }
    };
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, []);

  return (
    <div className="space-y-5">
      {/* Banner de venta exitosa */}
      {lastInvoiceNumber && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              Venta registrada: {lastInvoiceNumber}
            </p>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-400/70">
              El recibo entró al turno de la caja seleccionada y el inventario fue descargado del almacén.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLastInvoiceNumber(null)}>
            Nueva venta
          </Button>
        </div>
      )}

      {/* Aviso de solicitud pendiente de autorización (IE-PR6) */}
      {approvalNotice && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <p className="flex-1 text-sm font-semibold text-amber-600 dark:text-amber-400">{approvalNotice}</p>
          <Button variant="outline" size="sm" onClick={() => setApprovalNotice(null)}>
            Entendido
          </Button>
        </div>
      )}

      {/* Aviso sin turno abierto */}
      {openRegisters.length === 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-600 dark:text-amber-400">No hay turnos de caja abiertos</p>
            <p className="text-xs text-amber-600/80 dark:text-amber-400/70">
              Abre el turno de una caja (con su fondo de apertura) para vender en el POS.
            </p>
          </div>
          <Button size="sm" asChild>
            <Link href={`/${tenantSlug}/erp/cash-registers`}>
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
              Ir a Cajas & Arqueos
            </Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        {/* Panel izquierdo: catálogo y ticket */}
        <div className="xl:col-span-3 space-y-4">
          {/* Agregar artículos — targets XL de mostrador */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">Agregar Artículos</h2>
              {activeTier !== 'retail' && (
                <Badge variant="indigo" size="sm">
                  Tier {activeTier}
                </Badge>
              )}
            </div>

            {/* Escáner / búsqueda rápida (IE-PR2): HID escribe + Enter → exacto barcode|sku agrega al tier */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-medium text-muted-foreground text-[11px]" htmlFor="pos-scan">
                  <ScanBarcode className="h-3.5 w-3.5 inline mr-1 -mt-0.5" aria-hidden="true" />
                  Escáner / búsqueda rápida
                </label>
                <span className="text-[10px] text-muted-foreground font-mono">F2 enfoca · ESC limpia · F4 cobra</span>
              </div>
              <Input
                ref={scannerRef}
                id="pos-scan"
                type="text"
                autoComplete="off"
                autoFocus
                role="combobox"
                aria-expanded={scanOpen && scanOptions.length > 0}
                aria-controls="pos-scan-listbox"
                aria-autocomplete="list"
                aria-activedescendant={
                  scanOpen && scanOptions[scanIndex] ? `pos-scan-opt-${scanIndex}` : undefined
                }
                value={scanQuery}
                onChange={(e) => {
                  setScanQuery(e.target.value);
                  setScanOpen(e.target.value.trim() !== '');
                  setScanIndex(0);
                  setAmbiguousPending(false);
                }}
                onKeyDown={handleScanKeyDown}
                placeholder="Dispara el escáner o escribe nombre / SKU…"
                className="h-11 text-sm"
              />
              {ambiguousPending && exactMatches.length > 1 && (
                <p className="mt-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400" role="status">
                  Varios productos comparten este código: elige con ↑↓ y confirma con Enter.
                </p>
              )}
              {scanOpen && scanOptions.length > 0 && (
                <ul
                  id="pos-scan-listbox"
                  role="listbox"
                  aria-label="Resultados de producto"
                  className="mt-1 rounded-lg border border-border bg-card shadow-lg max-h-64 overflow-y-auto overflow-hidden"
                >
                  {scanOptions.map((p, idx) => (
                    <li
                      key={p.id}
                      id={`pos-scan-opt-${idx}`}
                      role="option"
                      aria-selected={idx === scanIndex}
                      className={cn(
                        'px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between gap-2',
                        idx === scanIndex ? 'bg-muted' : 'hover:bg-muted/60',
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addProductAtTierPrice(p);
                        clearScan();
                      }}
                      onMouseEnter={() => setScanIndex(idx)}
                    >
                      <span className="font-medium text-foreground truncate">{p.name}</span>
                      <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                        {p.sku}
                        {p.barcode ? ` · ${p.barcode}` : ''} ·{' '}
                        {formatUSD(effectivePriceForTier(p, activeTier))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-6">
                <label className="block font-medium text-muted-foreground mb-1 text-[11px]" htmlFor="pos-product">
                  Producto
                </label>
                <select
                  id="pos-product"
                  value={selectedSku}
                  onChange={(e) => {
                    setSelectedSku(e.target.value);
                    const prod = products.find((p) => p.sku === e.target.value);
                    if (prod) setUnitPriceInput(String(effectivePriceForTier(prod, activeTier)));
                  }}
                  className={posSelectClass}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.sku}>
                      {p.name} — {p.sku}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block font-medium text-muted-foreground mb-1 text-[11px]" htmlFor="pos-price">
                  Precio $ (editable)
                </label>
                <Input
                  id="pos-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitPriceInput}
                  onChange={(e) => setUnitPriceInput(e.target.value)}
                  className="h-11 text-right font-mono text-sm"
                />
              </div>

              <div className="sm:col-span-3">
                <Button type="button" className="h-11 w-full text-sm" onClick={handleAddLine}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Agregar
                </Button>
              </div>
            </div>

            {/* Cantidades rápidas de un toque */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cantidades rápidas:
              </span>
              {QUICK_QTYS.map((q) => (
                <Button
                  key={q}
                  type="button"
                  variant={quantity === q ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 min-w-10 px-3 text-sm font-mono"
                  onClick={() => setQuantity(q)}
                >
                  {q}
                </Button>
              ))}
              <Input
                type="number"
                min="0.001"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="ml-auto w-24 h-9 text-right font-mono text-sm"
                aria-label="Cantidad manual"
              />
            </div>
          </Card>

          {/* Ticket de venta */}
          <Card className="p-5 space-y-3 min-h-[220px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-foreground">Ticket</h2>
              </div>
              <Badge variant={cart.length > 0 ? 'emerald' : 'slate'} size="sm">
                {cart.length} línea(s) · {totalItems} ítem(s)
              </Badge>
            </div>

            {cart.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="El ticket está vacío" description="Agrega artículos desde el panel superior para comenzar la venta." />
            ) : (
              <ul className="divide-y divide-border">
                {cart.map((l, idx) => (
                  <li key={`${l.productId}-${idx}`} className="py-2.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{l.description}</p>
                      <p className="text-[11px] font-mono text-muted-foreground">
                        {l.sku} · {formatUSD(l.unitPriceUSD)} c/u
                      </p>
                    </div>
                    {/* Stepper táctil: ± 1 */}
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="h-9 w-9"
                        onClick={() => handleAdjustQty(idx, -1)}
                        disabled={l.quantity <= 1}
                        aria-label={`Restar una unidad de ${l.description}`}
                      >
                        <Minus className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <span className="w-10 text-center font-mono text-sm font-bold tabular-nums">
                        {l.quantity}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="h-9 w-9"
                        onClick={() => handleAdjustQty(idx, 1)}
                        aria-label={`Sumar una unidad de ${l.description}`}
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                    <span className="w-24 text-right font-mono text-sm font-bold tabular-nums text-foreground">
                      {formatUSD(l.quantity * l.unitPriceUSD)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="h-9 w-9 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
                      onClick={() => handleRemoveLine(idx)}
                      aria-label={`Quitar ${l.description} del ticket`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Panel derecho: cobro — ticket fijo en desktop */}
        <div className="xl:col-span-2">
          <Card className="p-5 space-y-4 text-sm xl:sticky xl:top-20">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">Cliente & Cobro</h2>
            </div>

            {error && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-600 dark:text-rose-400" role="alert">
                {error}
              </div>
            )}

            {/* Cliente */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={customerMode === 'walkin' ? 'default' : 'outline'}
                  className="h-11"
                  onClick={() => {
                    setCustomerMode('walkin');
                    setPaymentTerms('cash');
                  }}
                >
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                  Mostrador
                </Button>
                <Button
                  type="button"
                  variant={customerMode === 'registered' ? 'default' : 'outline'}
                  className="h-11"
                  onClick={() => setCustomerMode('registered')}
                >
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                  Registrado
                </Button>
              </div>

              {customerMode === 'registered' && (
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(Number(e.target.value))}
                  className={posSelectClass}
                  aria-label="Cliente registrado"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.taxId})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Caja con turno abierto */}
            <div>
              <label className="block font-semibold text-muted-foreground mb-1 text-xs" htmlFor="pos-register">
                Caja (Turno Abierto) *
              </label>
              <select
                id="pos-register"
                value={registerId ?? ''}
                onChange={(e) => setRegisterId(e.target.value ? Number(e.target.value) : undefined)}
                className={posSelectClass}
              >
                {openRegisters.length === 0 && <option value="">-- Sin turnos abiertos --</option>}
                {openRegisters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Condición y método */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-muted-foreground mb-1 text-xs" htmlFor="pos-terms">
                  Condición
                </label>
                <select
                  id="pos-terms"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value as 'cash' | 'credit')}
                  className={cn(posSelectClass, 'font-semibold')}
                >
                  <option value="cash">Contado</option>
                  {customerMode === 'registered' && <option value="credit">Crédito</option>}
                </select>
              </div>

              {paymentTerms === 'cash' && (
                <div>
                  <label className="block font-semibold text-muted-foreground mb-1 text-xs" htmlFor="pos-method">
                    Método
                  </label>
                  <select
                    id="pos-method"
                    value={cashMethod}
                    onChange={(e) => setCashMethod(e.target.value)}
                    className={posSelectClass}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Almacén */}
            {warehouses.length > 0 && (
              <div>
                <label className="block font-semibold text-muted-foreground mb-1 text-xs" htmlFor="pos-warehouse">
                  Almacén de Despacho
                </label>
                <select
                  id="pos-warehouse"
                  value={warehouseId ?? ''}
                  onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : undefined)}
                  className={posSelectClass}
                >
                  <option value="">-- Por defecto del inquilino --</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code}){w.isDefault ? ' ★' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Visor bimonetario */}
            <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2">
              <div className="flex items-center justify-between text-lg font-bold text-foreground">
                <span>Total USD</span>
                <span className="font-mono tabular-nums">{formatUSD(totalUSD)}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
                <span>Equivalente Bs.</span>
                <span className="font-mono tabular-nums">{formatVES(totalVES)}</span>
              </div>
            </div>

            {/* Vuelto bimonetario (IE-PR2): puro UI, el cobro registrado sigue siendo el total */}
            {isCashChange && cart.length > 0 && (
              <div className="space-y-2">
                <label className="block font-semibold text-muted-foreground mb-1 text-xs" htmlFor="pos-given">
                  Entregado por el cliente ({cashMethod === 'cash_usd' ? '$' : 'Bs.'})
                </label>
                <Input
                  id="pos-given"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountGiven}
                  onChange={(e) => setAmountGiven(e.target.value)}
                  className="h-11 text-right font-mono text-sm"
                  placeholder={cashMethod === 'cash_usd' ? formatUSD(totalUSD) : formatVES(totalVES)}
                />
                {hasGiven && (
                  changeAmount >= 0 ? (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1">
                      <div className="flex items-center justify-between text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        <span>Vuelto {cashMethod === 'cash_usd' ? '(USD)' : '(Bs.)'}</span>
                        <span className="font-mono tabular-nums">
                          {cashMethod === 'cash_usd' ? formatUSD(changeAmount) : formatVES(changeAmount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                        <span>Equivale a</span>
                        <span className="font-mono tabular-nums">
                          {cashMethod === 'cash_usd'
                            ? formatVES(changeAmount * rate)
                            : formatUSD(changeAmount / rate)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-bold text-rose-600 dark:text-rose-400"
                      role="alert"
                    >
                      Faltan{' '}
                      {cashMethod === 'cash_usd'
                        ? formatUSD(-changeAmount)
                        : formatVES(-changeAmount)}{' '}
                      para cubrir el total.
                    </div>
                  )
                )}
              </div>
            )}

            <Button
              type="button"
              size="lg"
              className="h-14 w-full text-base font-bold"
              onClick={handleSubmit}
              disabled={loading || cart.length === 0}
            >
              {loading && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
              Cobrar y Facturar
            </Button>

            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              La venta de contado genera el recibo automático en el turno de la caja y
              descarga el inventario del almacén de despacho (Kardex).
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
