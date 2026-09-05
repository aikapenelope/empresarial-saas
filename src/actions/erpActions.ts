'use server';

import { getPayload } from 'payload';
import config from '@payload-config';
import { revalidatePath } from 'next/cache';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';

// ==========================================
// 1. CLIENTES (CRM)
// ==========================================
export interface CreateCustomerInput {
  tenantId: number;
  tenantSlug: string;
  name: string;
  taxId: string;
  phone: string;
  email?: string;
  address?: string;
  status?: 'lead' | 'first_time' | 'recurring' | 'vip' | 'inactive';
  creditAllowed?: boolean;
  creditLimitUSD?: number;
  creditDays?: number;
}

export async function createCustomerAction(input: CreateCustomerInput) {
  try {
    const payload = await getPayload({ config });
    const doc = await payload.create({
      collection: 'customers',
      data: {
        tenant: input.tenantId,
        name: input.name,
        taxId: input.taxId,
        phone: input.phone,
        email: input.email || undefined,
        address: input.address || undefined,
        status: input.status || 'first_time',
        creditAllowed: input.creditAllowed ?? false,
        creditLimitUSD: Number(input.creditLimitUSD) || 0,
        creditDays: Number(input.creditDays) || 0,
        currentDebtUSD: 0,
        currentDebtVES: 0,
        overdueDebtUSD: 0,
      },
    });

    revalidatePath(`/${input.tenantSlug}/erp/customers`);
    revalidatePath(`/${input.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al registrar cliente';
    return { success: false, error: message };
  }
}

// ==========================================
// 2. PRODUCTOS E INSUMOS
// ==========================================
export interface CreateProductInput {
  tenantId: number;
  tenantSlug: string;
  name: string;
  sku: string;
  productType: 'standard' | 'raw_material' | 'manufactured' | 'service';
  unitOfMeasure: 'unit' | 'kg' | 'g' | 'l' | 'ml' | 'm' | 'box';
  costUSD: number;
  priceUSD: number;
  taxRate?: 'exempt' | 'general' | 'reduced';
  minStockAlert?: number;
  currentStock?: number;
}

export async function createProductAction(input: CreateProductInput) {
  try {
    const payload = await getPayload({ config });
    const doc = await payload.create({
      collection: 'products',
      data: {
        tenant: input.tenantId,
        name: input.name,
        sku: input.sku,
        productType: input.productType,
        unitOfMeasure: input.unitOfMeasure,
        costUSD: Number(input.costUSD) || 0,
        priceUSD: Number(input.priceUSD) || 0,
        taxRate: input.taxRate || 'exempt',
        minStockAlert: Number(input.minStockAlert) || 0,
        currentStock: Number(input.currentStock) || 0,
      },
    });

    revalidatePath(`/${input.tenantSlug}/erp/inventory`);
    revalidatePath(`/${input.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al registrar producto';
    return { success: false, error: message };
  }
}

// ==========================================
// 3. FACTURACIÓN & VENTAS (INVOICES)
// ==========================================
export interface InvoiceItemInput {
  sku?: string;
  description: string;
  quantity: number;
  unitPriceUSD: number;
}

export interface CreateInvoiceInput {
  tenantId: number;
  tenantSlug: string;
  customerId: number;
  paymentTerms: 'cash' | 'credit';
  items: InvoiceItemInput[];
  notes?: string;
}

export async function createInvoiceAction(input: CreateInvoiceInput) {
  try {
    const payload = await getPayload({ config });

    const tenant = await payload.findByID({
      collection: 'tenants',
      id: input.tenantId,
      depth: 0,
    });

    const rateResult = await resolveEffectiveRate(
      tenant?.currencyConfig
        ? {
            manualExchangeRate: tenant.currencyConfig.manualExchangeRate ?? undefined,
            autoSyncRate: tenant.currencyConfig.autoSyncRate ?? undefined,
          }
        : undefined,
    );
    const rate = rateResult.rate;

    let subtotalUSD = 0;
    const formattedItems = input.items.map((it) => {
      const q = Number(it.quantity) || 1;
      const p = Number(it.unitPriceUSD) || 0;
      const totalItem = q * p;
      subtotalUSD += totalItem;
      return {
        sku: it.sku || undefined,
        description: it.description,
        quantity: q,
        unitPriceUSD: p,
        totalUSD: totalItem,
      };
    });

    const totalUSD = subtotalUSD;
    const totalVES = totalUSD * rate;
    const isCash = input.paymentTerms === 'cash';
    const balanceUSD = isCash ? 0 : totalUSD;
    const balanceVES = isCash ? 0 : totalVES;
    const status = isCash ? 'paid' : 'issued';

    const invCount = await payload.count({
      collection: 'invoices',
      where: { tenant: { equals: input.tenantId } },
    });
    const invoiceNumber = `FAC-${String(invCount.totalDocs + 1).padStart(5, '0')}`;

    const doc = await payload.create({
      collection: 'invoices',
      data: {
        tenant: input.tenantId,
        invoiceNumber,
        customer: input.customerId,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        paymentTerms: input.paymentTerms,
        status,
        exchangeRateSnapshot: rate,
        items: formattedItems,
        totalUSD,
        totalVES,
        balanceUSD,
        balanceVES,
        notes: input.notes || undefined,
      },
    });

    revalidatePath(`/${input.tenantSlug}/erp/invoices`);
    revalidatePath(`/${input.tenantSlug}/erp/customers`);
    revalidatePath(`/${input.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al emitir factura';
    return { success: false, error: message };
  }
}

// ==========================================
// 4. COBRANZAS & ABONOS (CUSTOMER PAYMENTS)
// ==========================================
export interface CreatePaymentInput {
  tenantId: number;
  tenantSlug: string;
  customerId: number;
  invoiceId?: number;
  amountUSD: number;
  method: 'cash_usd' | 'cash_ves' | 'pos_ves' | 'pago_movil' | 'transfer_ves' | 'zelle' | 'binance';
  referenceNumber?: string;
  notes?: string;
}

export async function createPaymentAction(input: CreatePaymentInput) {
  try {
    const payload = await getPayload({ config });

    const tenant = await payload.findByID({
      collection: 'tenants',
      id: input.tenantId,
      depth: 0,
    });

    const rateResult = await resolveEffectiveRate(
      tenant?.currencyConfig
        ? {
            manualExchangeRate: tenant.currencyConfig.manualExchangeRate ?? undefined,
            autoSyncRate: tenant.currencyConfig.autoSyncRate ?? undefined,
          }
        : undefined,
    );
    const rate = rateResult.rate;

    const amountUSD = Number(input.amountUSD) || 0;
    const isUSD = input.method === 'cash_usd' || input.method === 'zelle' || input.method === 'binance';
    const currency = isUSD ? 'USD' : 'VES';
    const amountNative = isUSD ? amountUSD : amountUSD * rate;

    const payCount = await payload.count({
      collection: 'customer-payments',
      where: { tenant: { equals: input.tenantId } },
    });
    const paymentNumber = `RC-${String(payCount.totalDocs + 1).padStart(5, '0')}`;

    const doc = await payload.create({
      collection: 'customer-payments',
      data: {
        tenant: input.tenantId,
        paymentNumber,
        customer: input.customerId,
        paymentDate: new Date().toISOString(),
        status: 'confirmed',
        methods: [
          {
            method: input.method,
            currency,
            amount: amountNative,
            exchangeRate: rate,
            amountUSD,
            reference: input.referenceNumber || undefined,
          },
        ],
        totalUSD: amountUSD,
        allocations: input.invoiceId
          ? [
              {
                invoice: input.invoiceId,
                allocatedAmountUSD: amountUSD,
              },
            ]
          : undefined,
        notes: input.notes || undefined,
      },
    });

    revalidatePath(`/${input.tenantSlug}/erp/customers`);
    revalidatePath(`/${input.tenantSlug}/erp/invoices`);
    revalidatePath(`/${input.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al registrar cobro';
    return { success: false, error: message };
  }
}

// ==========================================
// 5. CAJAS REGISTRADORAS & ARQUEOS CIEGOS
// ==========================================
export interface CreateCashRegisterInput {
  tenantId: number;
  tenantSlug: string;
  name: string;
  code: string;
  warehouseId: number;
}

export async function createCashRegisterAction(input: CreateCashRegisterInput) {
  try {
    const payload = await getPayload({ config });
    const doc = await payload.create({
      collection: 'cash-registers',
      data: {
        tenant: input.tenantId,
        name: input.name,
        code: input.code,
        warehouse: input.warehouseId,
        currentStatus: 'closed',
        active: true,
      },
    });

    revalidatePath(`/${input.tenantSlug}/erp/cash-registers`);
    revalidatePath(`/${input.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al registrar caja';
    return { success: false, error: message };
  }
}

export interface CashClosureInput {
  tenantId: number;
  tenantSlug: string;
  cashRegisterId: number;
  physicalUSD: number;
  physicalVES: number;
  physicalPOS: number;
  physicalPagoMovil: number;
  physicalZelle: number;
  physicalBinance: number;
  notes?: string;
}

export async function createCashClosureAction(input: CashClosureInput) {
  try {
    const payload = await getPayload({ config });

    // Buscar primer usuario admin para asociar
    const users = await payload.find({
      collection: 'users',
      limit: 1,
    });
    const userId = users.docs[0]?.id || 1;

    const count = await payload.count({
      collection: 'cash-closures',
      where: { tenant: { equals: input.tenantId } },
    });
    const closureNumber = `CIERRE-${String(count.totalDocs + 1).padStart(5, '0')}`;

    const doc = await payload.create({
      collection: 'cash-closures',
      data: {
        tenant: input.tenantId,
        closureNumber,
        cashRegister: input.cashRegisterId,
        openedBy: userId,
        openedAt: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
        closedAt: new Date().toISOString(),
        status: 'closed',
        declaredTotals: {
          cashUSD: Number(input.physicalUSD) || 0,
          cashVES: Number(input.physicalVES) || 0,
          posVES: Number(input.physicalPOS) || 0,
          pagoMovilVES: Number(input.physicalPagoMovil) || 0,
          zelleUSD: Number(input.physicalZelle) || 0,
          binanceUSD: Number(input.physicalBinance) || 0,
        },
        notes: input.notes || undefined,
      },
    });

    // Actualizar estado de la caja a cerrada
    await payload.update({
      collection: 'cash-registers',
      id: input.cashRegisterId,
      data: { currentStatus: 'closed' },
    });

    revalidatePath(`/${input.tenantSlug}/erp/cash-registers`);
    revalidatePath(`/${input.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al cerrar caja y registrar arqueo';
    return { success: false, error: message };
  }
}

// ==========================================
// 6. PRODUCCIÓN & RECETAS BOM
// ==========================================
export interface ExecuteProductionInput {
  tenantId: number;
  tenantSlug: string;
  bomId: number;
  unitsToProduce: number;
  sourceWarehouseId: number;
  targetWarehouseId: number;
}

export async function executeProductionOrderAction(input: ExecuteProductionInput) {
  try {
    const payload = await getPayload({ config });

    const bom = await payload.findByID({
      collection: 'bill-of-materials',
      id: input.bomId,
      depth: 1,
    });

    if (!bom) throw new Error('Receta BOM no encontrada');

    const productId = typeof bom.product === 'object' && bom.product !== null ? bom.product.id : bom.product;
    const count = await payload.count({
      collection: 'production-orders',
      where: { tenant: { equals: input.tenantId } },
    });
    const orderNumber = `ORD-FAB-${String(count.totalDocs + 1).padStart(5, '0')}`;
    const qty = Number(input.unitsToProduce) || 1;

    const doc = await payload.create({
      collection: 'production-orders',
      data: {
        tenant: input.tenantId,
        orderNumber,
        product: productId,
        bom: bom.id,
        quantityPlanned: qty,
        quantityProduced: qty,
        sourceWarehouse: input.sourceWarehouseId,
        targetWarehouse: input.targetWarehouseId,
        status: 'completed',
        completionDate: new Date().toISOString(),
      },
    });

    revalidatePath(`/${input.tenantSlug}/erp/inventory`);
    revalidatePath(`/${input.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al ejecutar orden de fabricación';
    return { success: false, error: message };
  }
}

// ==========================================
// 7. PROVEEDORES (CxP)
// ==========================================
export interface CreateSupplierInput {
  tenantId: number;
  tenantSlug: string;
  name: string;
  taxId: string;
  phone?: string;
  email?: string;
  contactName?: string;
  creditDays?: number;
  creditLimitUSD?: number;
}

export async function createSupplierAction(input: CreateSupplierInput) {
  try {
    const payload = await getPayload({ config });
    const doc = await payload.create({
      collection: 'suppliers',
      data: {
        tenant: input.tenantId,
        name: input.name,
        taxId: input.taxId,
        phone: input.phone || undefined,
        email: input.email || undefined,
        contactName: input.contactName || undefined,
        creditDays: Number(input.creditDays) || 0,
        creditLimitUSD: Number(input.creditLimitUSD) || 0,
        creditAllowed: (Number(input.creditDays) || 0) > 0,
        currentDebtUSD: 0,
        currentDebtVES: 0,
        overdueDebtUSD: 0,
      },
    });

    revalidatePath(`/${input.tenantSlug}/erp/suppliers`);
    revalidatePath(`/${input.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al registrar proveedor';
    return { success: false, error: message };
  }
}

// ==========================================
// 8. CONFIGURACIÓN DEL TENANT
// ==========================================
export interface UpdateTenantSettingsInput {
  tenantId: number;
  tenantSlug: string;
  name: string;
  rifFiscal?: string;
  phone?: string;
  baseCurrency: 'USD' | 'VES';
  manualExchangeRate?: number;
  autoSyncRate: boolean;
}

export async function updateTenantSettingsAction(input: UpdateTenantSettingsInput) {
  try {
    const payload = await getPayload({ config });
    const doc = await payload.update({
      collection: 'tenants',
      id: input.tenantId,
      data: {
        name: input.name,
        rifFiscal: input.rifFiscal || undefined,
        phone: input.phone || undefined,
        currencyConfig: {
          baseCurrency: input.baseCurrency,
          manualExchangeRate: Number(input.manualExchangeRate) || 0,
          autoSyncRate: input.autoSyncRate,
        },
      },
    });

    revalidatePath(`/${input.tenantSlug}/erp/settings`);
    revalidatePath(`/${input.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al actualizar configuración';
    return { success: false, error: message };
  }
}

// ==========================================
// 9. CREAR NUEVO INQUILINO (EMPRESA)
// ==========================================
export interface CreateTenantInput {
  name: string;
  slug: string;
  rifFiscal?: string;
  phone?: string;
}

export async function createTenantAction(input: CreateTenantInput) {
  try {
    const payload = await getPayload({ config });
    const doc = await payload.create({
      collection: 'tenants',
      data: {
        name: input.name,
        slug: input.slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-'),
        rifFiscal: input.rifFiscal || undefined,
        phone: input.phone || undefined,
        currencyConfig: {
          baseCurrency: 'USD',
          manualExchangeRate: 0,
          autoSyncRate: true,
        },
      },
    });

    revalidatePath('/');

    return { success: true, data: doc };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al crear empresa';
    return { success: false, error: message };
  }
}
