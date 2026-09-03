import type { Config, Plugin } from 'payload';
import type { ERPPluginOptions } from './types';
import { Customers } from './collections/Customers';
import { Invoices } from './collections/Invoices';
import { CustomerPayments } from './collections/CustomerPayments';

export * from './types';
export * from './hooks/ledger';
export { Customers } from './collections/Customers';
export { Invoices } from './collections/Invoices';
export { CustomerPayments } from './collections/CustomerPayments';

const defaultFeatures = {
  crm: true,
  accountsReceivable: true,
  accountsPayable: false,
  manufacturingBOM: false,
  cashClosure: false,
  dualCurrency: true,
  whatsappEngagement: true,
};

/**
 * Plugin oficial Cendaro ERP para Payload CMS 3.x.
 * 
 * Implementa la arquitectura de doble función (currying) estándar de Payload:
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

    // Módulo 1: Finance & Customer CRM Core
    if (features.crm || features.accountsReceivable) {
      const customersCollection = {
        ...Customers,
        ...(options.overrides?.customers || {}),
      };

      const invoicesCollection = {
        ...Invoices,
        ...(options.overrides?.invoices || {}),
      };

      const paymentsCollection = {
        ...CustomerPayments,
        ...(options.overrides?.customerPayments || {}),
      };

      // Inyectar o reemplazar si no existen
      if (!newCollections.some((c) => c.slug === customersCollection.slug)) {
        newCollections.push(customersCollection);
      }
      if (!newCollections.some((c) => c.slug === invoicesCollection.slug)) {
        newCollections.push(invoicesCollection);
      }
      if (!newCollections.some((c) => c.slug === paymentsCollection.slug)) {
        newCollections.push(paymentsCollection);
      }
    }

    return {
      ...incomingConfig,
      collections: newCollections,
    };
  };
