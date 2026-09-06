'use client';

import React, { useMemo, useState } from 'react';
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
} from 'lucide-react';
import { createInvoiceAction, ensureWalkInCustomerAction } from '@/actions/erpActions';
import { formatUSD, formatVES } from './KpiCard';
import { Badge } from './Badge';

interface POSViewProps {
  tenantId: number;
  tenantSlug: string;
  rate: number;
  products: Array<{ id: number; name: string; sku: string; priceUSD: number; unitOfMeasure: string }>;
  customers: Array<{ id: number; name: string; taxId: string; currentDebtUSD?: number | null }>;
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
  const [unitPriceUSD, setUnitPriceUSD] = useState<number>(products[0]?.priceUSD || 0);

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

  const totalUSD = useMemo(
    () => cart.reduce((acc, it) => acc + it.quantity * it.unitPriceUSD, 0),
    [cart],
  );
  const totalVES = totalUSD * rate;

  const handleAddLine = () => {
    const prod = products.find((p) => p.sku === selectedSku);
    if (!prod || quantity <= 0) {
      setError('Selecciona un producto y una cantidad válida.');
      return;
    }
    setError(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === prod.id && l.unitPriceUSD === unitPriceUSD);
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
          unitPriceUSD,
        },
      ];
    });
    setQuantity(1);
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
    <div className="space-y-6">
      {/* Banner de venta exitosa */}
      {lastInvoiceNumber && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <div className="flex-1">
            <p className="text-sm font-bold text-emerald-300">
              Venta registrada: {lastInvoiceNumber}
            </p>
            <p className="text-xs text-emerald-400/70">
              El recibo entró al turno de la caja seleccionada y el inventario fue descargado del almacén.
            </p>
          </div>
          <button
            onClick={() => setLastInvoiceNumber(null)}
            className="text-xs text-slate-400 hover:text-white"
          >
            Nueva venta
          </button>
        </div>
      )}

      {/* Aviso sin turno abierto */}
      {openRegisters.length === 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-300">No hay turnos de caja abiertos</p>
            <p className="text-xs text-amber-400/70">
              Abre el turno de una caja (con su fondo de apertura) para vender en el POS.
            </p>
          </div>
          <Link
            href={`/${tenantSlug}/erp/cash-registers`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white"
          >
            <Wallet className="h-3.5 w-3.5" />
            <span>Ir a Cajas & Arqueos</span>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Panel izquierdo: catálogo y carrito */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white">Agregar Artículos</h2>
            </div>

            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-6">
                <label className="block font-medium text-slate-400 mb-1 text-[11px]">Producto</label>
                <select
                  value={selectedSku}
                  onChange={(e) => {
                    setSelectedSku(e.target.value);
                    const prod = products.find((p) => p.sku === e.target.value);
                    if (prod) setUnitPriceUSD(prod.priceUSD);
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white text-xs focus:border-indigo-500 focus:outline-none"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.sku}>
                      {p.name} — {p.sku}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block font-medium text-slate-400 mb-1 text-[11px]">Cant.</label>
                <input
                  type="number"
                  min="0.001"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white text-xs text-right font-mono"
                />
              </div>

              <div className="col-span-2">
                <label className="block font-medium text-slate-400 mb-1 text-[11px]">Precio $</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitPriceUSD}
                  onChange={(e) => setUnitPriceUSD(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white text-xs text-right font-mono"
                />
              </div>

              <div className="col-span-2">
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Agregar</span>
                </button>
              </div>
            </div>
          </div>

          {/* Carrito */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 space-y-3 min-h-[180px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">Carrito de Venta</h2>
              </div>
              <Badge variant="slate" size="sm">
                {cart.length} línea(s)
              </Badge>
            </div>

            {cart.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">
                Agrega artículos desde el panel superior para comenzar la venta.
              </p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <th className="pb-2">Producto</th>
                    <th className="pb-2 text-right">Cant.</th>
                    <th className="pb-2 text-right">Precio $</th>
                    <th className="pb-2 text-right">Total $</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {cart.map((l, idx) => (
                    <tr key={`${l.productId}-${idx}`}>
                      <td className="py-2 text-white">{l.description}</td>
                      <td className="py-2 text-right font-mono text-slate-300">{l.quantity}</td>
                      <td className="py-2 text-right font-mono text-slate-300">
                        {formatUSD(l.unitPriceUSD)}
                      </td>
                      <td className="py-2 text-right font-mono font-bold text-emerald-400">
                        {formatUSD(l.quantity * l.unitPriceUSD)}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Panel derecho: cobro */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 space-y-4 text-xs">
            <h2 className="text-sm font-semibold text-white">Cliente & Cobro</h2>

            {error && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300">
                {error}
              </div>
            )}

            {/* Cliente */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCustomerMode('walkin');
                    setPaymentTerms('cash');
                  }}
                  className={`flex-1 px-2 py-1.5 rounded-lg font-medium transition-colors ${
                    customerMode === 'walkin'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-slate-400 border border-slate-800'
                  }`}
                >
                  Mostrador
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerMode('registered')}
                  className={`flex-1 px-2 py-1.5 rounded-lg font-medium transition-colors ${
                    customerMode === 'registered'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-slate-400 border border-slate-800'
                  }`}
                >
                  Cliente registrado
                </button>
              </div>

              {customerMode === 'registered' && (
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
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
              <label className="block font-semibold text-slate-300 mb-1">Caja (Turno Abierto) *</label>
              <select
                value={registerId ?? ''}
                onChange={(e) => setRegisterId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
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
                <label className="block font-semibold text-slate-300 mb-1">Condición</label>
                <select
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value as 'cash' | 'credit')}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none font-semibold"
                >
                  <option value="cash">Contado</option>
                  {customerMode === 'registered' && <option value="credit">Crédito</option>}
                </select>
              </div>

              {paymentTerms === 'cash' && (
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Método</label>
                  <select
                    value={cashMethod}
                    onChange={(e) => setCashMethod(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
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
                <label className="block font-semibold text-slate-300 mb-1">Almacén de Despacho</label>
                <select
                  value={warehouseId ?? ''}
                  onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
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

            {/* Totales */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2">
              <div className="flex items-center justify-between text-base font-bold text-white border-t border-slate-800/80 pt-2">
                <span>Total (USD):</span>
                <span className="font-mono text-indigo-400">{formatUSD(totalUSD)}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-400">
                <span>Equivalente Bs.:</span>
                <span className="font-mono">{formatVES(totalVES)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || cart.length === 0}
              className="w-full inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Cobrar y Facturar</span>
            </button>

            <p className="text-[10px] text-slate-500 text-center">
              La venta de contado genera el recibo automático en el turno de la caja y
              descarga el inventario del almacén de despacho (Kardex).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
