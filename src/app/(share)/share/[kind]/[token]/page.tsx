import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/erp/PrintButton';
import { resolveSharedDocument, sharedDocStatusBanner } from '@/utilities/documentSharing';

// Sprint 28: página pública de compartición (cotizaciones y remisiones).
// Capacidad sin sesión: el token (~192 bits del CSPRNG) ES el secreto.
// No indexable: el documento sólo debe alcanzarse por el enlace emitido.
export const metadata: Metadata = {
  title: 'Documento compartido',
  robots: { index: false, follow: false },
};

// La lectura del documento toca la base de datos: render bajo demanda.
export const dynamic = 'force-dynamic';

const KINDS = ['quote', 'delivery-note', 'invoice'] as const;

interface PageProps {
  params: Promise<{ kind: string; token: string }>;
}

const fmtDate = (value: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

export default async function SharedDocumentPage({ params }: PageProps) {
  const { kind, token } = await params;

  if (!KINDS.includes(kind as (typeof KINDS)[number]) || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    notFound();
  }

  const resolved = await resolveSharedDocument(token);
  if (!resolved || resolved.doc.collection !== (kind === 'quote' ? 'quotes' : kind === 'invoice' ? 'invoices' : 'delivery-notes')) {
    notFound();
  }

  const doc = resolved.doc;
  const banner = sharedDocStatusBanner(doc);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Encabezado del documento */}
        <div className="flex items-start justify-between gap-4 bg-primary px-6 py-5 text-primary-foreground">
          <div>
            <div className="text-lg font-extrabold tracking-tight">{doc.tenantName}</div>
            <div className="text-xs opacity-80 mt-0.5">
              {doc.docTitle} · {doc.number}
            </div>
          </div>
          <PrintButton label="Imprimir / PDF" />
        </div>

        {/* Estado final: el enlace sigue vivo, pero el destinatario debe ver
            la verdad del ciclo de vida (anulada / rechazada / convertida). */}
        {banner && (
          <div
            className={`px-6 py-3 text-sm font-bold ${
              banner.tone === 'danger'
                ? 'bg-destructive/10 text-destructive border-b border-destructive/20'
                : 'bg-muted text-foreground border-b border-border'
            }`}
          >
            {banner.label}
          </div>
        )}

        {/* Metadatos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-6 py-5 border-b border-border text-sm">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cliente</div>
            <div className="font-semibold">{doc.customerName || '—'}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Fecha de emisión</div>
            <div className="font-semibold">{fmtDate(doc.issueDate)}</div>
          </div>
          {(doc.kind === 'quote' || doc.kind === 'invoice') && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {doc.kind === 'invoice' ? 'Vencimiento' : 'Válida hasta'}
              </div>
              <div className="font-semibold">{fmtDate(doc.validUntil)}</div>
            </div>
          )}
        </div>

        {/* Líneas */}
        <div className="px-6 py-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 text-left font-semibold">Descripción</th>
                <th className="py-2 text-right font-semibold">Cant.</th>
                <th className="py-2 text-right font-semibold">Precio USD</th>
                <th className="py-2 text-right font-semibold">Total USD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {doc.lines.map((line, index) => (
                <tr key={index}>
                  <td className="py-2">{line.description}</td>
                  <td className="py-2 text-right tabular-nums">{line.quantity}</td>
                  <td className="py-2 text-right tabular-nums">${line.unitPriceUSD.toFixed(2)}</td>
                  <td className="py-2 text-right tabular-nums font-semibold">${line.totalUSD.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totales */}
        <div className="px-6 pb-5 flex flex-col items-end gap-1 text-sm">
          <div className="text-base font-bold">
            Total: <span className="tabular-nums">${doc.totalUSD.toFixed(2)}</span>
          </div>
          {doc.totalVES != null && (
            <div className="font-semibold text-foreground">
              Total Bs.: <span className="tabular-nums">{doc.totalVES.toFixed(2)}</span>
            </div>
          )}
          {doc.exchangeRate != null && (
            <div className="text-muted-foreground">
              Tasa aplicada: <span className="tabular-nums">Bs. {doc.exchangeRate.toFixed(4)} / USD</span>
            </div>
          )}
        </div>

        {doc.notes && (
          <div className="px-6 pb-6 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Notas:</span> {doc.notes}
          </div>
        )}

        {/* Pie */}
        <div className="bg-muted/50 px-6 py-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Documento generado electrónicamente por {doc.tenantName} · Empresarial ERP Bimonetario.
          </p>
        </div>
      </div>
    </main>
  );
}
