'use client';

import React, { useState } from 'react';
import {
  Truck,
  Search,
  Plus,
  Receipt,
  Calendar,
  HandCoins,
  FileStack,
  Building,
} from 'lucide-react';
import { EmptyState } from './EmptyState';
import { formatUSD, formatVES } from './format';
import { Badge } from './Badge';
import { KpiCard } from './KpiCard';
import { ErpPageHeader } from './ErpPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SupplierModal } from './modals/SupplierModal';
import type { Supplier, PurchaseInvoice } from '@/payload-types';

interface SuppliersViewProps {
  tenantId: number;
  tenantSlug: string;
  suppliers: Supplier[];
  purchaseInvoices: PurchaseInvoice[];
  totalPayablesUSD: number;
  totalPayablesVES: number;
  effectiveRate: number;
}

export function SuppliersView({
  tenantId,
  tenantSlug,
  suppliers,
  purchaseInvoices,
  totalPayablesUSD,
  totalPayablesVES,
  effectiveRate,
}: SuppliersViewProps) {
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredSuppliers = suppliers.filter((s) => {
    return (
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.taxId.toLowerCase().includes(search.toLowerCase()) ||
      (s.contactName && s.contactName.toLowerCase().includes(search.toLowerCase()))
    );
  });

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Gestión de Proveedores & Cuentas por Pagar"
        description="Registro de compras a crédito, facturas por pagar y recepción de mercancía a almacén."
        breadcrumbHref={`/${tenantSlug}/erp`}
        section="Proveedores & CxP"
        actions={
          <Button size="sm" onClick={() => setIsSupplierModalOpen(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Nuevo Proveedor
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Deuda Comercial por Pagar"
          valueUSD={totalPayablesUSD}
          valueVES={totalPayablesVES}
          icon={HandCoins}
          tone="warning"
        />
        <KpiCard
          title="Facturas de Compra Pendientes"
          valueUSD={String(purchaseInvoices.length)}
          icon={FileStack}
          description="Compromisos activos"
        />
        <KpiCard
          title="Padrón de Proveedores"
          valueUSD={String(suppliers.length)}
          icon={Building}
          description="Proveedores registrados"
        />
      </div>

      {/* Barra de Búsqueda */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por proveedor, RIF o contacto..."
            className="pl-9"
          />
        </div>
      </div>

      {/* Tabla de Proveedores */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Directorio de Proveedores Comerciales</h2>
          <span className="text-xs text-muted-foreground">{filteredSuppliers.length} registrados</span>
        </div>

        {filteredSuppliers.length === 0 ? (
          <EmptyState icon={Truck} title="No hay proveedores registrados." description="Registra el primer proveedor de este inquilino.">
            <Button size="sm" onClick={() => setIsSupplierModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Registrar Primer Proveedor
            </Button>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Razón Social / Contacto</TableHead>
                  <TableHead>RIF / Cédula</TableHead>
                  <TableHead>Condiciones de Crédito</TableHead>
                  <TableHead className="text-right">Límite Crédito</TableHead>
                  <TableHead className="text-right">Deuda Pendiente USD</TableHead>
                  <TableHead className="text-right">Deuda Pendiente VES</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.map((s) => {
                  const debt = Number(s.currentDebtUSD) || 0;
                  const debtVES = Number(s.currentDebtVES) || debt * effectiveRate;

                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-semibold text-foreground">{s.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {s.contactName ? `${s.contactName} · ` : ''}
                          {s.phone || s.email || 'Sin contacto'}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">{s.taxId}</TableCell>
                      <TableCell>
                        {s.creditAllowed ? (
                          <Badge variant="indigo" size="sm">
                            {s.creditDays} días plazo
                          </Badge>
                        ) : (
                          <Badge variant="slate" size="sm">
                            Contado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {s.creditAllowed ? formatUSD(Number(s.creditLimitUSD) || 0) : '$ 0,00'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {formatUSD(debt)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {formatVES(debtVES)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Facturas de Compra Pendientes */}
      {purchaseInvoices.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden space-y-3 p-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">Facturas de Compra Pendientes por Pagar</h2>
            </div>
            <span className="text-xs text-muted-foreground">{purchaseInvoices.length} facturas</span>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Factura</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Emisión & Vencimiento</TableHead>
                  <TableHead className="text-right">Total USD</TableHead>
                  <TableHead className="text-right">Saldo por Pagar</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseInvoices.map((pinv) => {
                  const supName =
                    typeof pinv.supplier === 'object' && pinv.supplier !== null
                      ? (pinv.supplier as { name: string }).name
                      : 'Proveedor';

                  return (
                    <TableRow key={pinv.id}>
                      <TableCell className="font-mono font-bold">{pinv.invoiceNumber}</TableCell>
                      <TableCell className="font-semibold">{supName}</TableCell>
                      <TableCell className="text-muted-foreground text-[11px]">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" aria-hidden="true" />
                          <span>{new Date(pinv.issueDate).toLocaleDateString('es-VE')}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatUSD(Number(pinv.totalUSD) || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {formatUSD(Number(pinv.balanceUSD) || 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={pinv.status === 'received' ? 'amber' : 'indigo'} size="sm" dot={pinv.status === 'received'}>
                          {pinv.status === 'received' ? 'Por Pagar' : pinv.status === 'partially_paid' ? 'Parcial' : 'Borrador'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Modal Nuevo Proveedor */}
      <SupplierModal
        isOpen={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
      />
    </div>
  );
}
