'use client';

import React, { useState } from 'react';
import { Plus, DollarSign, UserPlus } from 'lucide-react';
import { InvoiceModal } from './modals/InvoiceModal';
import { PaymentModal } from './modals/PaymentModal';
import { CustomerModal } from './modals/CustomerModal';

interface DashboardQuickActionsProps {
  tenantId: number;
  tenantSlug: string;
  customers: Array<{ id: number; name: string; taxId: string; currentDebtUSD?: number | null }>;
  products: Array<{ id: number; name: string; sku: string; priceUSD: number; unitOfMeasure: string }>;
  rate: number;
}

export function DashboardQuickActions({
  tenantId,
  tenantSlug,
  customers,
  products,
  rate,
}: DashboardQuickActionsProps) {
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isCustomerOpen, setIsCustomerOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setIsCustomerOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
        >
          <UserPlus className="h-3.5 w-3.5 text-indigo-400" />
          <span className="hidden sm:inline">+ Cliente</span>
        </button>

        <button
          onClick={() => setIsPaymentOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-600/10 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/20 transition-colors"
        >
          <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
          <span>+ Cobro</span>
        </button>

        <button
          onClick={() => setIsInvoiceOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm shadow-indigo-500/20"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>+ Nueva Venta</span>
        </button>
      </div>

      <InvoiceModal
        isOpen={isInvoiceOpen}
        onClose={() => setIsInvoiceOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        customers={customers}
        products={products}
        rate={rate}
      />

      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        rate={rate}
        customers={customers}
      />

      <CustomerModal
        isOpen={isCustomerOpen}
        onClose={() => setIsCustomerOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
      />
    </>
  );
}
