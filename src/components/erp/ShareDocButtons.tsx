'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Loader2, Mail, MessageCircle, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from './modals/Modal';
import { ensureShareUrlAction, revokeShareTokenAction, sendDocumentEmailAction } from '@/actions/shareActions';

/**
 * Sprint 28: botones de compartición de cotizaciones y remisiones.
 * - WhatsApp: abre wa.me con el texto del documento + enlace público.
 * - Email: modal con el correo (prellenado con el del cliente) y envío vía
 *   Resend (adaptador oficial de Payload); el despacho real corre en after().
 * - Copiar: copia la URL pública /share/{kind}/{token}.
 */
interface ShareDocButtonsProps {
  collection: 'quotes' | 'delivery-notes' | 'invoices';
  tenantId: number;
  documentId: number;
  docLabel: string;
  defaultEmail?: string;
}

export function ShareDocButtons({ collection, tenantId, documentId, docLabel, defaultEmail = '' }: ShareDocButtonsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleWhatsApp = () => {
    startTransition(async () => {
      const res = await ensureShareUrlAction({ collection, tenantId, documentId });
      if (!res.ok || !res.whatsappText) {
        toast.error(res.error || 'No se pudo generar el enlace.');
        return;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(res.whatsappText)}`, '_blank', 'noopener');
    });
  };

  const handleCopy = () => {
    startTransition(async () => {
      const res = await ensureShareUrlAction({ collection, tenantId, documentId });
      if (!res.ok || !res.shareUrl) {
        toast.error(res.error || 'No se pudo generar el enlace.');
        return;
      }
      try {
        await navigator.clipboard.writeText(res.shareUrl);
        setCopied(true);
        toast.success('Enlace público copiado al portapapeles.');
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.error('El navegador bloqueó el portapapeles.');
      }
    });
  };

  const handleSendEmail = () => {
    setError(null);
    startTransition(async () => {
      const res = await sendDocumentEmailAction({ collection, tenantId, documentId, email });
      if (!res.ok) {
        setError(res.error || 'No se pudo enviar el email.');
        return;
      }
      toast.success(`Email en camino a ${email}.`);
      setEmailModalOpen(false);
      router.refresh();
    });
  };

  const handleRevoke = () => {
    setError(null);
    startTransition(async () => {
      const res = await revokeShareTokenAction({ collection, tenantId, documentId });
      if (!res.ok) {
        setError(res.error || 'No se pudo revocar el enlace.');
        return;
      }
      toast.success('Enlace público revocado.');
      setRevokeModalOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          type="button"
          title={`Compartir ${docLabel} por WhatsApp`}
          disabled={isPending}
          onClick={handleWhatsApp}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-700/60 bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/60 transition-colors disabled:opacity-50"
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title={`Enviar ${docLabel} por email`}
          disabled={isPending}
          onClick={() => {
            setError(null);
            setEmail(defaultEmail);
            setEmailModalOpen(true);
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Mail className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Copiar enlace público"
          disabled={isPending}
          onClick={handleCopy}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          title="Revocar enlace público"
          disabled={isPending}
          onClick={() => {
            setError(null);
            setRevokeModalOpen(true);
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
        >
          <ShieldOff className="h-3.5 w-3.5" />
        </button>
      </div>

      <Modal isOpen={emailModalOpen} onClose={() => setEmailModalOpen(false)} title={`Enviar ${docLabel} por email`} maxWidth="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendEmail();
          }}
          className="space-y-4"
        >
          <p className="text-xs text-muted-foreground">
            Se envía por Resend con un enlace público e índice-imposible de adivinar (token de 192 bits)
            para que el cliente vea el documento completo y pueda descargarlo como PDF.
          </p>
          <div>
            <label htmlFor={`share-email-${documentId}`} className="block text-xs font-semibold text-foreground mb-1">
              Correo del destinatario
            </label>
            <input
              id={`share-email-${documentId}`}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@correo.com"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-ring focus:outline-none"
            />
          </div>
          {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Enviar por email
          </button>
        </form>
      </Modal>

      <Modal isOpen={revokeModalOpen} onClose={() => setRevokeModalOpen(false)} title={`Revocar enlace de ${docLabel}`} maxWidth="sm">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            El enlace público actual dejará de funcionar de inmediato. Si vuelve a compartir el
            documento, se emitirá un enlace nuevo con caducidad de 30 días.
          </p>
          {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRevokeModalOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleRevoke}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
              Revocar enlace
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
