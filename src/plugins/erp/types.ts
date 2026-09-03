import type { CollectionConfig } from 'payload';

export interface ERPPluginFeatures {
  /** Activar módulo de CRM ligero y segmentación de clientes */
  crm?: boolean;
  /** Activar módulo de Cuentas por Cobrar (CxC) y Facturación Multi-moneda */
  accountsReceivable?: boolean;
  /** Activar módulo de Catálogo de Productos y Kardex de Inventario */
  inventory?: boolean;
  /** Activar módulo de Bill of Materials (BOM) y Órdenes de Fabricación */
  manufacturingBOM?: boolean;
  /** Activar módulo de Cuentas por Pagar (CxP) y Proveedores */
  accountsPayable?: boolean;
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
  categories?: Partial<CollectionConfig>;
  warehouses?: Partial<CollectionConfig>;
  products?: Partial<CollectionConfig>;
  stockMovements?: Partial<CollectionConfig>;
  billOfMaterials?: Partial<CollectionConfig>;
  productionOrders?: Partial<CollectionConfig>;
  suppliers?: Partial<CollectionConfig>;
  purchaseInvoices?: Partial<CollectionConfig>;
  supplierPayments?: Partial<CollectionConfig>;
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
export type ProductType = 'standard' | 'raw_material' | 'manufactured' | 'combo';
export type ProductionOrderStatus = 'draft' | 'planned' | 'in_progress' | 'completed' | 'cancelled';
export type MovementType =
  | 'purchase'
  | 'sale'
  | 'transfer'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'raw_material_consumption'
  | 'production_receipt'
  | 'initial_stock';
