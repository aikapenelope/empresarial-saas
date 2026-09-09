'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSyncOnKeyChange } from '../hooks/useSyncOnKeyChange';
import { Modal } from './Modal';
import { toast } from 'sonner';
import { createQuoteAction, updateQuoteAction } from '@/actions/erpActions';
import { effectivePriceForTier } from '@/utilities/priceTiers';
import { formatUSD, formatVES } from '../format';
import { Plus, Trash2, Loader2 } from 'lucide-react';

interface QuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
  customers: Array<{ id: number; name: string; taxId: string; priceTier?: string | null }>;
  /** Si se pasa, el modal opera en modo edición sobre esa cotización (draft/sent). */
  initial?: {
    id: number;
    customerId: number;
    items: Array<{ productId?: number; sku?: string; description: string; quantity: number; unitPriceUSD: number }>;
    validUntil?: string | null;
    notes?: string | null;
  } | null;
  products: Array<{
    id: number;
    name: string;
    sku: string;
    priceUSD: number;
    priceTiers?: Array<{ tier: string; priceUSD: number }> | null;
  }>;
  rate: number;
}

interface QuoteLine {
  productId?: number;
  sku: string;
  description: string;
  quantity: number;
  unitPriceUSD: number;
}

export function QuoteModal({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  customers,
  products,
  rate,
  initial,
}: QuoteModalProps) {
  const isEdit = Boolean(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tier del cliente seleccionado con la MISMA utilidad que InvoiceModal y
  // POSView: líneas nuevas/seleccionadas parten del precio efectivo del tier
  // (fallback retail), no del priceUSD base.
  const tierFor = (id: number) => customers.find((c) => c.id === id)?.priceTier || 'retail';
  const initialTier = tierFor(initial?.customerId || customers[0]?.id || 0);

  const [customerId, setCustomerId] = useState<number>(initial?.customerId || customers[0]?.id || 0);
  const [validUntil, setValidUntil] = useState<string>(
    initial?.validUntil ? initial.validUntil.slice(0, 10) : '',
  );
  const [notes, setNotes] = useState(initial?.notes || '');

  const customerTier = tierFor(customerId);
  const priceFor = (product: {
    priceUSD?: number | null;
    priceTiers?: Array<{ tier: string; priceUSD?: number | null }> | null;
  }) => effectivePriceForTier(product, customerTier);

  // Tier vigente en el último render/carga: sirve para distinguir líneas
  // auto-precidas de las editadas manualmente al cambiar de cliente.
  const prevTierRef = useRef<string>(initialTier);

  const [items, setItems] = useState<QuoteLine[]>(
    initial?.items?.length
      ? initial.items.map((it) => ({
          productId: it.productId,
          sku: it.sku || '',
          description: it.description,
          quantity: it.quantity,
          unitPriceUSD: it.unitPriceUSD,
        }))
      : [
          {
            productId: products[0]?.id,
            sku: products[0]?.sku || '',
            description: products[0]?.name || 'Concepto Cotizado',
            quantity: 1,
            unitPriceUSD: products[0] ? effectivePriceForTier(products[0], initialTier) : 0,
          },
        ],
  );

  // Sincroniza SIEMPRE los campos con `initial`: al montar, al abrir y cuando
  // cambia la cotización seleccionada. Con initial null (modo creación)
  // restaura los defaults para que un "Nueva Cotización" no herede valores.
  // Ajuste de estado en render (patrón oficial de React) en lugar de useEffect.
  useSyncOnKeyChange(`${isOpen}:${initial?.id ?? 'new'}`, () => {
    if (initial) {
      setCustomerId(initial.customerId || customers[0]?.id || 0);
      setValidUntil(initial.validUntil ? initial.validUntil.slice(0, 10) : '');
      setNotes(initial.notes || '');
      setItems(
        initial.items?.length
          ? initial.items.map((it) => ({
              productId: it.productId,
              sku: it.sku || '',
              description: it.description,
              quantity: it.quantity,
              unitPriceUSD: it.unitPriceUSD,
            }))
          : [
              {
                productId: products[0]?.id,
                sku: products[0]?.sku || '',
                description: products[0]?.name || 'Concepto Cotizado',
                quantity: 1,
                unitPriceUSD: products[0]?.priceUSD || 0,
              },
            ],
      );
    } else {
      const defaultCustomerId = customers[0]?.id || 0;
      setCustomerId(defaultCustomerId);
      setValidUntil('');
      setNotes('');
      setItems([
        {
          productId: products[0]?.id,
          sku: products[0]?.sku || '',
          description: products[0]?.name || 'Concepto Cotizado',
          quantity: 1,
          unitPriceUSD: products[0] ? effectivePriceForTier(products[0], tierFor(defaultCustomerId)) : 0,
        },
      ]);
    }
    prevTierRef.current = tierFor(initial?.customerId || customers[0]?.id || 0);
  });

  // Cambio de cliente: sólo se re-precian las líneas cuyo precio sigue siendo
  // el efectivo del tier ANTERIOR (auto-gestionadas). Las editadas manualmente
  // (precio distinto al efectivo previo) se conservan intactas.
  useEffect(() => {
    const prevTier = prevTierRef.current;
    if (prevTier === customerTier) return;
    prevTierRef.current = customerTier;
    setItems((current) =>
      current.map((line) => {
        if (!line.productId) return line;
        const prod = products.find((p) => p.id === line.productId);
        if (!prod) return line;
        const prevPrice = effectivePriceForTier(prod, prevTier);
        const nextPrice = effectivePriceForTier(prod, customerTier);
        if (Math.abs(line.unitPriceUSD - prevPrice) < 0.005 && Math.abs(nextPrice - prevPrice) > 0.005) {
          return { ...line, unitPriceUSD: nextPrice };
        }
        return line;
      }),
    );
  }, [customerId, customerTier, products]);

  const handleAddItem = () => {
    const prod = products[0];
    setItems([
      ...items,
      {
        productId: prod?.id,
        sku: prod?.sku || '',
        description: prod?.name || 'Concepto',
        quantity: 1,
        unitPriceUSD: prod ? priceFor(prod) : 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSelectProduct = (index: number, sku: string) => {
    const prod = products.find((p) => p.sku === sku);
    if (!prod) return;
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      productId: prod.id,
      sku: prod.sku,
      description: prod.name,
      unitPriceUSD: priceFor(prod),
    };
    setItems(newItems);
  };

  const handleItemChange = (
    index: number,
    field: 'quantity' | 'unitPriceUSD' | 'description',
    value: number | string,
  ) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const totalUSD = items.reduce(
    (acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unitPriceUSD) || 0),
    0,
  );
  const totalVES = totalUSD * rate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      setError('Debes seleccionar un cliente.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = isEdit
      ? await updateQuoteAction({
          tenantId,
          tenantSlug,
          quoteId: initial!.id,
          customerId,
          items,
          // Edición: vaciar el campo envía null (limpia); no undefined.
          validUntil: validUntil ? new Date(validUntil).toISOString() : null,
          notes: notes.trim() === '' ? null : notes,
        })
      : await createQuoteAction({
          tenantId,
          tenantSlug,
          customerId,
          items,
          validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
          notes: notes || undefined,
        });

    setLoading(false);

    if (res.success) {
      toast.success(isEdit ? 'Cotización actualizada.' : 'Cotización creada.');
      if (!isEdit) {
        setNotes('');
        setValidUntil('');
      }
      onClose();
    } else {
      setError(res.error || 'Error al crear la cotización');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Editar Cotización' : 'Nueva Cotización'}
      description="Cotiza sin facturar: al aceptarla, se convierte en factura con un clic manteniendo las líneas."
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-foreground mb-1">Cliente *</label>
            <select
              required
              value={customerId}
              onChange={(e) => setCustomerId(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:border-ring focus:outline-none"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.taxId})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-foreground mb-1">Válida Hasta</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:border-ring focus:outline-none"
            />
          </div>
        </div>

        {/* Líneas */}
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground uppercase tracking-wider text-[10px]">
              Líneas Cotizadas
            </span>
            <button
              type="button"
              onClick={handleAddItem}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Agregar Línea</span>
            </button>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {items.map((it, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg bg-muted/50 border border-border"
              >
                <div className="col-span-4">
                  <select
                    value={it.sku}
                    onChange={(e) => handleSelectProduct(idx, e.target.value)}
                    className="w-full rounded border border-border bg-background p-1.5 text-xs text-foreground"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.sku}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <input
                    type="number"
                    min="1"
                    value={it.quantity}
                    onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                    className="w-full rounded border border-border bg-background p-1.5 text-xs text-foreground text-right font-mono"
                    placeholder="Cant."
                  />
                </div>

                <div className="col-span-3">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={it.unitPriceUSD}
                    onChange={(e) => handleItemChange(idx, 'unitPriceUSD', Number(e.target.value))}
                    className="w-full rounded border border-border bg-background p-1.5 text-xs text-foreground text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold"
                    placeholder="Precio $"
                  />
                </div>

                <div className="col-span-2 text-right font-mono font-bold text-foreground text-xs">
                  {formatUSD(it.quantity * it.unitPriceUSD)}
                </div>

                <div className="col-span-1 text-right">
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    disabled={items.length <= 1}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-30 p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totales */}
        <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-2">
          <div className="flex items-center justify-between text-foreground">
            <span>Tasa Aplicada:</span>
            <span className="font-mono text-xs">{formatVES(rate)} / USD</span>
          </div>
          <div className="flex items-center justify-between text-base font-bold text-foreground border-t border-border pt-2">
            <span>Total Cotizado (USD):</span>
            <span className="font-mono text-indigo-400">{formatUSD(totalUSD)}</span>
          </div>
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <span>Equivalente en Bolívares:</span>
            <span className="font-mono">{formatVES(totalVES)}</span>
          </div>
        </div>

        <div>
          <label className="block font-semibold text-foreground mb-1">Notas / Alcance Ofrecido</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. Incluye instalación y 6 meses de garantía"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border hover:bg-background text-foreground font-semibold"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-foreground font-semibold transition-all disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{isEdit ? 'Guardar Cambios' : 'Crear Cotización'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
