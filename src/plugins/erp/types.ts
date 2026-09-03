import type { CollectionConfig } from 'payload';

export interface ERPPluginFeatures {
  /** Activar módulo de CRM ligero y segmentación de clientes */
  crm?: boolean;
  /** Activar módulo de Cuentas por Cobrar (CxC) y Facturación Multi-moneda */
  accountsReceivable?: boolean;
  /** Activar módulo de Cuentas por Pagar (CxP) y Proveedores */
  accountsPayable?: boolean;
  /** Activar módulo de Bill of Materials (BOM) y Órdenes de Fabricación */
  manufacturingBOM?: boolean;
  /** Activar módulo de Cierre de Caja (Cash Closure) y turnos */
  cashClosure?: boolean;
  /** Activar soporte bimonetario USD / Moneda Local (BCV / Paralelo) */
  dualCurrency?: boolean;
  /** Activar generación de estados de cuenta y recordatorios por WhatsApp */
  whatsappEngagement?: boolean;
}

export interface ERPPluginCollectionOverrides {
  customers?: Partial<CollectionConfig>;
  invoices?: Partial<CollectionConfig>;
  customerPayments?: Partial<CollectionConfig>;
  suppliers?: Partial<CollectionConfig>;
  purchaseInvoices?: Partial<CollectionConfig>;
  supplierPayments?: Partial<CollectionConfig>;
  billOfMaterials?: Partial<CollectionConfig>;
  productionOrders?: Partial<CollectionConfig>;
  cashClosures?: Partial<CollectionConfig>;
}

export interface ERPPluginOptions {
  /** Si está habilitado el plugin */
  enabled?: boolean;
  /** Feature flags para activar o desactivar módulos del ERP */
  features?: ERPPluginFeatures;
  /** Sobrescrituras para personalizar las colecciones inyectadas */
  overrides?: ERPPluginCollectionOverrides;
}

export type LifecycleStage = 'lead' | 'first_time' | 'recurring' | 'vip' | 'inactive';
export type InvoiceStatus = 'draft' | 'pending' | 'partially_paid' | 'paid' | 'cancelled';
export type PaymentMethodType =
  | 'cash_usd'
  | 'cash_ves'
  | 'zelle'
  | 'pago_movil'
  | 'transfer_ves'
  | 'binance';
