'use client';

import React, { useMemo, useRef, useState } from 'react';
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
} from 'lucide-react';
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

  const handleSubmit = async () => {
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

    if (res.success) {
      setLastInvoiceNumber((res.data as { invoiceNumber: string }).invoiceNumber);
      setCart([]);
      setQuantity(1);
    } else {
      setError(res.error || 'Error al procesar la venta.');
    }
  };

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
              <p className="text-sm text-muted-foreground text-center py-10">
                Agrega artículos desde el panel superior para comenzar la venta.
              </p>
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
