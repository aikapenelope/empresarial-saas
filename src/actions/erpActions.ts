'use server';

import { getPayload, type Payload, type PayloadRequest } from 'payload';
import config from '@payload-config';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import type { User } from '@/payload-types';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import {
  ErpAccessError,
  requireErpTenantAccess,
  requireSuperAdmin,
} from '@/utilities/erpAuth';
import {
  cashClosureSchema,
  createCashRegisterSchema,
  createCustomerSchema,
  createInvoiceSchema,
  createPaymentSchema,
  createProductSchema,
  createSupplierSchema,
  createTenantSchema,
  executeProductionSchema,
  firstZodMessage,
  updateTenantSettingsSchema,
} from '@/utilities/erpValidation';

// ==========================================
// Infraestructura de seguridad y transacciones
// ==========================================

/**
 * Resultado uniforme de las Server Actions. En caso de fallo se devuelve un mensaje
 * seguro: los errores internos (Payload/PostgreSQL) se registran en el servidor y
 * NUNCA se filtra el mensaje crudo al cliente.
 */
export interface ErpActionResult {
  success: boolean;
  error?: string;
}

/** Envuelve un bloque de escritura en una transacción de PostgreSQL accesible vía Local API. */
async function withTransaction<T>(
  payload: Payload,
  user: User,
  fn: (req: PayloadRequest) => Promise<T>,
): Promise<T> {
  const transactionID = await payload.db.beginTransaction();
  const req = { payload, user, context: {}, transactionID } as unknown as PayloadRequest;

  try {
    const result = await fn(req);
    if (transactionID) {
      await payload.db.commitTransaction(transactionID);
    }
    return result;
  } catch (error: unknown) {
    if (transactionID) {
      await payload.db.rollbackTransaction(transactionID);
    }
    throw error;
  }
}

/** Traduce un error interno a un mensaje seguro para el cliente, registrando el detalle. */
function toSafeActionError(error: unknown, fallback: string): string {
  if (error instanceof ErpAccessError) {
    return error.message;
  }
  if (error instanceof ZodError) {
    return firstZodMessage(error);
  }
  console.error('[erpActions]', error);
  return fallback;
}

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
    const parsed = createCustomerSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, (req) =>
      payload.create({
        collection: 'customers',
        data: {
          tenant: parsed.tenantId,
          name: parsed.name,
          taxId: parsed.taxId,
          phone: parsed.phone,
          email: parsed.email || undefined,
          address: parsed.address || undefined,
          status: parsed.status || 'first_time',
          creditAllowed: parsed.creditAllowed ?? false,
          creditLimitUSD: parsed.creditLimitUSD ?? 0,
          creditDays: parsed.creditDays ?? 0,
        },
        req,
      }),
    );

    revalidatePath(`/${parsed.tenantSlug}/erp/customers`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo registrar el cliente.') };
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
    const parsed = createProductSchema.parse(input);
    await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    // El stock inicial no se acepta aquí: `currentStock` es inmutable y sólo el Kardex
    // (StockMovements) puede modificarlo. El producto nace en cero.
    const doc = await payload.create({
      collection: 'products',
      data: {
        tenant: parsed.tenantId,
        name: parsed.name,
        sku: parsed.sku,
        productType: parsed.productType,
        unitOfMeasure: parsed.unitOfMeasure,
        costUSD: parsed.costUSD,
        priceUSD: parsed.priceUSD,
        taxRate: parsed.taxRate || 'exempt',
        minStockAlert: parsed.minStockAlert ?? 0,
      },
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/inventory`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo registrar el producto.') };
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
  cashMethod?:
    | 'cash_usd'
    | 'cash_ves'
    | 'pos_ves'
    | 'pago_movil'
    | 'transfer_ves'
    | 'zelle'
    | 'binance';
  cashRegisterId?: number;
  items: InvoiceItemInput[];
  notes?: string;
}

async function nextDocumentNumber(
  payload: Payload,
  collection: 'invoices' | 'customer-payments' | 'production-orders' | 'cash-closures',
  tenantId: number,
  prefix: string,
  req?: PayloadRequest,
): Promise<string> {
  const count = await payload.count({
    collection,
    where: { tenant: { equals: tenantId } },
    ...(req ? { req } : {}),
  });
  return `${prefix}-${String(count.totalDocs + 1).padStart(5, '0')}`;
}

export async function createInvoiceAction(input: CreateInvoiceInput) {
  try {
    const parsed = createInvoiceSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      const tenant = await payload.findByID({
        collection: 'tenants',
        id: parsed.tenantId,
        depth: 0,
        req,
      });

      const customer = await payload.findByID({
        collection: 'customers',
        id: parsed.customerId,
        depth: 0,
        req,
      });

      if (!customer || Number(customer.tenant) !== Number(parsed.tenantId)) {
        throw new Error('El cliente seleccionado no pertenece a este inquilino.');
      }

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
      const formattedItems = parsed.items.map((it) => {
        const totalItem = it.quantity * it.unitPriceUSD;
        subtotalUSD += totalItem;
        return {
          sku: it.sku || undefined,
          description: it.description,
          quantity: it.quantity,
          unitPriceUSD: it.unitPriceUSD,
          totalUSD: totalItem,
        };
      });

      const totalUSD = subtotalUSD;
      const totalVES = totalUSD * rate;
      const isCash = parsed.paymentTerms === 'cash';

      // Vencimiento contractual: contado vence el mismo día; crédito usa los
      // creditDays del cliente (cero = vencimiento inmediato).
      const issueDate = new Date();
      const dueDate = new Date(
        issueDate.getTime() + (isCash ? 0 : (customer.creditDays || 0) * 24 * 60 * 60 * 1000),
      );

      const invoiceNumber = await nextDocumentNumber(
        payload,
        'invoices',
        parsed.tenantId,
        'FAC',
        req,
      );

      const invDoc = await payload.create({
        collection: 'invoices',
        data: {
          tenant: parsed.tenantId,
          invoiceNumber,
          customer: parsed.customerId,
          issueDate: issueDate.toISOString(),
          dueDate: dueDate.toISOString(),
          paymentTerms: parsed.paymentTerms,
          status: isCash ? 'paid' : 'issued',
          exchangeRateSnapshot: rate,
          items: formattedItems,
          totalUSD,
          totalVES,
          balanceUSD: isCash ? 0 : totalUSD,
          balanceVES: isCash ? 0 : totalVES,
          notes: parsed.notes || undefined,
        },
        req,
      });

      // Venta de contado: capturar el recibo en el ledger de cobranzas en la misma
      // transacción, de modo que el dinero entre en los totales del turno de caja.
      if (isCash && parsed.cashMethod) {
        const isUSDMethod =
          parsed.cashMethod === 'cash_usd' ||
          parsed.cashMethod === 'zelle' ||
          parsed.cashMethod === 'binance';

        const paymentNumber = await nextDocumentNumber(
          payload,
          'customer-payments',
          parsed.tenantId,
          'RC',
          req,
        );

        await payload.create({
          collection: 'customer-payments',
          data: {
            tenant: parsed.tenantId,
            paymentNumber,
            customer: parsed.customerId,
            paymentDate: new Date().toISOString(),
            status: 'confirmed',
            cashRegister: parsed.cashRegisterId || undefined,
            methods: [
              {
                method: parsed.cashMethod,
                currency: isUSDMethod ? 'USD' : 'VES',
                amount: isUSDMethod ? totalUSD : totalVES,
                exchangeRate: rate,
                amountUSD: totalUSD,
              },
            ],
            totalUSD,
            allocations: [
              {
                invoice: invDoc.id,
                allocatedAmountUSD: totalUSD,
              },
            ],
            notes: `Cobro automático de la venta de contado ${invoiceNumber}`,
          },
          req,
        });
      }

      return invDoc;
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/invoices`);
    revalidatePath(`/${parsed.tenantSlug}/erp/customers`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo emitir la factura.') };
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
    const parsed = createPaymentSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      const tenant = await payload.findByID({
        collection: 'tenants',
        id: parsed.tenantId,
        depth: 0,
        req,
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

      const amountUSD = parsed.amountUSD;
      const isUSDMethod =
        parsed.method === 'cash_usd' || parsed.method === 'zelle' || parsed.method === 'binance';
      const amountNative = isUSDMethod ? amountUSD : amountUSD * rate;

      // Semántica de imputación: el pago SIEMPRE afecta el balance. Con factura
      // específica se valida pertenencia y saldo; sin factura se reparte FIFO por
      // vencimiento entre las facturas abiertas del cliente. Nunca se confirma un
      // pago sin imputación (la deuda del cliente quedaría intacta).
      let allocations: Array<{ invoice: number; allocatedAmountUSD: number }>;

      if (parsed.invoiceId) {
        const invoice = await payload.findByID({
          collection: 'invoices',
          id: parsed.invoiceId,
          depth: 0,
          req,
        });

        if (!invoice || Number(invoice.tenant) !== Number(parsed.tenantId)) {
          throw new Error('La factura seleccionada no pertenece a este inquilino.');
        }
        if (Number(invoice.customer) !== Number(parsed.customerId)) {
          throw new Error('La factura seleccionada no pertenece al cliente indicado.');
        }

        const invoiceBalance = Number(invoice.balanceUSD) || 0;
        if (invoice.status === 'paid' || invoiceBalance <= 0) {
          throw new Error('La factura seleccionada ya no tiene saldo pendiente.');
        }
        if (amountUSD > invoiceBalance + 0.005) {
          throw new Error(
            `El monto excede el saldo pendiente de la factura (${invoiceBalance.toFixed(2)} USD).`,
          );
        }

        allocations = [
          {
            invoice: invoice.id,
            allocatedAmountUSD: Math.min(amountUSD, invoiceBalance),
          },
        ];
      } else {
        const openInvoices = await payload.find({
          collection: 'invoices',
          where: {
            and: [
              { tenant: { equals: parsed.tenantId } },
              { customer: { equals: parsed.customerId } },
              { status: { in: ['issued', 'partially_paid'] } },
            ],
          },
          sort: 'dueDate',
          pagination: false,
          depth: 0,
          req,
        });

        let remaining = amountUSD;
        allocations = [];

        for (const inv of openInvoices.docs) {
          if (remaining <= 0.005) break;
          const balance = Number(inv.balanceUSD) || 0;
          if (balance <= 0) continue;

          const alloc = Math.min(remaining, balance);
          allocations.push({
            invoice: inv.id,
            allocatedAmountUSD: Number(alloc.toFixed(2)),
          });
          remaining -= alloc;
        }

        if (remaining > 0.005) {
          throw new Error(
            'El monto excede la deuda abierta del cliente: no hay facturas suficientes para imputar el sobrante.',
          );
        }
      }

      const paymentNumber = await nextDocumentNumber(
        payload,
        'customer-payments',
        parsed.tenantId,
        'RC',
        req,
      );

      return payload.create({
        collection: 'customer-payments',
        data: {
          tenant: parsed.tenantId,
          paymentNumber,
          customer: parsed.customerId,
          paymentDate: new Date().toISOString(),
          status: 'confirmed',
          methods: [
            {
              method: parsed.method,
              currency: isUSDMethod ? 'USD' : 'VES',
              amount: amountNative,
              exchangeRate: rate,
              amountUSD,
              reference: parsed.referenceNumber || undefined,
            },
          ],
          totalUSD: amountUSD,
          allocations,
          notes: parsed.notes || undefined,
        },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/customers`);
    revalidatePath(`/${parsed.tenantSlug}/erp/invoices`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo registrar el cobro.') };
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
    const parsed = createCashRegisterSchema.parse(input);
    await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const doc = await payload.create({
      collection: 'cash-registers',
      data: {
        tenant: parsed.tenantId,
        name: parsed.name,
        code: parsed.code,
        warehouse: parsed.warehouseId,
        currentStatus: 'closed',
        active: true,
      },
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/cash-registers`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo registrar la caja.') };
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
  physicalTransfer: number;
  physicalZelle: number;
  physicalBinance: number;
  notes?: string;
}

export async function createCashClosureAction(input: CashClosureInput) {
  try {
    const parsed = cashClosureSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    // Arqueo del turno ABIERTO de la caja: se actualiza el documento de cierre existente
    // (preservando apertura, usuario y transacciones del turno) para que sus hooks calculen
    // los totales del sistema y el sobrante/faltante atómicamente. Nunca se fabrica un turno.
    const openClosure = await payload.find({
      collection: 'cash-closures',
      where: {
        and: [
          { tenant: { equals: parsed.tenantId } },
          { cashRegister: { equals: parsed.cashRegisterId } },
          { status: { equals: 'open' } },
        ],
      },
      limit: 1,
      depth: 0,
    });

    const closure = openClosure.docs[0];
    if (!closure) {
      return {
        success: false,
        error:
          'No hay un turno abierto para esta caja. Abra la caja antes de realizar el arqueo de cierre.',
      };
    }

    const doc = await payload.update({
      collection: 'cash-closures',
      id: closure.id,
      data: {
        status: 'closed',
        closedAt: new Date().toISOString(),
        closedBy: user.id,
        declaredTotals: {
          cashUSD: parsed.physicalUSD,
          cashVES: parsed.physicalVES,
          posVES: parsed.physicalPOS,
          pagoMovilVES: parsed.physicalPagoMovil,
          transferVES: parsed.physicalTransfer,
          zelleUSD: parsed.physicalZelle,
          binanceUSD: parsed.physicalBinance,
        },
        notes: parsed.notes || undefined,
      },
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/cash-registers`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return {
      success: false,
      error: toSafeActionError(error, 'No se pudo cerrar la caja y registrar el arqueo.'),
    };
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
    const parsed = executeProductionSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      const bom = await payload.findByID({
        collection: 'bill-of-materials',
        id: parsed.bomId,
        depth: 1,
        req,
      });

      if (!bom) throw new Error('Receta BOM no encontrada');
      if (Number(bom.tenant) !== Number(parsed.tenantId)) {
        throw new Error('La receta BOM no pertenece a este inquilino.');
      }

      const productId =
        typeof bom.product === 'object' && bom.product !== null ? bom.product.id : bom.product;
      const orderNumber = await nextDocumentNumber(
        payload,
        'production-orders',
        parsed.tenantId,
        'ORD-FAB',
        req,
      );
      const qty = parsed.unitsToProduce;

      return payload.create({
        collection: 'production-orders',
        data: {
          tenant: parsed.tenantId,
          orderNumber,
          product: productId,
          bom: bom.id,
          quantityPlanned: qty,
          quantityProduced: qty,
          sourceWarehouse: parsed.sourceWarehouseId,
          targetWarehouse: parsed.targetWarehouseId,
          status: 'completed',
          completionDate: new Date().toISOString(),
        },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/inventory`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return {
      success: false,
      error: toSafeActionError(error, 'No se pudo ejecutar la orden de fabricación.'),
    };
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
    const parsed = createSupplierSchema.parse(input);
    await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const doc = await payload.create({
      collection: 'suppliers',
      data: {
        tenant: parsed.tenantId,
        name: parsed.name,
        taxId: parsed.taxId,
        phone: parsed.phone || undefined,
        email: parsed.email || undefined,
        contactName: parsed.contactName || undefined,
        creditDays: parsed.creditDays ?? 0,
        creditLimitUSD: parsed.creditLimitUSD ?? 0,
        creditAllowed: (parsed.creditDays ?? 0) > 0,
      },
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/suppliers`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo registrar el proveedor.') };
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
    const parsed = updateTenantSettingsSchema.parse(input);
    await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const doc = await payload.update({
      collection: 'tenants',
      id: parsed.tenantId,
      data: {
        name: parsed.name,
        rifFiscal: parsed.rifFiscal || undefined,
        phone: parsed.phone || undefined,
        currencyConfig: {
          baseCurrency: parsed.baseCurrency,
          manualExchangeRate: parsed.manualExchangeRate ?? 0,
          autoSyncRate: parsed.autoSyncRate,
        },
      },
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/settings`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return {
      success: false,
      error: toSafeActionError(error, 'No se pudo actualizar la configuración.'),
    };
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
    const parsed = createTenantSchema.parse(input);
    await requireSuperAdmin();
    const payload = await getPayload({ config });

    const doc = await payload.create({
      collection: 'tenants',
      data: {
        name: parsed.name,
        slug: parsed.slug,
        rifFiscal: parsed.rifFiscal || undefined,
        phone: parsed.phone || undefined,
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
    return { success: false, error: toSafeActionError(error, 'No se pudo crear la empresa.') };
  }
}
