'use client';

import React, { useState } from 'react';
import { Modal } from './Modal';
import { issueInvoiceFromOrderAction } from '@/actions/erpActions';
import { formatUSD } from '../format';
import { Loader2, FileText } from 'lucide-react';

interface OrderInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: number;
  tenantSlug: string;
  order: {
    id: number;
    orderNumber: string;
    totalUSD: number;
    customerName: string;
  };
  cashRegisters: Array<{ id: number; name: string; code: string; currentStatus: string }>;
  warehouses: Array<{ id: number; name: string; code: string; isDefault?: boolean | null }>;
}

/**
 * Factura un pedido confirmado heredando sus líneas: contado captura el recibo
 * automáticamente y descarga kardex; crédito valida el límite del cliente.
 * Espejo de ConvertQuoteModal para el ciclo de pedidos (Sprint 19).
 */
export function OrderInvoiceModal({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  order,
  cashRegisters,
  warehouses,
}: OrderInvoiceModalProps) {
  const openRegisters = cashRegisters.filter((cr) => cr.currentStatus === 'open');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentTerms, setPaymentTerms] = useState<'cash' | 'credit'>('cash');
  const [cashMethod, setCashMethod] = useState<string>('cash_usd');
  const [cashRegisterId, setCashRegisterId] = useState<number | undefined>(openRegisters[0]?.id);
  const [warehouseId, setWarehouseId] = useState<number | undefined>(
    warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await issueInvoiceFromOrderAction({
      tenantId,
      tenantSlug,
      orderId: order.id,
      paymentTerms,
      cashMethod: paymentTerms === 'cash' ? (cashMethod as 'cash_usd') : undefined,
      cashRegisterId: paymentTerms === 'cash' ? cashRegisterId : undefined,
      warehouseId,
    });

    setLoading(false);

    if (res.success) {
      onClose();
    } else {
      setError(res.error || 'Error al facturar el pedido');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Facturar ${order.orderNumber}`}
      description="Genera la factura heredando las líneas del pedido confirmado. Contado captura el recibo y descarga inventario; crédito valida el límite del cliente."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300">
            {error}
          </div>
        )}

        <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-300">
            <FileText className="h-4 w-4 text-indigo-400" />
            <span>
              {order.orderNumber} — {order.customerName}
            </span>
          </div>
          <span className="font-mono font-bold text-white">{formatUSD(order.totalUSD)}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">Condición Comercial *</label>
            <select
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value as 'cash' | 'credit')}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none font-semibold"
            >
              <option value="cash">Contado</option>
              <option value="credit">Crédito (valida límite)</option>
            </select>
          </div>

          {paymentTerms === 'cash' && (
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Método de Cobro *</label>
              <select
                value={cashMethod}
                onChange={(e) => setCashMethod(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="cash_usd">Efectivo USD ($)</option>
                <option value="cash_ves">Efectivo Bolívares (Bs.)</option>
                <option value="pos_ves">Punto de Venta / Tarjeta (VES)</option>
                <option value="pago_movil">Pago Móvil (VES)</option>
                <option value="transfer_ves">Transferencia Bancaria (VES)</option>
                <option value="zelle">Zelle ($ USD)</option>
                <option value="binance">Binance Pay (USDT)</option>
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {paymentTerms === 'cash' && openRegisters.length > 0 && (
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Caja (Turno Abierto)</label>
              <select
                value={cashRegisterId ?? ''}
                onChange={(e) => setCashRegisterId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="">-- Sin turno --</option>
                {openRegisters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.code})
                  </option>
                ))}
              </select>
            </div>
          )}

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
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Facturar Pedido</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
