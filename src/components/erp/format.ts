/**
 * Formatters bimonetarios canónicos del ERP (USD / VES).
 * Módulo neutro (sin 'use client'): consumible desde RSC y desde
 * Client Components por igual. Antes vivían en KpiCard; se separaron
 * al migrar KpiCard a un componente cliente del design system (Sprint 35).
 */

export function formatUSD(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatVES(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 'Bs. 0,00';
  return (
    'Bs. ' +
    new Intl.NumberFormat('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  );
}
