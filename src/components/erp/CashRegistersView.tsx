'use client';

import React, { useState } from 'react';
import {
  Wallet,
  Plus,
  Building2,
  Lock,
  Unlock,
  History,
  Calendar,
  Vault,
  CircleDollarSign,
  Archive,
} from 'lucide-react';
import { formatUSD, formatVES } from './format';
import { Badge } from './Badge';
import { KpiCard } from './KpiCard';
import { ErpPageHeader } from './ErpPageHeader';
import { MethodMixCard } from './charts/MethodMixCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CashRegisterModal } from './modals/CashRegisterModal';
import { CashClosureModal } from './modals/CashClosureModal';
import { OpenShiftModal } from './modals/OpenShiftModal';
import type { CashRegister, Warehouse, CashClosure, CustomerPayment } from '@/payload-types';

interface CashRegistersViewProps {
  tenantId: number;
  tenantSlug: string;
  registers: CashRegister[];
  warehouses: Warehouse[];
  closures: CashClosure[];
  openCount: number;
  /** Pagos recibidos: base del mix de métodos (recaudación real). */
  payments: CustomerPayment[];
}

export function CashRegistersView({
  tenantId,
  tenantSlug,
  registers,
  warehouses,
  closures,
  openCount,
  payments,
}: CashRegistersViewProps) {
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isClosureModalOpen, setIsClosureModalOpen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [selectedRegisterId, setSelectedRegisterId] = useState<number | undefined>(undefined);

  const handleOpenClosure = (registerId?: number) => {
    setSelectedRegisterId(registerId || registers.find((r) => r.currentStatus === 'open')?.id || registers[0]?.id);
    setIsClosureModalOpen(true);
  };

  const handleOpenShift = (registerId?: number) => {
    setSelectedRegisterId(registerId || registers.find((r) => r.currentStatus !== 'open')?.id || registers[0]?.id);
    setIsShiftModalOpen(true);
  };

  const sanitizedWarehouses = warehouses.map((w) => ({
    id: w.id,
    name: w.name,
    code: w.code,
  }));

  const sanitizedRegisters = registers.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    currentStatus: r.currentStatus,
  }));

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Puntos de Venta & Cajas Registradoras"
        description="Monitoreo de turnos de caja, recaudación multimétodo y control de arqueo ciego (USD, VES, Punto, Zelle, Binance)."
        breadcrumbHref={`/${tenantSlug}/erp`}
        section="Tesorería & Cajas"
        actions={
          <>
            {registers.length - openCount > 0 && (
              <Button variant="outline" size="sm" onClick={() => handleOpenShift()}>
                <Unlock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                Abrir Turno
              </Button>
            )}
            {openCount > 0 && (
              <Button variant="outline" size="sm" onClick={() => handleOpenClosure()}>
                <Lock className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                Arqueo Ciego / Cierre
              </Button>
            )}
            <Button size="sm" onClick={() => setIsRegisterModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Nueva Caja
            </Button>
          </>
        }
      />

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Total Cajas Registradoras"
          valueUSD={String(registers.length)}
          icon={Vault}
          description="En operación"
        />
        <KpiCard
          title="Cajas en Turno Abierto"
          valueUSD={String(openCount)}
          icon={CircleDollarSign}
          tone="positive"
          description="Recaudando activamente"
        />
        <KpiCard
          title="Cajas Cerradas / Arqueadas"
          valueUSD={String(registers.length - openCount)}
          icon={Archive}
          description="Listas para apertura de turno"
        />
      </div>

      {/* Mix de métodos de pago (pieza distintiva del módulo) */}
      <MethodMixCard payments={payments} />

      {/* Grid de Cajas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {registers.map((cr) => {
          const warehouseName =
            typeof cr.warehouse === 'object' && cr.warehouse !== null
              ? (cr.warehouse as { name: string }).name
              : 'Almacén Principal';
          const isOpen = cr.currentStatus === 'open';

          return (
            <Card key={cr.id} className="p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
                      <Wallet className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-foreground">{cr.name}</h3>
                      <p className="text-xs font-mono text-muted-foreground">{cr.code}</p>
                    </div>
                  </div>

                  <Badge variant={isOpen ? 'emerald' : 'slate'} size="sm" dot={isOpen}>
                    {isOpen ? 'Abierta' : 'Cerrada'}
                  </Badge>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Depósito / Sucursal:
                    </span>
                    <span className="font-medium text-foreground">{warehouseName}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Estado Operativo:</span>
                    <span className="font-medium text-foreground">{cr.active ? 'Habilitada' : 'Inactiva'}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-border">
                {isOpen ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={() => handleOpenClosure(cr.id)}
                  >
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    Realizar Arqueo Ciego & Cierre
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={!cr.active}
                    onClick={() => handleOpenShift(cr.id)}
                    title={cr.active ? 'Abrir turno con fondo de apertura' : 'Caja inactiva'}
                  >
                    <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                    Abrir Turno (Fondo de Apertura)
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Historial de Cierres de Caja & Arqueos Ciegos */}
      {closures.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden space-y-3 p-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">Historial de Arqueos & Cierres de Turno</h2>
            </div>
            <span className="text-xs text-muted-foreground">{closures.length} cierres registrados</span>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nro. Cierre</TableHead>
                  <TableHead>Caja</TableHead>
                  <TableHead>Fecha & Hora</TableHead>
                  <TableHead className="text-right">Efectivo USD</TableHead>
                  <TableHead className="text-right">Efectivo VES</TableHead>
                  <TableHead className="text-right">Lote POS (Bs.)</TableHead>
                  <TableHead className="text-right">Pago Móvil (Bs.)</TableHead>
                  <TableHead className="text-right">Zelle / Binance ($)</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closures.map((cl) => {
                  const regName =
                    typeof cl.cashRegister === 'object' && cl.cashRegister !== null
                      ? (cl.cashRegister as { name: string }).name
                      : 'Caja';

                  const declared = cl.declaredTotals;
                  const digitalUSD = (Number(declared?.zelleUSD) || 0) + (Number(declared?.binanceUSD) || 0);

                  return (
                    <TableRow key={cl.id}>
                      <TableCell className="font-mono font-bold">{cl.closureNumber}</TableCell>
                      <TableCell className="font-semibold">{regName}</TableCell>
                      <TableCell className="text-muted-foreground text-[11px]">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" aria-hidden="true" />
                          <span>{new Date(cl.closedAt || cl.createdAt).toLocaleString('es-VE')}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatUSD(Number(declared?.cashUSD) || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatVES(Number(declared?.cashVES) || 0)}</TableCell>
                      <TableCell className="text-right font-mono">{formatVES(Number(declared?.posVES) || 0)}</TableCell>
                      <TableCell className="text-right font-mono">{formatVES(Number(declared?.pagoMovilVES) || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-foreground">{formatUSD(digitalUSD)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="slate" size="sm">
                          {cl.status === 'audited' ? 'Auditado' : 'Cerrado'}
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

      {/* Modales */}
      <CashRegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        warehouses={sanitizedWarehouses}
      />

      <CashClosureModal
        isOpen={isClosureModalOpen}
        onClose={() => setIsClosureModalOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        cashRegisters={sanitizedRegisters}
        defaultCashRegisterId={selectedRegisterId}
      />

      <OpenShiftModal
        isOpen={isShiftModalOpen}
        onClose={() => setIsShiftModalOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        cashRegisters={sanitizedRegisters}
        defaultCashRegisterId={selectedRegisterId}
      />
    </div>
  );
}
