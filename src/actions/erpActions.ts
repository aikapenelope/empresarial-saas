'use server';

import { getPayload, type Payload, type PayloadRequest } from 'payload';
import config from '@payload-config';
import { revalidatePath } from 'next/cache';
import { sql } from '@payloadcms/db-postgres';
import { ZodError } from 'zod';
import type { User } from '@/payload-types';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import {
  ErpAccessError,
  requireErpTenantAccess,
  requireSuperAdmin,
} from '@/utilities/erpAuth';
import { getActiveDb } from '@/utilities/inventoryLedger';
import { assertNoOpenShiftForRegister } from '@/utilities/cashLedger';
import {
  cashClosureSchema,
  convertQuoteSchema,
  createCashRegisterSchema,
  createCustomerSchema,
  createInvoiceSchema,
  createPaymentSchema,
  createProductSchema,
  adjustStockSchema,
  createPurchaseInvoiceSchema,
  createQuoteSchema,
  createSaleReturnSchema,
  createSupplierSchema,
  createTenantSchema,
  ensureWalkInCustomerSchema,
  executeProductionSchema,
  firstZodMessage,
  importStockSchema,
  receivePurchaseGoodsSchema,
  completeInventoryCountSchema,
  createInventoryCountSchema,
  openCashShiftSchema,
  saveCountedItemsSchema,
  transferStockSchema,
  supplierPaymentSchema,
  updateCustomerSchema,
  updateProductSchema,
  updateQuoteSchema,
  voidInvoiceSchema,
  updateQuoteStatusSchema,
  updateTenantSettingsSchema,
} from '@/utilities/erpValidation';
import { importStockToWarehouse } from '@/utilities/inventoryImport';
import {
  completeInventoryCount,
  snapshotWarehouseStock,
} from '@/utilities/inventoryCounts';
import { returnSaleLines } from '@/utilities/salesLedger';

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

/** Roles con permiso de crear/actualizar catálogos y operaciones restringidas (RBAC de colecciones). */
const ERP_OPERATOR_ROLES: Array<User['role']> = ['super-admin', 'tenant-admin', 'supervisor'];

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

export interface EnsureWalkInCustomerInput {
  tenantId: number;
  tenantSlug: string;
}

/**
 * Garantiza la existencia del cliente genérico de mostrador (RIF V-00000000)
 * para ventas rápidas sin identificación del comprador. Idempotente.
 */
export async function ensureWalkInCustomerAction(input: EnsureWalkInCustomerInput) {
  try {
    const parsed = ensureWalkInCustomerSchema.parse(input);
    await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const existing = await payload.find({
      collection: 'customers',
      where: {
        and: [
          { tenant: { equals: parsed.tenantId } },
          { taxId: { equals: 'V-00000000' } },
        ],
      },
      limit: 1,
      depth: 0,
    });

    if (existing.docs.length > 0) {
      return { success: true, data: existing.docs[0] };
    }

    const doc = await payload.create({
      collection: 'customers',
      data: {
        tenant: parsed.tenantId,
        name: 'Cliente de Mostrador',
        taxId: 'V-00000000',
        phone: '58-0000000000',
        status: 'recurring',
        priceTier: 'retail',
        creditAllowed: false,
        creditLimitUSD: 0,
        creditDays: 0,
      },
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/pos`);
    revalidatePath(`/${parsed.tenantSlug}/erp/customers`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return {
      success: false,
      error: toSafeActionError(error, 'No se pudo preparar el cliente de mostrador.'),
    };
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
    await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
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

export interface ImportStockInput {
  tenantId: number;
  tenantSlug: string;
  warehouseId: number;
  mode: 'adjust' | 'set';
  rows: Array<{ sku: string; quantity: number }>;
}

/**
 * Carga masiva de existencias por Kardex (Sprint 9). RBAC de operador
 * (super-admin/tenant-admin/supervisor) — el mismo de los movimientos de inventario.
 * Toda la importación corre en UNA transacción: válido se crea, inválido se
 * rechaza por fila con mensaje; el stock resultante nunca puede quedar negativo.
 */
export async function importStockAction(input: ImportStockInput) {
  try {
    const parsed = importStockSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
    const payload = await getPayload({ config });

    const summary = await withTransaction(payload, user, (req) =>
      importStockToWarehouse({
        tenantId: parsed.tenantId,
        warehouseId: parsed.warehouseId,
        mode: parsed.mode,
        rows: parsed.rows,
        req,
      }),
    );

    revalidatePath(`/${parsed.tenantSlug}/erp/inventory`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: summary };
  } catch (error: unknown) {
    return {
      success: false,
      error: toSafeActionError(error, 'No se pudo importar el inventario.'),
    };
  }
}

export interface TransferStockInput {
  tenantId: number;
  tenantSlug: string;
  productId: number;
  sourceWarehouseId: number;
  targetWarehouseId: number;
  quantity: number;
  reason?: string;
}

/**
 * Transferencia entre almacenes (Sprint 15). El beforeValidate del Kardex
 * valida: almacenes distintos, pertenencia al inquilino y stock disponible
 * en el origen. Un solo movimiento `transfer` (sale del origen, entra al destino).
 */
export async function transferStockAction(input: TransferStockInput) {
  try {
    const parsed = transferStockSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
    const payload = await getPayload({ config });

    if (Number(parsed.sourceWarehouseId) === Number(parsed.targetWarehouseId)) {
      return { success: false, error: 'El almacén origen y destino deben ser distintos.' };
    }

    const doc = await withTransaction(payload, user, async (req) => {
      const tenant = await payload.findByID({
        collection: 'tenants',
        id: parsed.tenantId,
        depth: 0,
        req,
      });

      const product = await payload.findByID({
        collection: 'products',
        id: parsed.productId,
        depth: 0,
        req,
      });
      if (!product || Number(product.tenant) !== Number(parsed.tenantId)) {
        throw new Error('El producto no pertenece a este inquilino.');
      }
      if (product.productType === 'service' || product.trackInventory === false) {
        throw new Error(`"${product.name}" no controla existencias (servicio o sin kardex).`);
      }

      const movement = await payload.create({
        collection: 'stock-movements',
        data: {
          tenant: parsed.tenantId,
          reference: `TRASLADO-${product.sku}`,
          movementType: 'transfer',
          product: product.id,
          sourceWarehouse: parsed.sourceWarehouseId,
          targetWarehouse: parsed.targetWarehouseId,
          quantity: parsed.quantity,
          unitCostUSD: Number(product.costUSD) || 0,
          totalCostUSD: Number((parsed.quantity * (Number(product.costUSD) || 0)).toFixed(2)),
          reason: parsed.reason || 'Transferencia entre almacenes',
        },
        req,
        context: {
          ...req.context,
          allowInternalStockUpdate: true,
        },
      });

      // El slug para revalidatePath viene del inquilino autorizado, no del input
      return { movement, tenantSlug: String(tenant.slug) };
    });

    revalidatePath(`/${doc.tenantSlug}/erp/inventory`);
    revalidatePath(`/${doc.tenantSlug}/erp/inventory/kardex`);

    return { success: true, data: doc.movement };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo transferir el inventario.') };
  }
}

export interface AdjustStockInput {
  tenantId: number;
  tenantSlug: string;
  productId: number;
  warehouseId: number;
  direction: 'in' | 'out';
  quantity: number;
  reason: string;
}

/**
 * Ajuste manual de inventario (entrada/salida) con motivo obligatorio.
 * Las salidas validan stock disponible vía el beforeValidate del Kardex.
 */
export async function adjustStockAction(input: AdjustStockInput) {
  try {
    const parsed = adjustStockSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      const tenant = await payload.findByID({
        collection: 'tenants',
        id: parsed.tenantId,
        depth: 0,
        req,
      });

      const product = await payload.findByID({
        collection: 'products',
        id: parsed.productId,
        depth: 0,
        req,
      });
      if (!product || Number(product.tenant) !== Number(parsed.tenantId)) {
        throw new Error('El producto no pertenece a este inquilino.');
      }
      if (product.productType === 'service' || product.trackInventory === false) {
        throw new Error(`"${product.name}" no controla existencias (servicio o sin kardex).`);
      }

      const isEntry = parsed.direction === 'in';
      const movementData = {
        tenant: parsed.tenantId,
        reference: `AJUSTE-${product.sku}`,
        product: product.id,
        quantity: parsed.quantity,
        unitCostUSD: Number(product.costUSD) || 0,
        totalCostUSD: Number((parsed.quantity * (Number(product.costUSD) || 0)).toFixed(2)),
        reason: parsed.reason,
        ...(isEntry
          ? { movementType: 'adjustment_positive' as const, targetWarehouse: parsed.warehouseId }
          : { movementType: 'adjustment_negative' as const, sourceWarehouse: parsed.warehouseId }),
      };

      const movement = await payload.create({
        collection: 'stock-movements',
        data: movementData,
        req,
        context: {
          ...req.context,
          allowInternalStockUpdate: true,
        },
      });

      // El slug para revalidatePath viene del inquilino autorizado, no del input
      return { movement, tenantSlug: String(tenant.slug) };
    });

    revalidatePath(`/${doc.tenantSlug}/erp/inventory`);
    revalidatePath(`/${doc.tenantSlug}/erp/inventory/kardex`);

    return { success: true, data: doc.movement };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo registrar el ajuste.') };
  }
}

// ==========================================
// 3. FACTURACIÓN & VENTAS (INVOICES)
// ==========================================// ==========================================
// 3. FACTURACIÓN & VENTAS (INVOICES)
// ==========================================
export interface InvoiceItemInput {
  productId?: number;
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
  warehouseId?: number;
  items: InvoiceItemInput[];
  notes?: string;
}

/**
 * Numeración consecutiva por inquilino y tipo de documento. Toma un advisory lock
 * transaccional (liberado en commit/rollback) para que dos escrituras concurrentes
 * no elijan el mismo número; debe llamarse SIEMPRE dentro de la transacción del
 * llamador (req requerido). Los índices únicos compuestos (tenant, número) sirven
 * de red de seguridad en base de datos.
 */
const DOC_NUMBER_TABLES: Record<
  | 'invoices'
  | 'customer-payments'
  | 'production-orders'
  | 'cash-closures'
  | 'quotes'
  | 'purchase-invoices'
  | 'supplier-payments',
  { table: string; column: string }
> = {
  invoices: { table: 'invoices', column: 'invoice_number' },
  'customer-payments': { table: 'customer_payments', column: 'payment_number' },
  'production-orders': { table: 'production_orders', column: 'order_number' },
  'cash-closures': { table: 'cash_closures', column: 'closure_number' },
  quotes: { table: 'quotes', column: 'quote_number' },
  'purchase-invoices': { table: 'purchase_invoices', column: 'invoice_number' },
  'supplier-payments': { table: 'supplier_payments', column: 'payment_number' },
};

/**
 * Numeración consecutiva por inquilino y tipo de documento. Toma un advisory lock
 * transaccional (liberado en commit/rollback) para que dos escrituras concurrentes
 * no elijan el mismo número; debe llamarse SIEMPRE dentro de la transacción del
 * llamador (req requerido). Usa MAX del sufijo numérico — no COUNT — para que los
 * gaps por eliminación no reciclen números ya emitidos; los índices únicos
 * compuestos (tenant, número) son la red de seguridad final en base de datos.
 */
async function nextDocumentNumber(
  payload: Payload,
  collection: 'invoices' | 'customer-payments' | 'production-orders' | 'cash-closures' | 'quotes' | 'purchase-invoices' | 'supplier-payments',
  tenantId: number,
  prefix: string,
  req: PayloadRequest,
): Promise<string> {
  const db = getActiveDb(req);
  await db.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`docnum:${collection}:${tenantId}`}))`,
  );

  const { table, column } = DOC_NUMBER_TABLES[collection];
  // Solo se consideran identificadores con el formato generado por el sistema
  // (`prefijo-<solo dígitos>`): valores manuales o históricos con otro formato
  // se ignoran en la secuencia y no pueden romper el CAST del sufijo.
  const maxRes = await db.execute(
    sql`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(${sql.raw(column)}, '^.*-', '') AS integer)), 0) AS max_num
        FROM ${sql.raw(table)}
        WHERE tenant_id = ${tenantId}
          AND ${sql.raw(column)} ~ ('^' || ${prefix} || '-[0-9]+$')`,
  );
  const maxNum = Number(maxRes.rows?.[0]?.max_num) || 0;

  return `${prefix}-${String(maxNum + 1).padStart(5, '0')}`;
}

/**
 * Núcleo compartido de creación de facturas (usado por createInvoiceAction y por
 * convertQuoteToInvoiceAction). DEBE ejecutarse dentro de la transacción del
 * llamador: crea la factura pendiente, y en ventas de contado genera el recibo
 * automático que la liquida vía allocation (hook de CustomerPayments).
 */
async function createInvoiceCore(
  payload: Payload,
  user: User,
  parsed: ReturnType<typeof createInvoiceSchema.parse>,
  req: PayloadRequest,
) {
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
      product: it.productId || undefined,
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

  // Venta a crédito: validar habilitación y capacidad disponible del cliente
  // (límite - deuda vigente) ANTES de crear el documento.
  if (!isCash) {
    if (customer.creditAllowed === false) {
      throw new Error(
        `El cliente "${customer.name}" no tiene crédito habilitado. Registre la venta de contado o habilite su línea de crédito.`,
      );
    }
    const availableCreditUSD =
      (Number(customer.creditLimitUSD) || 0) - (Number(customer.currentDebtUSD) || 0);
    if (totalUSD > availableCreditUSD + 0.005) {
      throw new Error(
        `Límite de crédito insuficiente para "${customer.name}": disponible ${Math.max(availableCreditUSD, 0).toFixed(2)} USD, requerido ${totalUSD.toFixed(2)} USD.`,
      );
    }
  }

  // Vencimiento contractual: contado vence el mismo día; crédito usa los
  // creditDays del cliente (cero = vencimiento inmediato).
  const issueDate = new Date();
  const dueDate = new Date(
    issueDate.getTime() + (isCash ? 0 : (customer.creditDays || 0) * 24 * 60 * 60 * 1000),
  );

  // La factura de contado nace PENDIENTE (issued, con saldo): es el recibo
  // automático quien la liquida vía su allocation (el hook de CustomerPayments
  // aplica el pago y flipea el estado a paid). Crearla ya pagada y con saldo
  // cero haría que applyPaymentAllocations rechazara la imputación y revirtiera todo.
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
      status: 'issued',
      warehouse: parsed.warehouseId || undefined,
      exchangeRateSnapshot: rate,
      items: formattedItems,
      totalUSD,
      totalVES,
      balanceUSD: totalUSD,
      balanceVES: totalVES,
      notes: parsed.notes || undefined,
    },
    req,
  });

  // Plan de cuotas para ventas a crédito: N cuotas iguales, la primera vence a
  // creditDays y las siguientes cada 30 días (el ajuste de redondeo va a la última).
  if (!isCash) {
    const count = parsed.installmentsCount ?? 1;
    const creditDays = customer.creditDays || 0;
    const baseAmount = Math.floor((totalUSD / count) * 100) / 100;
    const installments = Array.from({ length: count }, (_, i) => {
      const isLast = i === count - 1;
      return {
        number: i + 1,
        dueDate: new Date(
          issueDate.getTime() + (creditDays + i * 30) * 24 * 60 * 60 * 1000,
        ).toISOString(),
        amountUSD: isLast
          ? Number((totalUSD - baseAmount * (count - 1)).toFixed(2))
          : baseAmount,
        paidUSD: 0,
        status: 'pending' as const,
      };
    });

    await payload.update({
      collection: 'invoices',
      id: invDoc.id,
      data: { installments },
      req,
    });
  }

  if (!isCash || !parsed.cashMethod) {
    return invDoc;
  }

  // Venta de contado: capturar el recibo en el ledger de cobranzas en la misma
  // transacción. Si se indicó caja registradora, debe estar abierta y pertenecer
  // al inquilino.
  if (parsed.cashRegisterId) {
    const register = await payload.findByID({
      collection: 'cash-registers',
      id: parsed.cashRegisterId,
      depth: 0,
      req,
    });

    if (!register || Number(register.tenant) !== Number(parsed.tenantId)) {
      throw new Error('La caja registradora indicada no pertenece a este inquilino.');
    }
    if (!register.active || register.currentStatus !== 'open') {
      throw new Error(
        'La caja registradora indicada no tiene un turno abierto. Seleccione una caja abierta o continúe sin turno.',
      );
    }
  }

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

  return invDoc;
}

export async function createInvoiceAction(input: CreateInvoiceInput) {
  try {
    const parsed = createInvoiceSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, (req) =>
      createInvoiceCore(payload, user, parsed, req),
    );

    revalidatePath(`/${parsed.tenantSlug}/erp/invoices`);
    revalidatePath(`/${parsed.tenantSlug}/erp/customers`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo emitir la factura.') };
  }
}

export interface CreateQuoteInput {
  tenantId: number;
  tenantSlug: string;
  customerId: number;
  items: Array<{
    productId?: number;
    sku?: string;
    description: string;
    quantity: number;
    unitPriceUSD: number;
  }>;
  validUntil?: string;
  notes?: string;
}

export async function createQuoteAction(input: CreateQuoteInput) {
  try {
    const parsed = createQuoteSchema.parse(input);
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

      const quoteNumber = await nextDocumentNumber(
        payload,
        'quotes',
        parsed.tenantId,
        'COT',
        req,
      );

      return payload.create({
        collection: 'quotes',
        data: {
          tenant: parsed.tenantId,
          quoteNumber,
          customer: parsed.customerId,
          items: parsed.items.map((it) => ({
            product: it.productId || undefined,
            sku: it.sku || undefined,
            description: it.description,
            quantity: it.quantity,
            unitPriceUSD: it.unitPriceUSD,
          })),
          issueDate: new Date().toISOString(),
          validUntil: parsed.validUntil || undefined,
          status: 'draft',
          exchangeRateSnapshot: rate,
          notes: parsed.notes || undefined,
        },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/quotes`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo crear la cotización.') };
  }
}

export interface UpdateQuoteStatusInput {
  tenantId: number;
  tenantSlug: string;
  quoteId: number;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
}

export async function updateQuoteStatusAction(input: UpdateQuoteStatusInput) {
  try {
    const parsed = updateQuoteStatusSchema.parse(input);
    await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const quote = await payload.findByID({
      collection: 'quotes',
      id: parsed.quoteId,
      depth: 0,
    });

    if (!quote || Number(quote.tenant) !== Number(parsed.tenantId)) {
      return { success: false, error: 'La cotización no pertenece a este inquilino.' };
    }

    const doc = await payload.update({
      collection: 'quotes',
      id: parsed.quoteId,
      data: { status: parsed.status },
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/quotes`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo actualizar la cotización.') };
  }
}

export interface ConvertQuoteInput {
  tenantId: number;
  tenantSlug: string;
  quoteId: number;
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
  warehouseId?: number;
}

/**
 * Conversión transaccional de cotización a factura: reutiliza createInvoiceCore
 * (numeración, snapshot de tasa, validación de crédito, recibo de contado y
 * descarga de kardex vía el plugin de ventas) y marca la cotización como
 * `converted` con el vínculo a la factura generada. Todo en UNA transacción.
 */
export async function convertQuoteToInvoiceAction(input: ConvertQuoteInput) {
  try {
    const parsed = convertQuoteSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      const quote = await payload.findByID({
        collection: 'quotes',
        id: parsed.quoteId,
        depth: 0,
        req,
      });

      if (!quote || Number(quote.tenant) !== Number(parsed.tenantId)) {
        throw new Error('La cotización no pertenece a este inquilino.');
      }
      if (quote.status === 'converted') {
        throw new Error('La cotización ya fue convertida a factura.');
      }
      if (quote.status === 'rejected' || quote.status === 'expired') {
        throw new Error(`No se puede convertir una cotización en estado "${quote.status}".`);
      }

      const invoiceParsed = createInvoiceSchema.parse({
        tenantId: parsed.tenantId,
        tenantSlug: parsed.tenantSlug,
        customerId: quote.customer,
        paymentTerms: parsed.paymentTerms,
        cashMethod: parsed.paymentTerms === 'cash' ? parsed.cashMethod : undefined,
        cashRegisterId: parsed.cashRegisterId,
        warehouseId: parsed.warehouseId,
        items: (quote.items || []).map((item) => ({
          productId:
            typeof item.product === 'object' && item.product !== null
              ? item.product.id
              : (item.product as number | undefined) || undefined,
          sku: item.sku || undefined,
          description: item.description,
          quantity: Number(item.quantity),
          unitPriceUSD: Number(item.unitPriceUSD),
        })),
        notes: `Conversión de la cotización ${quote.quoteNumber}`,
      });

      const invoice = await createInvoiceCore(payload, user, invoiceParsed, req);

      await payload.update({
        collection: 'quotes',
        id: quote.id,
        data: {
          status: 'converted',
          convertedInvoice: invoice.id,
        },
        req,
      });

      return invoice;
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/quotes`);
    revalidatePath(`/${parsed.tenantSlug}/erp/invoices`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return {
      success: false,
      error: toSafeActionError(error, 'No se pudo convertir la cotización a factura.'),
    };
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

export interface CreateSaleReturnInput {
  tenantId: number;
  tenantSlug: string;
  invoiceId: number;
  lines: Array<{ productId: number; quantity: number }>;
  reason?: string;
}

/**
 * Devolución parcial de mercancía sobre una factura vigente (Sprint 10).
 * Valida contra el Kardex inmutable que `devuelto + solicitado ≤ vendido` por
 * producto y reingresa al MISMO almacén de salida (FIFO). Transaccional: todo o
 * nada. La anulación total (voided) sigue revirtiendo el remanente vía
 * revertSaleFromInventory (idempotencia por saldos).
 */
export async function createSaleReturnAction(input: CreateSaleReturnInput) {
  try {
    const parsed = createSaleReturnSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      const invoice = await payload.findByID({
        collection: 'invoices',
        id: parsed.invoiceId,
        depth: 0,
        req,
      });

      if (!invoice || Number(invoice.tenant) !== Number(parsed.tenantId)) {
        throw new Error('La factura no pertenece a este inquilino.');
      }

      const summary = await returnSaleLines({
        invoice,
        lines: parsed.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        reason: parsed.reason,
        req,
      });

      const failed = summary.results.filter((r) => r.status === 'error');
      if (failed.length > 0) {
        throw new Error(
          failed.map((f) => f.message || 'Línea inválida.').join(' '),
        );
      }

      return summary;
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/invoices`);
    revalidatePath(`/${parsed.tenantSlug}/erp/inventory`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return {
      success: false,
      error: toSafeActionError(error, 'No se pudo registrar la devolución.'),
    };
  }
}

export interface CreateInventoryCountInput {
  tenantId: number;
  tenantSlug: string;
  warehouseId: number;
  notes?: string;
}

/** Paso 1: abre un conteo con snapshot de existencias del sistema por almacén. */
export async function createInventoryCountAction(input: CreateInventoryCountInput) {
  try {
    const parsed = createInventoryCountSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      const warehouse = await payload.findByID({
        collection: 'warehouses',
        id: parsed.warehouseId,
        depth: 0,
        req,
      });
      if (!warehouse || Number(warehouse.tenant) !== Number(parsed.tenantId)) {
        throw new Error('El almacén no pertenece a este inquilino.');
      }

      const items = await snapshotWarehouseStock({
        warehouseId: Number(parsed.warehouseId),
        req,
      });
      if (items.length === 0) {
        throw new Error('El almacén no tiene movimientos de inventario que contar.');
      }

      return payload.create({
        collection: 'inventory-counts',
        data: {
          tenant: parsed.tenantId,
          warehouse: parsed.warehouseId,
          status: 'in_progress',
          items,
          notes: parsed.notes || undefined,
          openedBy: user.id,
        },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/inventory/counts`);
    revalidatePath(`/${parsed.tenantSlug}/erp/inventory`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo crear el conteo.') };
  }
}

export interface SaveCountedItemsInput {
  tenantId: number;
  tenantSlug: string;
  countId: number;
  counted: Array<{ productId: number; countedQty: number }>;
}

/** Paso 2: guarda las cantidades físicas contadas y calcula diferencias. */
export async function saveCountedItemsAction(input: SaveCountedItemsInput) {
  try {
    const parsed = saveCountedItemsSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      const count = await payload.findByID({
        collection: 'inventory-counts',
        id: parsed.countId,
        depth: 0,
        req,
      });

      if (!count || Number(count.tenant) !== Number(parsed.tenantId)) {
        throw new Error('El conteo no pertenece a este inquilino.');
      }
      if (count.status === 'completed') {
        throw new Error('El conteo ya está completado y es inmutable.');
      }

      const countedMap = new Map(
        parsed.counted.map((c) => [Number(c.productId), Number(c.countedQty)]),
      );

      const items = (Array.isArray(count.items) ? count.items : []).map((item) => {
        const productId = Number(
          typeof item.product === 'object' && item.product !== null ? item.product.id : item.product,
        );
        const countedQty = countedMap.get(productId);
        const systemQty = Number(item.systemQty) || 0;
        if (countedQty === undefined) {
          return { ...item, difference: Number((0 - systemQty).toFixed(4)) };
        }
        return {
          ...item,
          countedQty,
          difference: Number((countedQty - systemQty).toFixed(4)),
        };
      });

      return payload.update({
        collection: 'inventory-counts',
        id: count.id,
        data: { items: items as never },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/inventory/counts`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo guardar el conteo.') };
  }
}

export interface CompleteInventoryCountInput {
  tenantId: number;
  tenantSlug: string;
  countId: number;
}

/**
 * Paso 3: completa el conteo generando ajustes por Kardex para cada diferencia
 * (transaccional — el conteo marca completado solo si todos los ajustes se crean).
 */
export async function completeInventoryCountAction(input: CompleteInventoryCountInput) {
  try {
    const parsed = completeInventoryCountSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      const count = await payload.findByID({
        collection: 'inventory-counts',
        id: parsed.countId,
        depth: 0,
        req,
      });

      if (!count || Number(count.tenant) !== Number(parsed.tenantId)) {
        throw new Error('El conteo no pertenece a este inquilino.');
      }

      const adjusted = await completeInventoryCount({
        count,
        completedBy: user.id,
        req,
      });

      return { countId: count.id, adjustedProducts: adjusted };
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/inventory/counts`);
    revalidatePath(`/${parsed.tenantSlug}/erp/inventory`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return {
      success: false,
      error: toSafeActionError(error, 'No se pudo completar el conteo.'),
    };
  }
}

export interface VoidInvoiceInput {
  tenantId: number;
  tenantSlug: string;
  invoiceId: number;
  reason?: string;
}

/**
 * Anulación de factura (Sprint 13). Solo super-admin/tenant-admin. El status
 * `voided` dispara — vía salesInventoryPlugin — la reversión del kardex por
 * saldos y deja el balance en cero; la reconciliación de cuotas marca todas
 * pendientes como cubiertas por la anulación (balance 0 → pagado). Auditada.
 */
export async function voidInvoiceAction(input: VoidInvoiceInput) {
  try {
    const parsed = voidInvoiceSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, [
      'super-admin',
      'tenant-admin',
    ]);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      const invoice = await payload.findByID({
        collection: 'invoices',
        id: parsed.invoiceId,
        depth: 0,
        req,
      });

      if (!invoice || Number(invoice.tenant) !== Number(parsed.tenantId)) {
        throw new Error('La factura no pertenece a este inquilino.');
      }
      if (invoice.status === 'voided') {
        throw new Error('La factura ya está anulada.');
      }
      if (invoice.status === 'draft') {
        throw new Error('Las facturas en borrador se eliminan, no se anulan.');
      }

      return payload.update({
        collection: 'invoices',
        id: invoice.id,
        data: {
          status: 'voided',
          ...(parsed.reason
            ? {
                notes: `${invoice.notes ? `${invoice.notes} — ` : ''}ANULADA: ${parsed.reason}`,
              }
            : {}),
        },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/invoices`);
    revalidatePath(`/${parsed.tenantSlug}/erp/invoices/${parsed.invoiceId}`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo anular la factura.') };
  }
}

export interface CreatePurchaseInvoiceInput {
  tenantId: number;
  tenantSlug: string;
  supplierId: number;
  items: Array<{
    productId: number;
    sku?: string;
    description: string;
    quantity: number;
    unitCostUSD: number;
  }>;
  dueDate?: string;
  receptionWarehouseId?: number;
  notes?: string;
}

/**
 * Registra una compra a proveedor (Sprint 14). Si se indica almacén de
 * recepción, la compra nace `received` y el hook existente descarga el
 * snapshot de tasa, ingresa `purchase_in` al kardex y actualiza el costo
 * ponderado — todo en la misma transacción.
 */
export async function createPurchaseInvoiceAction(input: CreatePurchaseInvoiceInput) {
  try {
    const parsed = createPurchaseInvoiceSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      const tenant = await payload.findByID({
        collection: 'tenants',
        id: parsed.tenantId,
        depth: 0,
        req,
      });

      const supplier = await payload.findByID({
        collection: 'suppliers',
        id: parsed.supplierId,
        depth: 0,
        req,
      });

      if (!supplier || Number(supplier.tenant) !== Number(parsed.tenantId)) {
        throw new Error('El proveedor seleccionado no pertenece a este inquilino.');
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

      const invoiceNumber = await nextDocumentNumber(
        payload,
        'purchase-invoices',
        parsed.tenantId,
        'COMP',
        req,
      );

      const totalUSD = parsed.items.reduce(
        (acc, it) => acc + it.quantity * it.unitCostUSD,
        0,
      );
      const receiveNow = Boolean(parsed.receptionWarehouseId);

      return payload.create({
        collection: 'purchase-invoices',
        data: {
          tenant: parsed.tenantId,
          invoiceNumber,
          supplier: parsed.supplierId,
          issueDate: new Date().toISOString(),
          dueDate:
            parsed.dueDate ||
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          paymentTerms: 'credit',
          status: 'received',
          receptionStatus: receiveNow ? 'received' : 'pending',
          receptionWarehouse: parsed.receptionWarehouseId || undefined,
          receptionDate: receiveNow ? new Date().toISOString() : undefined,
          exchangeRateSnapshot: rate,
          items: parsed.items.map((it) => ({
            product: it.productId,
            sku: it.sku || undefined,
            description: it.description,
            quantity: it.quantity,
            unitCostUSD: it.unitCostUSD,
          })),
          totalUSD,
          totalVES: totalUSD * rate,
          balanceUSD: totalUSD,
          balanceVES: totalUSD * rate,
          notes: parsed.notes || undefined,
        },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/purchases`);
    revalidatePath(`/${parsed.tenantSlug}/erp/inventory`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo registrar la compra.') };
  }
}

export interface ReceivePurchaseGoodsInput {
  tenantId: number;
  tenantSlug: string;
  purchaseInvoiceId: number;
  warehouseId: number;
}

/**
 * Paso de recepción: marca `receptionStatus: received` — el hook de
 * PurchaseInvoices genera los movimientos `purchase_in` y recalcula el costo
 * ponderado dentro de esta transacción.
 */
export async function receivePurchaseGoodsAction(input: ReceivePurchaseGoodsInput) {
  try {
    const parsed = receivePurchaseGoodsSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      const invoice = await payload.findByID({
        collection: 'purchase-invoices',
        id: parsed.purchaseInvoiceId,
        depth: 0,
        req,
      });

      if (!invoice || Number(invoice.tenant) !== Number(parsed.tenantId)) {
        throw new Error('La factura de compra no pertenece a este inquilino.');
      }
      if (invoice.status === 'voided') {
        throw new Error('No se puede recepcionar una factura de compra anulada.');
      }
      if (invoice.receptionStatus === 'received') {
        throw new Error('La mercancía de esta compra ya fue recepcionada.');
      }

      const warehouse = await payload.findByID({
        collection: 'warehouses',
        id: parsed.warehouseId,
        depth: 0,
        req,
      });
      if (!warehouse || Number(warehouse.tenant) !== Number(parsed.tenantId)) {
        throw new Error('El almacén de recepción no pertenece a este inquilino.');
      }

      return payload.update({
        collection: 'purchase-invoices',
        id: invoice.id,
        data: {
          receptionStatus: 'received',
          receptionWarehouse: parsed.warehouseId,
          receptionDate: new Date().toISOString(),
        },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/purchases`);
    revalidatePath(`/${parsed.tenantSlug}/erp/inventory`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo recepcionar la compra.') };
  }
}

export interface CreateSupplierPaymentInput {
  tenantId: number;
  tenantSlug: string;
  supplierId: number;
  amountUSD: number;
  method: 'cash_usd' | 'cash_ves' | 'pos_ves' | 'pago_movil' | 'transfer_ves' | 'zelle' | 'binance';
  purchaseInvoiceId?: number;
  referenceNumber?: string;
  notes?: string;
}

/**
 * Pago a proveedor (espejo de cobranzas). Sin factura específica: imputación
 * FIFO por vencimiento sobre facturas de compra abiertas; con factura: valida
 * pertenencia y saldo. Rechaza sobrepagos. El hook de SupplierPayments aplica
 * las allocations y recalcula la deuda del proveedor en la misma transacción.
 */
export async function createSupplierPaymentAction(input: CreateSupplierPaymentInput) {
  try {
    const parsed = supplierPaymentSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
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

      let allocations: Array<{ purchaseInvoice: number; allocatedAmountUSD: number }>;

      if (parsed.purchaseInvoiceId) {
        const invoice = await payload.findByID({
          collection: 'purchase-invoices',
          id: parsed.purchaseInvoiceId,
          depth: 0,
          req,
        });

        if (!invoice || Number(invoice.tenant) !== Number(parsed.tenantId)) {
          throw new Error('La factura de compra no pertenece a este inquilino.');
        }
        if (Number(invoice.supplier) !== Number(parsed.supplierId)) {
          throw new Error('La factura de compra no pertenece al proveedor indicado.');
        }

        const balance = Number(invoice.balanceUSD) || 0;
        if (invoice.status === 'paid' || balance <= 0) {
          throw new Error('La factura de compra ya no tiene saldo pendiente.');
        }
        if (amountUSD > balance + 0.005) {
          throw new Error(
            `El monto excede el saldo pendiente de la factura (${balance.toFixed(2)} USD).`,
          );
        }

        allocations = [
          {
            purchaseInvoice: invoice.id,
            allocatedAmountUSD: Math.min(amountUSD, balance),
          },
        ];
      } else {
        const openInvoices = await payload.find({
          collection: 'purchase-invoices',
          where: {
            and: [
              { tenant: { equals: parsed.tenantId } },
              { supplier: { equals: parsed.supplierId } },
              { status: { in: ['received', 'partially_paid'] } },
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
            purchaseInvoice: inv.id,
            allocatedAmountUSD: Number(alloc.toFixed(2)),
          });
          remaining -= alloc;
        }

        if (remaining > 0.005) {
          throw new Error(
            'El monto excede la deuda abierta del proveedor: no hay facturas suficientes para imputar el sobrante.',
          );
        }
      }

      const paymentNumber = await nextDocumentNumber(
        payload,
        'supplier-payments',
        parsed.tenantId,
        'PAG',
        req,
      );

      return payload.create({
        collection: 'supplier-payments',
        data: {
          tenant: parsed.tenantId,
          paymentNumber,
          supplier: parsed.supplierId,
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

    revalidatePath(`/${parsed.tenantSlug}/erp/purchases`);
    revalidatePath(`/${parsed.tenantSlug}/erp/suppliers`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return {
      success: false,
      error: toSafeActionError(error, 'No se pudo registrar el pago al proveedor.'),
    };
  }
}

export interface UpdateCustomerInput {
  tenantId: number;
  tenantSlug: string;
  customerId: number;
  name: string;
  taxId: string;
  phone: string;
  email?: string;
  address?: string;
  status?: 'lead' | 'first_time' | 'recurring' | 'vip' | 'inactive';
  creditAllowed?: boolean;
  creditLimitUSD?: number;
  creditDays?: number;
  priceTier?: 'retail' | 'wholesale' | 'vendor' | 'promo';
}

export async function updateCustomerAction(input: UpdateCustomerInput) {
  try {
    const parsed = updateCustomerSchema.parse(input);
    await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const doc = await payload.update({
      collection: 'customers',
      id: parsed.customerId,
      data: {
        name: parsed.name,
        taxId: parsed.taxId,
        phone: parsed.phone,
        email: parsed.email || undefined,
        address: parsed.address || undefined,
        status: parsed.status || 'first_time',
        creditAllowed: parsed.creditAllowed ?? false,
        creditLimitUSD: parsed.creditLimitUSD ?? 0,
        creditDays: parsed.creditDays ?? 0,
        ...(parsed.priceTier ? { priceTier: parsed.priceTier } : {}),
      },
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/customers`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo actualizar el cliente.') };
  }
}

export interface UpdateProductInput {
  tenantId: number;
  tenantSlug: string;
  productId: number;
  name: string;
  sku: string;
  productType: 'standard' | 'raw_material' | 'manufactured' | 'service';
  unitOfMeasure: 'unit' | 'kg' | 'g' | 'l' | 'ml' | 'm' | 'box';
  costUSD: number;
  priceUSD: number;
  taxRate?: 'exempt' | 'general' | 'reduced';
  minStockAlert?: number;
  priceTiers?: Array<{ tier: 'wholesale' | 'vendor' | 'promo'; priceUSD: number }>;
}

export async function updateProductAction(input: UpdateProductInput) {
  try {
    const parsed = updateProductSchema.parse(input);
    await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    // El cambio de priceUSD escribe price-history automáticamente (pricingPlugin).
    // priceTiers: si llega undefined no se toca; si llega, reemplaza completo.
    const doc = await payload.update({
      collection: 'products',
      id: parsed.productId,
      data: {
        name: parsed.name,
        sku: parsed.sku,
        productType: parsed.productType,
        unitOfMeasure: parsed.unitOfMeasure,
        costUSD: parsed.costUSD,
        priceUSD: parsed.priceUSD,
        taxRate: parsed.taxRate || 'exempt',
        minStockAlert: parsed.minStockAlert ?? 0,
        ...(parsed.priceTiers !== undefined ? { priceTiers: parsed.priceTiers } : {}),
      },
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/inventory`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo actualizar el producto.') };
  }
}

export interface UpdateQuoteInput {
  tenantId: number;
  tenantSlug: string;
  quoteId: number;
  customerId: number;
  items: Array<{
    productId?: number;
    sku?: string;
    description: string;
    quantity: number;
    unitPriceUSD: number;
  }>;
  validUntil?: string;
  notes?: string;
}

export async function updateQuoteAction(input: UpdateQuoteInput) {
  try {
    const parsed = updateQuoteSchema.parse(input);
    await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const quote = await payload.findByID({
      collection: 'quotes',
      id: parsed.quoteId,
      depth: 0,
    });

    if (!quote || Number(quote.tenant) !== Number(parsed.tenantId)) {
      return { success: false, error: 'La cotización no pertenece a este inquilino.' };
    }
    if (quote.status !== 'draft' && quote.status !== 'sent') {
      return {
        success: false,
        error: 'Solo las cotizaciones en borrador o enviadas pueden editarse.',
      };
    }

    const doc = await payload.update({
      collection: 'quotes',
      id: quote.id,
      data: {
        customer: parsed.customerId,
        items: parsed.items.map((it) => ({
          product: it.productId || undefined,
          sku: it.sku || undefined,
          description: it.description,
          quantity: it.quantity,
          unitPriceUSD: it.unitPriceUSD,
        })),
        validUntil: parsed.validUntil || undefined,
        notes: parsed.notes || undefined,
      },
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/quotes`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo actualizar la cotización.') };
  }
}

// ==========================================
// 5. CAJAS REGISTRADORAS & ARQUEOS CIEGOS
// ==========================================// ==========================================
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
    await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
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

export interface OpenCashShiftInput {
  tenantId: number;
  tenantSlug: string;
  cashRegisterId: number;
  openingFloatUSD: number;
  openingFloatVES: number;
  notes?: string;
}

/**
 * Abre el turno de una caja registradora con su fondo de apertura (arqueo inicial).
 * Valida pertenencia al inquilino, caja activa y ausencia de turno abierto previo
 * (assertNoOpenShiftForRegister). El hook afterChange de CashClosures sincroniza
 * el estado operativo de la caja (open + currentClosureId) atómicamente.
 */
export async function openCashShiftAction(input: OpenCashShiftInput) {
  try {
    const parsed = openCashShiftSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      const register = await payload.findByID({
        collection: 'cash-registers',
        id: parsed.cashRegisterId,
        depth: 0,
        req,
      });

      if (!register || Number(register.tenant) !== Number(parsed.tenantId)) {
        throw new Error('La caja registradora no pertenece a este inquilino.');
      }
      if (!register.active) {
        throw new Error('La caja registradora está inactiva y no puede abrir turno.');
      }

      await assertNoOpenShiftForRegister({ cashRegisterId: register.id, req });

      const closureNumber = await nextDocumentNumber(
        payload,
        'cash-closures',
        parsed.tenantId,
        'CIERRE',
        req,
      );

      return payload.create({
        collection: 'cash-closures',
        data: {
          tenant: parsed.tenantId,
          closureNumber,
          cashRegister: register.id,
          openedBy: user.id,
          openedAt: new Date().toISOString(),
          status: 'open',
          openingFloat: {
            cashUSD: parsed.openingFloatUSD,
            cashVES: parsed.openingFloatVES,
            notes: parsed.notes || undefined,
          },
        },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/cash-registers`);
    revalidatePath(`/${parsed.tenantSlug}/erp/pos`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return {
      success: false,
      error: toSafeActionError(error, 'No se pudo abrir el turno de caja.'),
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
    const user = await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
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
    await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
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
    await requireErpTenantAccess(parsed.tenantId, ['super-admin', 'tenant-admin']);
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
