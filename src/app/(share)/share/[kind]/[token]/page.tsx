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

const KINDS = ['quote', 'delivery-note'] as const;

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
  if (!resolved || resolved.doc.collection !== (kind === 'quote' ? 'quotes' : 'delivery-notes')) {
    notFound();
  }

  const doc = resolved.doc;
  const banner = sharedDocStatusBanner(doc);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Encabezado del documento */}
        <div className="flex items-start justify-between gap-4 bg-slate-900 px-6 py-5 text-white">
          <div>
            <div className="text-lg font-extrabold tracking-tight">{doc.tenantName}</div>
            <div className="text-xs text-slate-400 mt-0.5">
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
                ? 'bg-rose-50 text-rose-700 border-b border-rose-200'
                : 'bg-blue-50 text-blue-700 border-b border-blue-200'
            }`}
          >
            {banner.label}
          </div>
        )}

        {/* Metadatos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-6 py-5 border-b border-slate-200 text-sm">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cliente</div>
            <div className="font-semibold">{doc.customerName || '—'}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fecha de emisión</div>
            <div className="font-semibold">{fmtDate(doc.issueDate)}</div>
          </div>
          {doc.kind === 'quote' && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Válida hasta</div>
              <div className="font-semibold">{fmtDate(doc.validUntil)}</div>
            </div>
          )}
        </div>

        {/* Líneas */}
        <div className="px-6 py-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-2 text-left font-semibold">Descripción</th>
                <th className="py-2 text-right font-semibold">Cant.</th>
                <th className="py-2 text-right font-semibold">Precio USD</th>
                <th className="py-2 text-right font-semibold">Total USD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
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
            <div className="font-semibold text-slate-700">
              Total Bs.: <span className="tabular-nums">{doc.totalVES.toFixed(2)}</span>
            </div>
          )}
          {doc.exchangeRate != null && (
            <div className="text-slate-500">
              Tasa aplicada: <span className="tabular-nums">Bs. {doc.exchangeRate.toFixed(4)} / USD</span>
            </div>
          )}
        </div>

        {doc.notes && (
          <div className="px-6 pb-6 text-sm text-slate-600">
            <span className="font-semibold">Notas:</span> {doc.notes}
          </div>
        )}

        {/* Pie */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200">
          <p className="text-xs text-slate-500">
            Documento generado electrónicamente por {doc.tenantName} · Empresarial ERP Bimonetario.
          </p>
        </div>
      </div>
    </main>
  );
}
