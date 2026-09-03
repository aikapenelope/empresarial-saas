import type { Config, Plugin } from 'payload';
import type { ERPPluginOptions } from './types';
import { Customers } from './collections/Customers';
import { Invoices } from './collections/Invoices';
import { CustomerPayments } from './collections/CustomerPayments';
import { Categories } from './collections/Categories';
import { Warehouses } from './collections/Warehouses';
import { Products } from './collections/Products';
import { StockMovements } from './collections/StockMovements';
import { BillOfMaterials } from './collections/BillOfMaterials';
import { ProductionOrders } from './collections/ProductionOrders';
import { Suppliers } from './collections/Suppliers';
import { PurchaseInvoices } from './collections/PurchaseInvoices';
import { SupplierPayments } from './collections/SupplierPayments';
import { CashRegisters } from './collections/CashRegisters';
import { CashClosures } from './collections/CashClosures';
import { IndustryTemplates } from './collections/IndustryTemplates';

export * from './types';
export * from './hooks/ledger';
export * from './hooks/production';
export * from './hooks/supplier-ledger';
export * from './templates/definitions';
export * from './templates/seeder';
export { Customers } from './collections/Customers';
export { Invoices } from './collections/Invoices';
export { CustomerPayments } from './collections/CustomerPayments';
export { Categories } from './collections/Categories';
export { Warehouses } from './collections/Warehouses';
export { Products } from './collections/Products';
export { StockMovements } from './collections/StockMovements';
export { BillOfMaterials } from './collections/BillOfMaterials';
export { ProductionOrders } from './collections/ProductionOrders';
export { Suppliers } from './collections/Suppliers';
export { PurchaseInvoices } from './collections/PurchaseInvoices';
export { SupplierPayments } from './collections/SupplierPayments';
export { CashRegisters } from './collections/CashRegisters';
export { CashClosures } from './collections/CashClosures';
export { IndustryTemplates } from './collections/IndustryTemplates';

const defaultFeatures = {
  crm: true,
  accountsReceivable: true,
  inventory: true,
  manufacturingBOM: true,
  accountsPayable: true,
  cashClosure: true,
  industryTemplates: true,
  dualCurrency: true,
  whatsappEngagement: true,
};

/**
 * Plugin oficial Cendaro ERP para Payload CMS 3.x.
 * 
 * Implementa la arquitectura canónica de doble función (currying):
 * (options) => (config) => Config
 */
export const erpPlugin =
  (options: ERPPluginOptions = {}): Plugin =>
  (incomingConfig: Config): Config => {
    if (options.enabled === false) {
      return incomingConfig;
    }

    const features = {
      ...defaultFeatures,
      ...(options.features || {}),
    };

    const newCollections = [...(incomingConfig.collections || [])];

    // Helper para inyectar colecciones sin duplicados
    const injectCollection = (collection: any, override: any) => {
      const merged = { ...collection, ...(override || {}) };
      const index = newCollections.findIndex((c) => c.slug === merged.slug);
      if (index >= 0) {
        newCollections[index] = merged;
      } else {
        newCollections.push(merged);
      }
    };

    // Módulo 1: Finance & Customer CRM Core (CxC)
    if (features.crm || features.accountsReceivable) {
      injectCollection(Customers, options.overrides?.customers);
      injectCollection(Invoices, options.overrides?.invoices);
      injectCollection(CustomerPayments, options.overrides?.customerPayments);
    }

    // Módulo 2: Catálogo, Inventario y BOM / Producción
    if (features.inventory || features.manufacturingBOM) {
      injectCollection(Categories, options.overrides?.categories);
      injectCollection(Warehouses, options.overrides?.warehouses);
      injectCollection(Products, options.overrides?.products);
      injectCollection(StockMovements, options.overrides?.stockMovements);
    }

    if (features.manufacturingBOM) {
      injectCollection(BillOfMaterials, options.overrides?.billOfMaterials);
      injectCollection(ProductionOrders, options.overrides?.productionOrders);
    }

    // Módulo 3: Proveedores y Cuentas por Pagar (CxP)
    if (features.accountsPayable) {
      injectCollection(Suppliers, options.overrides?.suppliers);
      injectCollection(PurchaseInvoices, options.overrides?.purchaseInvoices);
      injectCollection(SupplierPayments, options.overrides?.supplierPayments);
    }

    // Módulo 4: Cajas Registradoras y Cierre de Caja (Cash Closure)
    if (features.cashClosure) {
      injectCollection(CashRegisters, options.overrides?.cashRegisters);
      injectCollection(CashClosures, options.overrides?.cashClosures);
    }

    // Módulo 5: Motor de Plantillas Industriales (Template Engine)
    if (features.industryTemplates) {
      injectCollection(IndustryTemplates, options.overrides?.industryTemplates);
    }

    return {
      ...incomingConfig,
      collections: newCollections,
    };
  };
