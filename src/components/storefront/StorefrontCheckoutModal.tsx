'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatUSD, formatVES } from '@/components/erp/format';
import {
  createStorefrontQuoteAction,
  type CreateStorefrontQuoteResult,
} from '@/actions/storefrontActions';
import type { CartItem, StorefrontTenantInfo } from './types';
import { CheckCircle2, MessageCircle, FileText, Loader2, AlertCircle } from 'lucide-react';

interface StorefrontCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  tenant: StorefrontTenantInfo;
  onOrderSuccess: () => void;
}

export const StorefrontCheckoutModal: React.FC<StorefrontCheckoutModalProps> = ({
  isOpen,
  onClose,
  cart,
  tenant,
  onOrderSuccess,
}) => {
  const [companyName, setCompanyName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<CreateStorefrontQuoteResult | null>(null);

  const totalUSD = cart.reduce(
    (acc, item) => acc + item.product.priceUSD * item.quantity,
    0,
  );
  const totalVES = tenant.bcvRate > 0 ? totalUSD * tenant.bcvRate : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!companyName.trim() || !taxId.trim() || !phone.trim()) {
      setErrorMessage('Por favor complete la Razón Social, RIF y Teléfono WhatsApp.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await createStorefrontQuoteAction({
        tenantSlug: tenant.slug,
        companyName: companyName.trim(),
        taxId: taxId.trim().toUpperCase(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        notes: notes.trim() || undefined,
        items: cart.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
        })),
      });

      setResult(response);
      onOrderSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la cotización.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetAndClose = () => {
    setResult(null);
    setErrorMessage(null);
    setCompanyName('');
    setTaxId('');
    setPhone('');
    setEmail('');
    setNotes('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleResetAndClose()}>
      <DialogContent className="sm:max-w-lg bg-card border-border p-6">
        {result ? (
          /* Success Screen */
          <div className="flex flex-col items-center text-center py-4 space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div>
              <DialogTitle className="text-xl font-bold text-foreground">
                ¡Solicitud de Cotización Registrada!
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-muted-foreground">
                Su pedido fue ingresado formalmente en el sistema ERP con el número:
              </DialogDescription>
            </div>

            {/* Document summary box */}
            <div className="w-full rounded-xl border border-border bg-muted/40 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Número de Cotización:</span>
                <span className="font-mono text-sm font-extrabold text-foreground">
                  {result.quoteNumber}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total Estimado (USD):</span>
                <span className="font-bold text-sm text-foreground">
                  {formatUSD(result.totalUSD)}
                </span>
              </div>
              {result.totalVES > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Total Estimado (VES):</span>
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {formatVES(result.totalVES)}
                  </span>
                </div>
              )}
            </div>

            {/* WhatsApp CTA */}
            {result.whatsappUrl ? (
              <Button
                asChild
                className="w-full bg-[#25D366] hover:bg-[#1EBE5D] text-white font-bold h-11 shadow-sm gap-2"
              >
                <a href={result.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-5 w-5" />
                  <span>Enviar Pedido a WhatsApp</span>
                </a>
              </Button>
            ) : null}

            {/* View digital quote button */}
            <Button
              asChild
              variant="outline"
              className="w-full text-xs font-semibold h-9 gap-2 border-border"
            >
              <a href={result.shareUrl} target="_blank" rel="noopener noreferrer">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>Ver Comprobante Digital Oficial</span>
              </a>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={handleResetAndClose}
            >
              Cerrar y volver al catálogo
            </Button>
          </div>
        ) : (
          /* Form Screen */
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-foreground">
                Datos de la Empresa / Cliente
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Ingrese la información fiscal y de contacto para generar su presupuesto formal.
              </DialogDescription>
            </DialogHeader>

            {errorMessage && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="companyName" className="text-xs font-medium">
                  Razón Social o Nombre Comercial *
                </Label>
                <Input
                  id="companyName"
                  placeholder="Ej. Distribuidora Santa María C.A."
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="taxId" className="text-xs font-medium">
                  RIF o Cédula Fiscal *
                </Label>
                <Input
                  id="taxId"
                  placeholder="Ej. J-12345678-9"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-9 text-xs uppercase"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-medium">
                  Teléfono / WhatsApp *
                </Label>
                <Input
                  id="phone"
                  placeholder="Ej. +58 412 1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-9 text-xs"
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium">
                  Correo Electrónico (Opcional)
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="compras@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="h-9 text-xs"
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="notes" className="text-xs font-medium">
                  Instrucciones de Despacho u Observaciones (Opcional)
                </Label>
                <textarea
                  id="notes"
                  rows={2}
                  placeholder="Ej. Entregar en horario matutino / factura personalizada"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isLoading}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>

            {/* Order summary mini ticker */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                Total a Cotizar ({cart.length} ítems):
              </span>
              <div className="text-right">
                <span className="font-bold text-foreground">{formatUSD(totalUSD)}</span>
                {totalVES > 0 && (
                  <span className="ml-2 font-mono text-muted-foreground">
                    ({formatVES(totalVES)})
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetAndClose}
                disabled={isLoading}
                className="text-xs h-9"
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isLoading} className="text-xs h-9">
                {isLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    <span>Generando Cotización...</span>
                  </>
                ) : (
                  <span>Confirmar y Enviar Pedido</span>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
