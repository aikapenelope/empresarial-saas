'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Loader2, Mail, MessageCircle, Plus, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { createQuoteAction } from '@/actions/erpActions';
import { ensureShareUrlAction, sendDocumentEmailAction } from '@/actions/shareActions';
import { effectivePriceForTier } from '@/utilities/priceTiers';
import { formatUSD, formatVES } from './format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from './Badge';

/**
 * Sprint 28 (reskin 37): armado veloz de cotizaciones. Producto por SKU/nombre
 * (datalist nativo), Enter agrega la línea al precio efectivo del tier del
 * cliente, totales USD/VES en vivo, y al guardar se ofrece el envío directo
 * por email (Resend) y el compartido por WhatsApp con el enlace público.
 */
interface QuickQuoteBuilderProps {
  tenantId: number;
  tenantSlug: string;
  customers: Array<{ id: number; name: string; email?: string | null; priceTier?: string | null }>;
  products: Array<{
    id: number;
    name: string;
    sku: string;
    priceUSD: number;
    priceTiers?: Array<{ tier: string; priceUSD: number }> | null;
  }>;
  effectiveRate: number;
}

interface QuickLine {
  key: number;
  productId?: number;
  sku: string;
  description: string;
  quantity: number;
  unitPriceUSD: number;
}

type Tier = 'retail' | 'wholesale' | 'vendor' | 'promo';

const tierFor = (priceTier?: string | null): Tier =>
  priceTier === 'wholesale' || priceTier === 'vendor' || priceTier === 'promo' ? priceTier : 'retail';

export function QuickQuoteBuilder({ tenantId, tenantSlug, customers, products, effectiveRate }: QuickQuoteBuilderProps) {
  const [customerId, setCustomerId] = useState<number>(customers[0]?.id || 0);
  const [query, setQuery] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [lines, setLines] = useState<QuickLine[]>([]);
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() + 15);
    return date.toISOString().slice(0, 10);
  });
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState<{ id: number; quoteNumber: string; email: string } | null>(null);
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const lineKey = useRef(0);

  const selectedTier = tierFor(customers.find((c) => c.id === customerId)?.priceTier);
  const prevTierRef = useRef<Tier>(selectedTier);

  // Cambio de cliente (tier): re-precia sólo las líneas "automáticas" — aquéllas
  // cuyo precio sigue siendo el efectivo del tier ANTERIOR (mismo criterio que
  // QuoteModal). Las editadas manualmente se conservan intactas.
  useEffect(() => {
    const prevTier = prevTierRef.current;
    if (prevTier === selectedTier) return;
    prevTierRef.current = selectedTier;

    setLines((prev) =>
      prev.map((line) => {
        const product = products.find((p) => p.id === line.productId);
        if (!product) return line;
        const prevPrice = effectivePriceForTier(product, prevTier);
        const nextPrice = effectivePriceForTier(product, selectedTier);
        // Sólo re-precia si el precio actual sigue siendo el efectivo previo.
        if (Math.abs(line.unitPriceUSD - prevPrice) < 0.005) {
          return { ...line, unitPriceUSD: nextPrice };
        }
        return line;
      }),
    );
  }, [selectedTier, products]);

  const totalUSD = useMemo(
    () => lines.reduce((acc, line) => acc + line.quantity * line.unitPriceUSD, 0),
    [lines],
  );

  const addLine = () => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      toast.error('Escribe un SKU o nombre de producto.');
      return;
    }
    const product =
      products.find((p) => p.sku.toLowerCase() === needle) ||
      products.find((p) => p.name.toLowerCase() === needle) ||
      products.find((p) => p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle));
    if (!product) {
      toast.error('Producto no encontrado en el catálogo.');
      return;
    }
    if (quantity <= 0) {
      toast.error('La cantidad debe ser mayor a 0.');
      return;
    }
    lineKey.current += 1;
    setLines((prev) => [
      ...prev,
      {
        key: lineKey.current,
        productId: product.id,
        sku: product.sku,
        description: product.name,
        quantity,
        unitPriceUSD: effectivePriceForTier(product, selectedTier),
      },
    ]);
    setQuery('');
    setQuantity(1);
  };

  const updateLine = (key: number, patch: Partial<QuickLine>) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const removeLine = (key: number) => {
    setLines((prev) => prev.filter((line) => line.key !== key));
  };

  const handleSave = async () => {
    if (lines.length === 0) {
      toast.error('Agrega al menos una línea a la cotización.');
      return;
    }
    setSaving(true);
    const res = await createQuoteAction({
      tenantId,
      tenantSlug,
      customerId,
      items: lines.map((line) => ({
        productId: line.productId,
        sku: line.sku,
        description: line.description,
        quantity: line.quantity,
        unitPriceUSD: line.unitPriceUSD,
      })),
      validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
      notes: notes || undefined,
    });
    setSaving(false);

    if (!res.success) {
      toast.error(res.error || 'No se pudo crear la cotización.');
      return;
    }
    const doc = res.data;
    if (!doc) {
      toast.error('No se pudo crear la cotización.');
      return;
    }
    toast.success(`${doc.quoteNumber || 'Cotización'} guardada.`);
    setSaved({ id: doc.id, quoteNumber: doc.quoteNumber, email: customers.find((c) => c.id === customerId)?.email || '' });
    setEmail(customers.find((c) => c.id === customerId)?.email || '');
  };

  const handleSendEmail = async () => {
    if (!saved) return;
    setSending(true);
    const res = await sendDocumentEmailAction({
      collection: 'quotes',
      tenantId,
      documentId: saved.id,
      email,
    });
    setSending(false);
    if (!res.ok) {
      toast.error(res.error || 'No se pudo enviar el email.');
      return;
    }
    toast.success(`Email en camino a ${email}.`);
  };

  const handleWhatsApp = async () => {
    if (!saved) return;
    setSending(true);
    const res = await ensureShareUrlAction({ collection: 'quotes', tenantId, documentId: saved.id });
    setSending(false);
    if (!res.ok || !res.whatsappText) {
      toast.error(res.error || 'No se pudo generar el enlace.');
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(res.whatsappText)}`, '_blank', 'noopener');
  };

  const handleCopy = async () => {
    if (!saved) return;
    const res = await ensureShareUrlAction({ collection: 'quotes', tenantId, documentId: saved.id });
    if (!res.ok || !res.shareUrl) {
      toast.error(res.error || 'No se pudo generar el enlace.');
      return;
    }
    try {
      await navigator.clipboard.writeText(res.shareUrl);
      setCopied(true);
      toast.success('Enlace público copiado.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('El navegador bloqueó el portapapeles.');
    }
  };

  const resetForNew = () => {
    setSaved(null);
    setLines([]);
    setNotes('');
    setQuery('');
    setQuantity(1);
  };

  return (
    <div className="space-y-5">
      {/* Cliente + validez */}
      <Card className="rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="quick-customer" className="block text-xs font-semibold text-muted-foreground mb-1">
              Cliente
            </label>
            <select
              id="quick-customer"
              value={customerId}
              onChange={(e) => setCustomerId(Number(e.target.value))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({tierFor(c.priceTier)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="quick-valid" className="block text-xs font-semibold text-muted-foreground mb-1">
              Válida hasta
            </label>
            <Input
              id="quick-valid"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="quick-notes" className="block text-xs font-semibold text-muted-foreground mb-1">
              Notas (opcional)
            </label>
            <Input
              id="quick-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Condiciones, alcance…"
            />
          </div>
        </div>
      </Card>

      {/* Agregar producto (Enter agrega) */}
      <Card className="rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px_auto] gap-3">
          <div>
            <label htmlFor="quick-product" className="block text-xs font-semibold text-muted-foreground mb-1">
              Producto (SKU o nombre) — Enter agrega
            </label>
            <Input
              id="quick-product"
              list="quick-product-options"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addLine();
                }
              }}
              placeholder="Ej: SKU-001 o Tornillo…"
            />
            <datalist id="quick-product-options">
              {products.map((p) => (
                <option key={p.id} value={p.sku}>
                  {p.name}
                </option>
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="quick-qty" className="block text-xs font-semibold text-muted-foreground mb-1">
              Cantidad
            </label>
            <Input
              id="quick-qty"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={addLine}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Agregar
            </Button>
          </div>
        </div>
      </Card>

      {/* Líneas */}
      {lines.length > 0 ? (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="p-3 text-left font-semibold">Descripción</th>
                <th className="p-3 text-right font-semibold w-24">Cant.</th>
                <th className="p-3 text-right font-semibold w-32">Precio USD</th>
                <th className="p-3 text-right font-semibold w-32">Total USD</th>
                <th className="p-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((line) => (
                <tr key={line.key}>
                  <td className="p-3 text-foreground">
                    {line.description}
                    <span className="ml-2 font-mono text-[11px] text-muted-foreground">{line.sku}</span>
                  </td>
                  <td className="p-3">
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })}
                      className="h-8 text-right"
                    />
                  </td>
                  <td className="p-3">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.unitPriceUSD}
                      onChange={(e) => updateLine(line.key, { unitPriceUSD: Number(e.target.value) })}
                      className="h-8 text-right font-mono"
                    />
                  </td>
                  <td className="p-3 text-right font-mono font-semibold tabular-nums">
                    {formatUSD(line.quantity * line.unitPriceUSD)}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeLine(line.key)}
                      title="Quitar línea"
                      className="text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Agrega productos con el buscador de arriba. El precio se toma del tier del cliente y puedes ajustarlo por línea.
        </div>
      )}

      {/* Totales + guardar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="text-right space-y-0.5">
          <div className="text-2xl font-bold tabular-nums text-foreground">{formatUSD(totalUSD)}</div>
          <div className="text-xs text-muted-foreground tabular-nums">
            ≈ {formatVES(totalUSD * effectiveRate)} (tasa {effectiveRate.toFixed(4)})
          </div>
          {selectedTier !== 'retail' && (
            <Badge variant="indigo" size="sm">
              Precios tier {selectedTier}
            </Badge>
          )}
        </div>
        <Button
          type="button"
          size="lg"
          onClick={handleSave}
          disabled={saving || lines.length === 0}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Zap className="h-4 w-4" aria-hidden="true" />}
          Guardar cotización
        </Button>
      </div>

      {/* Panel de envío tras guardar */}
      {saved && (
        <div className="rounded-xl border border-emerald-600/40 bg-emerald-500/10 p-5 space-y-4 dark:bg-emerald-500/5">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="h-4 w-4" aria-hidden="true" />
            {saved.quoteNumber} guardada. ¿La enviamos ahora?
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
            <div>
              <label htmlFor="quick-send-email" className="block text-xs font-semibold text-muted-foreground mb-1">
                Correo del cliente
              </label>
              <Input
                id="quick-send-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@correo.com"
              />
            </div>
            <Button
              type="button"
              onClick={handleSendEmail}
              disabled={sending || !email}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
              Enviar email
            </Button>
            <Button
              type="button"
              onClick={handleWhatsApp}
              disabled={sending}
              className="text-emerald-600 dark:text-emerald-400"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              WhatsApp
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCopy}
              disabled={sending}
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              Copiar enlace
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              El email sale por Resend con un enlace público para ver/descargar el documento.
            </p>
            <Link
              href={`/${tenantSlug}/erp/quotes`}
              onClick={resetForNew}
              className="text-xs font-semibold text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              Ir al listado de cotizaciones
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
