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
import { prepareDocumentEmail } from './shareActions';
import { after } from 'next/server';
import { computeInvoiceTax, computeIgtfUSD } from '../utilities/tax';
import type { CatalogTaxRate } from '../utilities/tax';
import { evaluateCreditSale } from '../utilities/credit';
import { approvalExpiry, consumeApproval, isApprovalExpired } from '../utilities/approvals';
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
  approveApprovalSchema,
  rejectApprovalSchema,
  createPurchaseInvoiceSchema,
  createQuoteSchema,
  createSaleReturnSchema,
  createSupplierSchema,
  createTenantSchema,
  ensureWalkInCustomerSchema,
  executeProductionSchema,
  firstZodMessage,
  inviteUserSchema,
  importStockSchema,
  receivePurchaseGoodsSchema,
  completeInventoryCountSchema,
  createInventoryCountSchema,
  openCashShiftSchema,
  saveCountedItemsSchema,
  transferStockSchema,
  supplierPaymentSchema,
  createOrderSchema,
  issueDeliveryNoteSchema,
  issueOrderInvoiceSchema,
  alertActionSchema,
  orderTransitionSchema,
  updateCustomerSchema,
  voidDeliveryNoteSchema,
  updateOrderSchema,
  updateProductSchema,
  updateQuoteSchema,
  voidInvoiceSchema,
  updateQuoteStatusSchema,
  updateTenantSettingsSchema,
} from '@/utilities/erpValidation';
import {
  importStockToWarehouse,
  planStockImport,
} from '@/utilities/inventoryImport';
import {
  completeInventoryCount,
  lockInventoryCount,
  snapshotWarehouseStock,
} from '@/utilities/inventoryCounts';
import { returnSaleLines } from '@/utilities/salesLedger';
import { withTransaction } from '@/utilities/withTransaction';
import { nextDocumentNumber } from '@/utilities/documentNumbering';

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

/** Roles con permiso de crear/actualizar catálogos y operaciones restringidas (RBAC de colecciones). */
const ERP_OPERATOR_ROLES: Array<User['role']> = ['super-admin', 'tenant-admin', 'supervisor'];

/** Prefijo `alt` con el que uploadReceiptAction marca los comprobantes de cobro;
 *  deleteOrphanReceiptAction sólo borra media con esta marca. */
const RECEIPT_ALT_PREFIX = 'Comprobante de pago';

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
/**
 * Dry-run read-only de la carga masiva (IE-PR7): corre el planeador completo
 * (validaciones + stock vigente por SKU) SIN locks NI escrituras. El wizard lo
 * usa en el paso 3; el commit real (importStockAction) recalcula el plan en el
 * momento, así que el resultado aplicado siempre refleja el stock al confirmar.
 */
export async function previewStockImportAction(input: ImportStockInput) {
  try {
    const parsed = importStockSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
    const payload = await getPayload({ config });

    const plan = await withTransaction(payload, user, (req) =>
      planStockImport({
        tenantId: parsed.tenantId,
        warehouseId: parsed.warehouseId,
        mode: parsed.mode,
        rows: parsed.rows,
        req,
      }),
    );

    return { success: true as const, data: plan };
  } catch (error: unknown) {
    return {
      success: false as const,
      error: toSafeActionError(error, 'No se pudo previsualizar la importación.'),
    };
  }
}

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
  installmentsCount?: number;
  items: InvoiceItemInput[];
  notes?: string;
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
    // Redondeo canónico por línea (Devin #81 🟡): DEBE coincidir con
    // beforeValidateInvoice — el chequeo de crédito y el balance se derivan de
    // esta representación, no de la suma cruda (200 × $0.005 = $1 crudo pero
    // $2 persistido con líneas redondeadas al centavo).
    const totalItem = Number((it.quantity * it.unitPriceUSD).toFixed(2));
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

  const totalUSD = Number(subtotalUSD.toFixed(2));

  // Desglose fiscal (Sprint 42): el IVA se clasifica por el `taxRate` del
  // producto del catálogo (exempt/reduced/general — la alícuota general es
  // configurable por inquilino). Informativo para el libro fiscal: totalUSD
  // conserva su semántica (suma de líneas) y no incluye impuesto.
  const productIds = [...new Set(parsed.items.map((it) => it.productId).filter(Boolean))] as number[];
  const taxRateByProduct = new Map<number, CatalogTaxRate>();
  if (productIds.length > 0) {
    const catalogRes = await payload.find({
      collection: 'products',
      where: { id: { in: productIds } },
      depth: 0,
      limit: 1000,
      pagination: false,
      select: { taxRate: true },
      req,
    });
    for (const prod of catalogRes.docs) {
      taxRateByProduct.set(prod.id, prod.taxRate as CatalogTaxRate);
    }
  }
  const generalRatePct = Number(tenant?.taxConfig?.generalRatePct ?? 16);
  const taxBreakdown = computeInvoiceTax(
    formattedItems.map((it) => ({
      totalUSD: it.totalUSD,
      taxRate: it.product ? taxRateByProduct.get(it.product) : 'exempt',
    })),
    generalRatePct,
  );
  const totalVES = totalUSD * rate;
  const isCash = parsed.paymentTerms === 'cash';

  // Venta a crédito (IE-PR6 + Devin #81/#83): tres caminos en el punto del límite.
  // 1. req.context.approvalId presente → la solicitud ya fue autorizada: se
  //    CONSUME atómicamente (single-use, atada a tenant + input) y la venta
  //    continúa; el resto de las validaciones (stock, precios, kardex) corren igual.
  // 2. Sin approval y dentro del límite → sigue el flujo normal.
  // 3. Sin approval y SOBRE el límite (limit_exceeded) → NO se rechaza: se crea
  //    la solicitud pendiente con workflow/origen + input parseado y se devuelve
  //    el marcador pending_approval. Crédito DESHABILITADO (credit_disabled) es
  //    rechazo duro: una aprobación nunca autoriza lo que el admin deshabilitó
  //    explícitamente (Devin #83).
  if (!isCash) {
    // Devin #83 2ª ronda 🔴: el lock + re-lectura aplican a AMBOS caminos — la
    // aprobación excusa SOLO limit_exceeded; creditAllowed=false sigue siendo
    // rechazo duro aunque exista una solicitud aprobada (el admin puede
    // deshabilitar el crédito durante la ventana de 24 h de la solicitud).
    const db = getActiveDb(req);
    await db.execute(sql`SELECT id FROM customers WHERE id = ${parsed.customerId} FOR UPDATE`);
    const fresh = await payload.findByID({
      collection: 'customers',
      id: parsed.customerId,
      depth: 0,
      req,
    });
    if (fresh.creditAllowed === false) {
      throw new Error(
        `El cliente "${fresh.name}" no tiene crédito habilitado. Registre la venta de contado o habilite su línea de crédito.`,
      );
    }
    const approvalId = (req.context as { approvalId?: number } | undefined)?.approvalId;
    if (approvalId) {
      // Puerta de aprobación: consume atómicamente validando que la aprobación
      // corresponda EXACTAMENTE a esta operación (inquilino + input).
      await consumeApproval(req, approvalId, { tenantId: parsed.tenantId, input: parsed });
    } else {
      const creditCheck = evaluateCreditSale({
        creditAllowed: fresh.creditAllowed,
        creditLimitUSD: fresh.creditLimitUSD,
        currentDebtUSD: fresh.currentDebtUSD,
        totalUSD,
        customerName: fresh.name,
      });
      if (!creditCheck.ok) {
        if (creditCheck.code !== 'limit_exceeded') {
          throw new Error(creditCheck.reason);
        }
        const ctx = req.context as {
          approvalWorkflow?: 'direct' | 'quote' | 'order';
          approvalSourceId?: number;
        } | undefined;
        const workflow = ctx?.approvalWorkflow ?? 'direct';
        const sourceId = ctx?.approvalSourceId ?? null;
        const approval = await req.payload.create({
          collection: 'approvals',
          data: {
            tenant: parsed.tenantId,
            type: 'credit_over_limit',
            status: 'pending',
            requestedBy: user.id,
            refCollection: 'customers',
            refId: parsed.customerId,
            payload: { workflow, sourceId, input: parsed },
            expiresAt: approvalExpiry(),
          },
          req,
          overrideAccess: true,
        });
        return {
          pendingApproval: true as const,
          approvalId: approval.id as number,
          workflow,
        };
      }
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
  //
  // EXCEPCIÓN (Devin #52): venta de CORTESÍA TOTAL (totalUSD === 0) — el recibo
  // automático es imposible (CustomerPayments exige montos positivos), así que
  // la factura nace directamente pagada con saldo cero y sin recibo.
  const isFullCourtesy = totalUSD === 0;
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
      status: isFullCourtesy ? 'paid' : 'issued',
      warehouse: parsed.warehouseId || undefined,
      exchangeRateSnapshot: rate,
      items: formattedItems,
      totalUSD,
      totalVES,
      taxBaseUSD: taxBreakdown.taxBaseUSD,
      taxUSD: taxBreakdown.taxUSD,
      balanceUSD: isFullCourtesy ? 0 : totalUSD,
      balanceVES: isFullCourtesy ? 0 : totalVES,
      notes: parsed.notes || undefined,
    },
    req,
  });

  // Plan de cuotas para ventas a crédito: N cuotas iguales, la primera vence a
  // creditDays y las siguientes cada 30 días (el ajuste de redondeo va a la última).
  // Cortesía total: sin cuotas (serían todas de $0).
  if (!isCash && !isFullCourtesy) {
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

  if (!isCash || !parsed.cashMethod || isFullCourtesy) {
    // Cortesía total: sin recibo automático — CustomerPayments exige montos
    // positivos y la factura ya nació pagada con saldo cero (Devin #52).
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

  // IGTF del recibo automático (Devin #58): mismo snapshot que createPaymentAction.
  const receiptIgtfUSD = computeIgtfUSD(
    totalUSD,
    parsed.cashMethod || 'cash_usd',
    Number(tenant?.taxConfig?.igtfPct ?? 3),
    tenant?.taxConfig?.applyIgtfOnFxPayments !== false,
  );

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
      igtfUSD: receiptIgtfUSD,
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

/**
 * Auto-envío de factura (Sprint 43.3): si el inquilino tiene activado el
 * envío automático y el cliente tiene email, programa el envío del enlace
 * público en after() de Next. Jamás revierte la emisión: cualquier fallo del
 * correo queda registrado y la factura ya existe.
 *
 * Usado por TODOS los puntos de emisión (creación directa, conversión de
 * cotización y facturación desde pedido) — hallazgo Devin #66.
 */
async function maybeAutoSendInvoice(
  payload: Payload,
  tenantId: number,
  customerRef: number,
  invoice: { id: number; status: string; totalUSD: number },
): Promise<void> {
  try {
    // Borradores y cortesías totales no se envían (no son documento final).
    if (invoice.status === 'draft' || Number(invoice.totalUSD) <= 0 || !invoice.id) return;

    const [tenantDoc, customerDoc] = await Promise.all([
      payload.findByID({ collection: 'tenants', id: tenantId, depth: 0 }),
      payload.findByID({ collection: 'customers', id: customerRef, depth: 0 }),
    ]);
    const email = customerDoc?.email || '';
    if (!(tenantDoc?.emailConfig?.autoSendInvoiceEmail ?? false) || !email) return;

    const prepared = await prepareDocumentEmail('invoices', tenantId, invoice.id, email);
    await after(prepared.send);
  } catch {
    // La factura YA fue emitida: un fallo del email no convierte el éxito en error.
  }
}

export async function createInvoiceAction(input: CreateInvoiceInput) {
  try {
    const parsed = createInvoiceSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const result = await withTransaction(payload, user, (req) =>
      createInvoiceCore(payload, user, parsed, req),
    );

    if ('pendingApproval' in result) {
      // IE-PR6: la venta excedió el límite de crédito — quedó como solicitud
      // pendiente de autorización. No hay factura ni auto-envío.
      revalidatePath(`/${parsed.tenantSlug}/erp/approvals`);
      return {
        success: true,
        status: 'pending_approval' as const,
        approvalId: result.approvalId,
      };
    }

    const doc = result;

    // Auto-envío de factura (Sprint 43.3): enlace público por email al
    // emitirla, si el inquilino lo tiene activo y el cliente tiene email.
    // Resuelve token/HTML DENTRO del request; el envío corre en after().
    // Borradores y cortesías totales no se envían (no son documento final).
    await maybeAutoSendInvoice(payload, parsed.tenantId, parsed.customerId, {
      id: doc.id,
      status: doc.status,
      totalUSD: Number(doc.totalUSD) || 0,
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
// 3a-bis. APROBACIONES (IE-PR6) — venta a crédito sobre el límite
// ==========================================
export interface ApproveApprovalInput {
  tenantId: number;
  tenantSlug: string;
  approvalId: number;
  decisionNote?: string;
}

/** Sólo estos roles autorizan o rechazan solicitudes (super-admin incluido). */
const APPROVAL_RESOLVER_ROLES: Array<User['role']> = [
  'super-admin',
  'tenant-admin',
  'supervisor',
];

export async function approveApprovalAction(input: ApproveApprovalInput) {
  try {
    const parsed = approveApprovalSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, APPROVAL_RESOLVER_ROLES);
    const payload = await getPayload({ config });

    const approval = await payload.findByID({
      collection: 'approvals',
      id: parsed.approvalId,
      depth: 0,
    });
    if (!approval || Number(approval.tenant) !== parsed.tenantId) {
      throw new Error('La aprobación no pertenece a este inquilino.');
    }
    if (approval.status === 'consumed') {
      throw new Error('La aprobación ya fue consumida por una venta exitosa.');
    }
    if (approval.status === 'rejected') {
      throw new Error('La aprobación fue rechazada: el vendedor debe solicitar una nueva.');
    }
    if (isApprovalExpired(approval.expiresAt)) {
      await payload.update({
        collection: 'approvals',
        id: approval.id,
        data: { status: 'expired' },
        overrideAccess: true,
      });
      throw new Error('La aprobación expiró (24 h): el vendedor debe solicitar una nueva.');
    }

    // Firma de la decisión. Un reintento tras un fallo de re-ejecución llega
    // con status 'approved' y re-intenta la venta directamente.
    if (approval.status === 'pending') {
      await payload.update({
        collection: 'approvals',
        id: approval.id,
        data: {
          status: 'approved',
          resolvedBy: user.id,
          decisionNote: parsed.decisionNote || undefined,
        },
        overrideAccess: true,
      });
    }

    // Input guardado con su workflow y origen (Devin #83 🔴: la aprobación ya
    // no es un input genérico — sabe QUÉ flujo debe re-ejecutarse y qué
    // documento origen cerrar para que no quede facturable por duplicado).
    const stored = (approval.payload ?? {}) as {
      workflow?: 'direct' | 'quote' | 'order';
      sourceId?: number | null;
      input?: Record<string, unknown>;
    };
    const invoiceParsed = createInvoiceSchema.parse(stored.input ?? approval.payload);
    // Devin #83 🟥 (tenant): el replay SIEMPRE corre en el inquilino de la
    // aprobación — el input guardado no puede nombrar otro inquilino. El
    // chequeo de pertenencia del cliente lo revalida createInvoiceCore.
    invoiceParsed.tenantId = parsed.tenantId;

    const workflow = stored.workflow ?? 'direct';
    const sourceId = stored.sourceId ?? null;

    // Re-ejecución con el input guardado: createInvoiceCore revalida TODO
    // (stock, precios, kardex, cliente) de forma natural. El consumo es
    // transaccional: sólo queda consumed si la venta completa tuvo éxito.
    const result = await withTransaction(
      payload,
      user,
      async (req) => {
        // Devin #83 2ª ronda 🔴: lock + re-lectura del origen ANTES de facturar
        // — la facturación normal y el replay serializan sobre el mismo
        // documento y un origen cerrado aborta la transacción completa (el
        // consumo de la aprobación revierte con ella).
        if (workflow === 'order' && sourceId) {
          await lockOrderRow(sourceId, req);
        } else if (workflow === 'quote' && sourceId) {
          const db = getActiveDb(req);
          await db.execute(sql`SELECT id FROM quotes WHERE id = ${sourceId} FOR UPDATE`);
        }
        if (workflow === 'order' && sourceId) {
          const order = await payload.findByID({
            collection: 'orders',
            id: sourceId,
            depth: 0,
            req,
          });
          if (!order || Number(order.tenant) !== parsed.tenantId) {
            throw new Error('El pedido de la aprobación no pertenece a este inquilino.');
          }
          if (order.status === 'invoiced' || order.status === 'canceled') {
            throw new Error(`El pedido ${order.orderNumber} ya fue facturado o cancelado.`);
          }
        } else if (workflow === 'quote' && sourceId) {
          const quote = await payload.findByID({
            collection: 'quotes',
            id: sourceId,
            depth: 0,
            req,
          });
          if (!quote || Number(quote.tenant) !== parsed.tenantId) {
            throw new Error('La cotización de la aprobación no pertenece a este inquilino.');
          }
          // Devin #83 3ª ronda: MISMOS estados terminales que la conversión
          // normal — una cotización rechazada/expirada tras la solicitud no se
          // factura por la puerta de la aprobación.
          if (
            quote.status === 'converted' ||
            quote.status === 'rejected' ||
            quote.status === 'expired'
          ) {
            throw new Error(
              `No se puede convertir la cotización ${quote.quoteNumber} en estado "${quote.status}".`,
            );
          }
        }

        const doc = await createInvoiceCore(payload, user, invoiceParsed, req);
        if ('pendingApproval' in doc) {
          throw new Error(
            'La venta re-ejecutada volvió a requerir aprobación (input inconsistente).',
          );
        }
        // Cierre del origen: seguro bajo el lock adquirido arriba.
        if (workflow === 'order' && sourceId) {
          await payload.update({
            collection: 'orders',
            id: sourceId,
            data: { status: 'invoiced', issuedInvoice: doc.id },
            req,
          });
        } else if (workflow === 'quote' && sourceId) {
          await payload.update({
            collection: 'quotes',
            id: sourceId,
            data: { status: 'converted', convertedInvoice: doc.id },
            req,
          });
        }
        return doc;
      },
      { approvalId: approval.id },
    );

    // Auto-envío (Devin #83 🟡): la venta aprobada es idéntica a una venta
    // directa — el cliente con auto-envío configurado recibe SU email.
    await maybeAutoSendInvoice(payload, parsed.tenantId, invoiceParsed.customerId, {
      id: result.id,
      status: result.status,
      totalUSD: Number(result.totalUSD) || 0,
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/approvals`);
    revalidatePath(`/${parsed.tenantSlug}/erp/invoices`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return {
      success: true,
      data: { invoiceId: result.id, invoiceNumber: result.invoiceNumber },
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: toSafeActionError(error, 'No se pudo aprobar la solicitud.'),
    };
  }
}

export async function rejectApprovalAction(input: ApproveApprovalInput) {
  try {
    const parsed = rejectApprovalSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, APPROVAL_RESOLVER_ROLES);
    const payload = await getPayload({ config });

    const approval = await payload.findByID({
      collection: 'approvals',
      id: parsed.approvalId,
      depth: 0,
    });
    if (!approval || Number(approval.tenant) !== parsed.tenantId) {
      throw new Error('La aprobación no pertenece a este inquilino.');
    }
    // Devin #84 🟥: las decisiones firmadas son INMUTABLES — sólo una
    // solicitud pendiente puede rechazarse (reemplazar la decisión de otro
    // resolver corrompería la identidad de auditoría).
    if (approval.status !== 'pending') {
      throw new Error(
        `La aprobación #${approval.id} ya fue resuelta (estado: ${approval.status}) — su decisión no se reescribe.`,
      );
    }

    // Devin #84 🟡: el rechazo es transaccional con advisory lock
    // approval:{id} (mismo patrón que consumeApproval) — dos rechazos
    // concurrentes serializan y el segundo ve el estado YA resuelto.
    await withTransaction(payload, user, async (req) => {
      const db = getActiveDb(req);
      await db.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`approval:${parsed.approvalId}`}))`,
      );
      // Re-lectura POST-lock: el estado puede haber cambiado desde el check
      // previo (otro resolver ganó la carrera).
      const fresh = await payload.findByID({
        collection: 'approvals',
        id: parsed.approvalId,
        depth: 0,
        req,
      });
      if (!fresh || Number(fresh.tenant) !== parsed.tenantId) {
        throw new Error('La aprobación no pertenece a este inquilino.');
      }
      if (fresh.status !== 'pending') {
        throw new Error(
          `La aprobación #${fresh.id} ya fue resuelta (estado: ${fresh.status}) — su decisión no se reescribe.`,
        );
      }
      await payload.update({
        collection: 'approvals',
        id: fresh.id,
        data: {
          status: 'rejected',
          resolvedBy: user.id,
          decisionNote: parsed.decisionNote,
        },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/approvals`);

    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: toSafeActionError(error, 'No se pudo rechazar la solicitud.'),
    };
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

    // Auto-envío (Sprint 43): presupuesto al correo del cliente vía Resend,
    // fuera del camino crítico (after() de Next). Sólo si el inquilino lo
    // tiene activo y el cliente tiene email registrado.
    const tenantFresh = await payload.findByID({
      collection: 'tenants',
      id: parsed.tenantId,
      depth: 0,
    });
    const customerFresh = await payload.findByID({
      collection: 'customers',
      id: parsed.customerId,
      depth: 0,
    });
    const customerEmail = customerFresh?.email || '';
    if (
      (tenantFresh?.emailConfig?.autoSendQuoteEmail ?? true) &&
      customerEmail &&
      doc?.id
    ) {
      try {
        const prepared = await prepareDocumentEmail('quotes', parsed.tenantId, doc.id, customerEmail);
        await after(prepared.send);
      } catch {
        // El presupuesto YA fue creado: un fallo del email no convierte el éxito en error.
      }
    }

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
      // IE-PR6: si la conversión requiere aprobación, la solicitud guarda el
      // workflow y el origen para que el replay cierre ESTA cotización.
      req.context.approvalWorkflow = 'quote';
      req.context.approvalSourceId = parsed.quoteId;
      // Devin #83 2ª ronda: lock de fila — serializa con el replay de una
      // aprobación sobre la misma cotización (sin factura duplicada).
      const db = getActiveDb(req);
      await db.execute(sql`SELECT id FROM quotes WHERE id = ${parsed.quoteId} FOR UPDATE`);
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

      if ('pendingApproval' in invoice) {
        // IE-PR6: la conversión excede el límite — la cotización NO se marca
        // converted (no hay factura) y la solicitud queda activa.
        return { pendingApproval: true as const, approvalId: invoice.approvalId };
      }

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

    if ('pendingApproval' in doc) {
      revalidatePath(`/${parsed.tenantSlug}/erp/approvals`);
      return {
        success: true,
        status: 'pending_approval' as const,
        approvalId: doc.approvalId,
      };
    }

    revalidatePath(`/${parsed.tenantSlug}/erp/quotes`);
    await maybeAutoSendInvoice(payload, parsed.tenantId, Number(doc.customer), {
      id: doc.id,
      status: doc.status,
      totalUSD: Number(doc.totalUSD) || 0,
    });
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
// 3b. PEDIDOS DE VENTA (ORDERS) — Sprint 19
// ==========================================
export interface CreateOrderInput {
  tenantId: number;
  tenantSlug: string;
  customerId: number;
  items: Array<{
    productId?: number;
    sku?: string;
    description: string;
    quantity: number;
    unitPriceUSD: number;
    discountPct?: number;
  }>;
  notes?: string | null;
}

/** Validación compartida de referencias de un pedido (cliente + productos). */
async function assertOrderRefsInTenant(
  payload: Payload,
  tenantId: number,
  customerId: number,
  items: CreateOrderInput['items'],
  req: PayloadRequest,
): Promise<void> {
  const customer = await payload.findByID({
    collection: 'customers',
    id: customerId,
    depth: 0,
    req,
  });
  if (!customer || Number(customer.tenant) !== Number(tenantId)) {
    throw new Error('El cliente indicado no pertenece a este inquilino.');
  }
  for (const it of items) {
    if (!it.productId) continue;
    const product = await payload.findByID({
      collection: 'products',
      id: it.productId,
      depth: 0,
      req,
    });
    if (!product || Number(product.tenant) !== Number(tenantId)) {
      throw new Error(
        `Un producto de las líneas no pertenece a este inquilino (${it.sku || it.productId}).`,
      );
    }
  }
}

/**
 * Crea un pedido en borrador. El snapshot de tasa lo fija aquí (config del
 * inquilino); los precios de línea llegan resueltos por tier desde el cliente.
 * El pedido NO toca kardex — el stock se descarga al facturar.
 */
/** Lock de fila sobre el pedido: serializa TODAS las transiciones de estado
 *  (confirmar, cancelar, facturar, editar) — dos requests concurrentes no
 *  pueden leer el mismo estado y aplicar transiciones duplicadas. */
async function lockOrderRow(orderId: number, req: PayloadRequest): Promise<void> {
  const db = getActiveDb(req);
  await db.execute(sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`);
}

export async function createOrderAction(input: CreateOrderInput) {
  try {
    const parsed = createOrderSchema.parse(input);
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

      await assertOrderRefsInTenant(payload, parsed.tenantId, parsed.customerId, parsed.items, req);

      const customer = await payload.findByID({
        collection: 'customers',
        id: parsed.customerId,
        depth: 0,
        req,
      });

      const orderNumber = await nextDocumentNumber(payload, 'orders', parsed.tenantId, 'PED', req);

      return payload.create({
        collection: 'orders',
        data: {
          tenant: parsed.tenantId,
          orderNumber,
          customer: parsed.customerId,
          priceTierSnapshot: (customer.priceTier as 'retail') || 'retail',
          items: parsed.items.map((it) => ({
            product: it.productId || undefined,
            sku: it.sku || undefined,
            description: it.description,
            quantity: it.quantity,
            unitPriceUSD: it.unitPriceUSD,
            discountPct: it.discountPct || 0,
          })),
          status: 'draft',
          exchangeRateSnapshot: rateResult.rate,
          notes: parsed.notes || undefined,
        },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/orders`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo crear el pedido.') };
  }
}

/** Actualiza un pedido en borrador (referencias revalidadas por inquilino). */
export async function updateOrderAction(input: CreateOrderInput & { orderId: number }) {
  try {
    const parsed = updateOrderSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      // Mismo lock de fila que las demás transiciones: una edición no puede
      // leer 'draft' mientras otra transacción confirma el mismo pedido.
      await lockOrderRow(parsed.orderId, req);
      const order = await payload.findByID({
        collection: 'orders',
        id: parsed.orderId,
        depth: 0,
        req,
      });
      if (!order || Number(order.tenant) !== Number(parsed.tenantId)) {
        throw new Error('El pedido no pertenece a este inquilino.');
      }
      if (order.status !== 'draft') {
        throw new Error('Solo los pedidos en borrador pueden editarse.');
      }

      await assertOrderRefsInTenant(payload, parsed.tenantId, parsed.customerId, parsed.items, req);

      return payload.update({
        collection: 'orders',
        id: order.id,
        data: {
          customer: parsed.customerId,
          items: parsed.items.map((it) => ({
            product: it.productId || undefined,
            sku: it.sku || undefined,
            description: it.description,
            quantity: it.quantity,
            unitPriceUSD: it.unitPriceUSD,
            discountPct: it.discountPct || 0,
          })),
          notes: parsed.notes,
        },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/orders`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo actualizar el pedido.') };
  }
}

/** Confirma un pedido en borrador: queda pendiente de despacho/facturación. */
export async function confirmOrderAction(input: { tenantId: number; tenantSlug: string; orderId: number }) {
  try {
    const parsed = orderTransitionSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      await lockOrderRow(parsed.orderId, req);
      const order = await payload.findByID({
        collection: 'orders',
        id: parsed.orderId,
        depth: 0,
        req,
      });
      if (!order || Number(order.tenant) !== Number(parsed.tenantId)) {
        throw new Error('El pedido no pertenece a este inquilino.');
      }
      if (order.status !== 'draft') {
        throw new Error(`No se puede confirmar un pedido en estado "${order.status}".`);
      }

      return payload.update({
        collection: 'orders',
        id: order.id,
        data: {
          status: 'confirmed',
          confirmedAt: new Date().toISOString(),
        },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/orders`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo confirmar el pedido.') };
  }
}

/** Cancela un pedido (borrador o confirmado): estado final. Sólo administradores. */
export async function cancelOrderAction(input: { tenantId: number; tenantSlug: string; orderId: number }) {
  try {
    const parsed = orderTransitionSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, [
      'super-admin',
      'tenant-admin',
    ]);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      await lockOrderRow(parsed.orderId, req);
      const order = await payload.findByID({
        collection: 'orders',
        id: parsed.orderId,
        depth: 0,
        req,
      });
      if (!order || Number(order.tenant) !== Number(parsed.tenantId)) {
        throw new Error('El pedido no pertenece a este inquilino.');
      }
      if (order.status === 'invoiced' || order.status === 'canceled') {
        throw new Error(`Un pedido "${order.status}" es final y no puede cancelarse.`);
      }

      // Mercancía ya despachada: no se puede cancelar hasta anular las remisiones
      const issuedNotes = await payload.find({
        collection: 'delivery-notes',
        where: {
          and: [
            { order: { equals: order.id } },
            { status: { equals: 'issued' } },
          ],
        },
        limit: 1,
        depth: 0,
        req,
      });
      if (issuedNotes.totalDocs > 0) {
        throw new Error(
          'El pedido tiene remisiones de entrega emitidas: anúlelas antes de cancelarlo.',
        );
      }

      return payload.update({
        collection: 'orders',
        id: order.id,
        data: {
          status: 'canceled',
        },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/orders`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo cancelar el pedido.') };
  }
}

/**
 * Factura un pedido confirmado: reutiliza createInvoiceCore (numeración,
 * snapshot de tasa, validación de crédito, recibo de contado y descarga de
 * kardex vía el plugin de ventas) y marca el pedido como `invoiced` con el
 * vínculo a la factura. Todo en UNA transacción; doble facturación imposible
 * (el estado se verifica bajo lock transaccional y `invoiced` es inmutable).
 */
export async function issueInvoiceFromOrderAction(input: {
  tenantId: number;
  tenantSlug: string;
  orderId: number;
  paymentTerms?: 'cash' | 'credit';
  cashMethod?: 'cash_usd' | 'cash_ves' | 'pos_ves' | 'pago_movil' | 'transfer_ves' | 'zelle' | 'binance';
  cashRegisterId?: number;
  warehouseId?: number;
}) {
  try {
    const parsed = issueOrderInvoiceSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      // IE-PR6: si la facturación requiere aprobación, la solicitud guarda el
      // workflow y el origen para que el replay cierre ESTE pedido.
      req.context.approvalWorkflow = 'order';
      req.context.approvalSourceId = parsed.orderId;
      // Lock de fila: serializa facturaciones concurrentes — el segundo request
      // lee el estado YA facturado y aborta (doble facturación imposible).
      await lockOrderRow(parsed.orderId, req);
      const order = await payload.findByID({
        collection: 'orders',
        id: parsed.orderId,
        depth: 0,
        req,
      });

      if (!order || Number(order.tenant) !== Number(parsed.tenantId)) {
        throw new Error('El pedido no pertenece a este inquilino.');
      }
      if (order.status === 'invoiced') {
        throw new Error('El pedido ya fue facturado.');
      }
      if (order.status === 'canceled') {
        throw new Error('No se puede facturar un pedido cancelado.');
      }
      if (order.status !== 'confirmed') {
        throw new Error(`Confirma el pedido antes de facturar (estado actual: "${order.status}").`);
      }
      // Sin término explícito se usa CONTADO: facturar una entrega no crea
      // crédito implícito (Devin #57/#58 — el caller ya no fuerza crédito).
      const effectivePaymentTerms = parsed.paymentTerms || 'cash';

      const invoiceParsed = createInvoiceSchema.parse({
        tenantId: parsed.tenantId,
        tenantSlug: parsed.tenantSlug,
        customerId: order.customer,
        paymentTerms: effectivePaymentTerms,
        cashMethod: effectivePaymentTerms === 'cash' ? parsed.cashMethod : undefined,
        cashRegisterId: parsed.cashRegisterId,
        warehouseId: parsed.warehouseId,
        items: (order.items || []).map((item) => {
          // Descuento del pedido PRESERVADO: la factura usa el precio unitario
          // NETO (total de línea con descuento ÷ cantidad) — así totales,
          // validación de crédito, saldo y recibo de contado coinciden
          // exactamente con lo confirmado en el pedido.
          const qty = Number(item.quantity) || 0;
          const lineTotal = Number(item.totalUSD) || Number((
            (Number(item.quantity) || 0) *
            (Number(item.unitPriceUSD) || 0) *
            (1 - Math.min(Math.max(Number(item.discountPct) || 0, 0), 100) / 100)
          ).toFixed(2));
          const unitNet = qty > 0 ? lineTotal / qty : 0;
          return {
            productId:
              typeof item.product === 'object' && item.product !== null
                ? item.product.id
                : (item.product as number | undefined) || undefined,
            sku: item.sku || undefined,
            description: item.description,
            quantity: qty,
            unitPriceUSD: unitNet,
          };
        }),
        notes: `Facturación del pedido ${order.orderNumber}`,
      });

      const invoice = await createInvoiceCore(payload, user, invoiceParsed, req);

      if ('pendingApproval' in invoice) {
        // IE-PR6: la facturación del pedido excede el límite — el pedido NO se
        // marca invoiced (no hay factura) y la solicitud queda activa.
        return { pendingApproval: true as const, approvalId: invoice.approvalId };
      }

      await payload.update({
        collection: 'orders',
        id: order.id,
        data: {
          status: 'invoiced',
          issuedInvoice: invoice.id,
        },
        req,
      });

      return invoice;
    });

    if ('pendingApproval' in doc) {
      revalidatePath(`/${parsed.tenantSlug}/erp/approvals`);
      return {
        success: true,
        status: 'pending_approval' as const,
        approvalId: doc.approvalId,
      };
    }

    revalidatePath(`/${parsed.tenantSlug}/erp/orders`);
    await maybeAutoSendInvoice(payload, parsed.tenantId, Number(doc.customer), {
      id: doc.id,
      status: doc.status,
      totalUSD: Number(doc.totalUSD) || 0,
    });
    revalidatePath(`/${parsed.tenantSlug}/erp/invoices`);
    revalidatePath(`/${parsed.tenantSlug}/erp`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return {
      success: false,
      error: toSafeActionError(error, 'No se pudo facturar el pedido.'),
    };
  }
}

// ==========================================
// 3c. REMISIONES / NOTAS DE ENTREGA — Sprint 20
// ==========================================
export interface IssueDeliveryNoteInput {
  tenantId: number;
  tenantSlug: string;
  orderId: number;
  items: Array<{ orderItemIndex: number; quantity: number }>;
  notes?: string | null;
}

/**
 * Emite una remisión de entrega (total o parcial) desde un pedido CONFIRMADO.
 *
 * Invariante kardex: la remisión NO genera movimientos de inventario — el
 * stock se descarga exclusivamente al facturar. La validación de cantidades
 * (`despachado + esta ≤ cantidad pedida`) suma las remisiones EMITIDAS
 * previas dentro de la misma transacción, así que dos remisiones concurrentes
 * no pueden sobredespachar (el CREATE final y la lectura previa comparten
 * transacción y la numeración toma advisory lock por documento).
 */
export async function issueDeliveryNoteAction(input: IssueDeliveryNoteInput) {
  try {
    const parsed = issueDeliveryNoteSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      const order = await payload.findByID({
        collection: 'orders',
        id: parsed.orderId,
        depth: 0,
        req,
      });
      if (!order || Number(order.tenant) !== Number(parsed.tenantId)) {
        throw new Error('El pedido no pertenece a este inquilino.');
      }
      if (order.status !== 'confirmed') {
        throw new Error(
          `Sólo los pedidos confirmados admiten remisiones (estado actual: "${order.status}").`,
        );
      }

      const orderItems = Array.isArray(order.items) ? order.items : [];
      if (orderItems.length === 0) {
        throw new Error('El pedido no tiene líneas para despachar.');
      }

      // Sin índices duplicados: cada línea de remisión despacha UNA línea del pedido
      const requested = new Map<number, number>();
      for (const it of parsed.items) {
        if (requested.has(it.orderItemIndex)) {
          throw new Error(
            `La línea ${it.orderItemIndex + 1} del pedido aparece más de una vez en la remisión.`,
          );
        }
        requested.set(it.orderItemIndex, it.quantity);
      }

      // Despachado previo: suma de las remisiones EMITIDAS (las anuladas no cuentan)
      const issuedNotes = await payload.find({
        collection: 'delivery-notes',
        where: {
          and: [
            { order: { equals: order.id } },
            { status: { equals: 'issued' } },
          ],
        },
        depth: 0,
        limit: 500,
        req,
      });
      const dispatched = new Map<number, number>();
      for (const note of issuedNotes.docs) {
        for (const item of Array.isArray(note.items) ? note.items : []) {
          const idx = Number(item.orderItemIndex);
          dispatched.set(idx, (dispatched.get(idx) || 0) + (Number(item.quantity) || 0));
        }
      }

      // Validación de capacidad + snapshot de las líneas del pedido
      const EPS = 0.0001;
      let totalUSD = 0;
      const noteItems = [...requested.entries()].map(([index, qty]) => {
        const orderItem = orderItems[index];
        if (!orderItem) {
          throw new Error(`La línea ${index + 1} no existe en el pedido.`);
        }
        const ordered = Number(orderItem.quantity) || 0;
        const alreadyDispatched = dispatched.get(index) || 0;
        const remaining = Number((ordered - alreadyDispatched).toFixed(4));
        if (qty > remaining + EPS) {
          throw new Error(
            `No hay cantidad suficiente en la línea "${orderItem.description}": pedida ${ordered}, ya despachada ${alreadyDispatched}, disponible ${Math.max(remaining, 0)}.`,
          );
        }
        const unitPrice = Number(orderItem.unitPriceUSD) || 0;
        const discount = Math.min(Math.max(Number(orderItem.discountPct) || 0, 0), 100);
        totalUSD += qty * unitPrice * (1 - discount / 100);
        return {
          orderItemIndex: index,
          product:
            typeof orderItem.product === 'object' && orderItem.product !== null
              ? orderItem.product.id
              : (orderItem.product as number | undefined) || undefined,
          sku: orderItem.sku || undefined,
          description: orderItem.description,
          quantity: qty,
          unitPriceUSD: unitPrice,
          discountPct: discount,
        };
      });

      const rate = Number(order.exchangeRateSnapshot) || 1;
      totalUSD = Number(totalUSD.toFixed(2));

      const noteNumber = await nextDocumentNumber(
        payload,
        'delivery-notes',
        parsed.tenantId,
        'REM',
        req,
      );

      return payload.create({
        collection: 'delivery-notes',
        data: {
          tenant: parsed.tenantId,
          noteNumber,
          order: order.id,
          customer: typeof order.customer === 'object' ? order.customer.id : order.customer,
          items: noteItems,
          status: 'issued',
          issueDate: new Date().toISOString(),
          exchangeRateSnapshot: rate,
          totalUSD,
          totalVES: Number((totalUSD * rate).toFixed(2)),
          notes: parsed.notes || undefined,
        },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/delivery-notes`);
    revalidatePath(`/${parsed.tenantSlug}/erp/orders`);
    revalidatePath(`/${parsed.tenantSlug}/erp/orders/${parsed.orderId}`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo emitir la remisión.') };
  }
}

/** Anula una remisión emitida (estado final): admin only. Sin efecto en kardex. */
export async function voidDeliveryNoteAction(input: {
  tenantId: number;
  tenantSlug: string;
  deliveryNoteId: number;
}) {
  try {
    const parsed = voidDeliveryNoteSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, [
      'super-admin',
      'tenant-admin',
    ]);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      const note = await payload.findByID({
        collection: 'delivery-notes',
        id: parsed.deliveryNoteId,
        depth: 0,
        req,
      });
      if (!note || Number(note.tenant) !== Number(parsed.tenantId)) {
        throw new Error('La remisión no pertenece a este inquilino.');
      }
      if (note.status === 'voided') {
        throw new Error('La remisión ya está anulada.');
      }

      return payload.update({
        collection: 'delivery-notes',
        id: note.id,
        data: { status: 'voided' },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/delivery-notes`);
    revalidatePath(`/${parsed.tenantSlug}/erp/orders`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo anular la remisión.') };
  }
}

// ==========================================
// 3d. CENTRO DE ALERTAS — Sprint 22
// ==========================================
/**
 * Marca una alerta como reconocida por el operador actual. Las alertas las
 * genera el job evaluateAlerts; las acciones humanas van con user +
 * overrideAccess:false para que el RBAC de la colección aplique.
 */
export async function acknowledgeAlertAction(input: {
  tenantId: number;
  tenantSlug: string;
  alertId: number;
}) {
  try {
    const parsed = alertActionSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      const alert = await payload.findByID({
        collection: 'alerts',
        id: parsed.alertId,
        depth: 0,
        req,
      });
      if (!alert || Number(alert.tenant) !== Number(parsed.tenantId)) {
        throw new Error('La alerta no pertenece a este inquilino.');
      }

      return payload.update({
        collection: 'alerts',
        id: alert.id,
        data: {
          acknowledgedAt: new Date().toISOString(),
          acknowledgedBy: user.id,
        },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/alerts`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo reconocer la alerta.') };
  }
}

/** Marca una alerta como resuelta (estado manual; el evaluador la reactiva si la condición reaparece). */
export async function resolveAlertAction(input: {
  tenantId: number;
  tenantSlug: string;
  alertId: number;
}) {
  try {
    const parsed = alertActionSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId, ERP_OPERATOR_ROLES);
    const payload = await getPayload({ config });

    const doc = await withTransaction(payload, user, async (req) => {
      const alert = await payload.findByID({
        collection: 'alerts',
        id: parsed.alertId,
        depth: 0,
        req,
      });
      if (!alert || Number(alert.tenant) !== Number(parsed.tenantId)) {
        throw new Error('La alerta no pertenece a este inquilino.');
      }
      if (alert.resolvedAt) {
        throw new Error('La alerta ya está resuelta.');
      }

      return payload.update({
        collection: 'alerts',
        id: alert.id,
        data: { resolvedAt: new Date().toISOString() },
        req,
      });
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/alerts`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo resolver la alerta.') };
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
  receiptMediaId?: number;
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

      // Aislamiento multi-inquilino: el comprobante adjunto debe pertenecer al
      // inquilino del cobro — un ID foráneo expondría un archivo ajeno.
      // Además, el mismo advisory lock `receipt-media:<id>` que usa
      // deleteOrphanReceiptAction serializa adjunción vs limpieza: la
      // verificación de referencias y el INSERT del cobro ocurren atómicamente
      // respecto a cualquier borrado concurrente (el FK es ON DELETE SET NULL).
      if (parsed.receiptMediaId) {
        const db = getActiveDb(req);
        await db.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${`receipt-media:${parsed.receiptMediaId}`}))`,
        );
        const receipt = await payload.findByID({
          collection: 'media',
          id: parsed.receiptMediaId,
          depth: 0,
          req,
        });
        if (!receipt || Number(receipt.tenant) !== Number(parsed.tenantId)) {
          throw new Error('El comprobante indicado no pertenece a este inquilino.');
        }
      }

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
              ...(parsed.receiptMediaId ? { receipt: parsed.receiptMediaId } : {}),
            },
          ],
          totalUSD: amountUSD,
          // IGTF (Sprint 42): snapshot informativo — obligación del negocio
          // sobre cobros en divisa según taxConfig del inquilino.
          igtfUSD: computeIgtfUSD(
            amountUSD,
            parsed.method,
            Number(tenant?.taxConfig?.igtfPct ?? 3),
            tenant?.taxConfig?.applyIgtfOnFxPayments !== false,
          ),
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
      // Mismo protocolo de lock que completeInventoryCount: guardado y
      // finalización se serializan POR CONTEO, de modo que no se puedan escribir
      // cantidades sobre un conteo ya completado (reporte Devin #86: una carrera
      // check-then-write dejaba el conteo completado en desacuerdo con el Kardex).
      // La lectura del estado ocurre DESPUÉS de tomar el lock: es el estado estable.
      const lockedId = await lockInventoryCount(parsed.countId, req);
      if (!lockedId) {
        throw new Error('El conteo no tiene un identificador válido.');
      }

      const count = await payload.findByID({
        collection: 'inventory-counts',
        id: Number(lockedId),
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
      // La relectura del conteo, la validación de inquilino y la de estado viven
      // AHORA dentro de la utility, bajo el advisory lock por conteo: eso evita
      // la doble finalización concurrente (dos pestañas aplicando los ajustes dos
      // veces sobre el Kardex). Ver completeInventoryCount.
      const adjusted = await completeInventoryCount({
        countId: parsed.countId,
        expectedTenantId: parsed.tenantId,
        completedBy: user.id,
        req,
      });

      return { countId: parsed.countId, adjustedProducts: adjusted };
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
  email?: string | null;
  address?: string | null;
  status?: 'lead' | 'first_time' | 'recurring' | 'vip' | 'inactive';
  creditAllowed?: boolean;
  creditLimitUSD?: number;
  creditDays?: number;
  priceTier?: 'retail' | 'wholesale' | 'vendor' | 'promo';
}

export async function updateCustomerAction(input: UpdateCustomerInput) {
  try {
    const parsed = updateCustomerSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    // Aislamiento multi-inquilino: el ID viene del cliente, se revalida.
    const existing = await payload.findByID({
      collection: 'customers',
      id: parsed.customerId,
      depth: 0,
      user,
      overrideAccess: false,
    });
    if (!existing || Number(existing.tenant) !== Number(parsed.tenantId)) {
      return { success: false, error: 'El cliente no pertenece a este inquilino.' };
    }

    const doc = await payload.update({
      collection: 'customers',
      id: parsed.customerId,
      data: {
        name: parsed.name,
        taxId: parsed.taxId,
        phone: parsed.phone,
        // null limpia el valor; undefined (campo ausente) no lo modifica.
        email: parsed.email,
        address: parsed.address,
        status: parsed.status || 'first_time',
        creditAllowed: parsed.creditAllowed ?? false,
        creditLimitUSD: parsed.creditLimitUSD ?? 0,
        creditDays: parsed.creditDays ?? 0,
        ...(parsed.priceTier ? { priceTier: parsed.priceTier } : {}),
      },
      user,
      overrideAccess: false,
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
    const user = await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    // Aislamiento multi-inquilino: el ID viene del cliente, se revalida.
    const existing = await payload.findByID({
      collection: 'products',
      id: parsed.productId,
      depth: 0,
      user,
      overrideAccess: false,
    });
    if (!existing || Number(existing.tenant) !== Number(parsed.tenantId)) {
      return { success: false, error: 'El producto no pertenece a este inquilino.' };
    }

    // El cambio de priceUSD escribe price-history automáticamente (pricingPlugin).
    // priceTiers: si llega undefined no se toca; si llega, reemplaza completo.
    // taxRate: si el input lo omite se PRESERVA el vigente (nunca resetear a
    // exempt durante ediciones no relacionadas).
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
        ...(parsed.taxRate !== undefined ? { taxRate: parsed.taxRate } : {}),
        minStockAlert: parsed.minStockAlert ?? 0,
        ...(parsed.priceTiers !== undefined ? { priceTiers: parsed.priceTiers } : {}),
      },
      user,
      overrideAccess: false,
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
  validUntil?: string | null;
  notes?: string | null;
}

export async function updateQuoteAction(input: UpdateQuoteInput) {
  try {
    const parsed = updateQuoteSchema.parse(input);
    const user = await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    const quote = await payload.findByID({
      collection: 'quotes',
      id: parsed.quoteId,
      depth: 0,
      user,
      overrideAccess: false,
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

    // Aislamiento multi-inquilino de las referencias: el cliente y cada
    // producto de línea deben pertenecer al inquilino autorizado.
    const customer = await payload.findByID({
      collection: 'customers',
      id: parsed.customerId,
      depth: 0,
      user,
      overrideAccess: false,
    });
    if (!customer || Number(customer.tenant) !== Number(parsed.tenantId)) {
      return { success: false, error: 'El cliente indicado no pertenece a este inquilino.' };
    }
    for (const it of parsed.items) {
      if (!it.productId) continue;
      const product = await payload.findByID({
        collection: 'products',
        id: it.productId,
        depth: 0,
        user,
        overrideAccess: false,
      });
      if (!product || Number(product.tenant) !== Number(parsed.tenantId)) {
        return {
          success: false,
          error: `Un producto de las líneas no pertenece a este inquilino (${it.sku || it.productId}).`,
        };
      }
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
        // null limpia el valor; undefined (campo ausente) no lo modifica.
        validUntil: parsed.validUntil,
        notes: parsed.notes,
      },
      user,
      overrideAccess: false,
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/quotes`);

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo actualizar la cotización.') };
  }
}

export interface InviteUserInput {
  tenantId: number;
  tenantSlug: string;
  email: string;
  name: string;
  password: string;
  role: 'super-admin' | 'tenant-admin' | 'vendor' | 'cashier' | 'employee' | 'supervisor';
}

/**
 * Invita un usuario al inquilino (Sprint 17). RBAC estricto:
 *  - tenant-admin: solo puede crear usuarios para SU inquilino y solo con roles
 *    operativos (vendor/cashier/employee/supervisor) — nunca escalables a admin.
 *  - super-admin: cualquier rol, cualquier inquilino del que sea miembro (o el indicado).
 */
export async function inviteUserAction(input: InviteUserInput) {
  try {
    const parsed = inviteUserSchema.parse(input);
    const actor = await requireErpTenantAccess(parsed.tenantId);
    const payload = await getPayload({ config });

    if (actor.role !== 'super-admin') {
      if (parsed.role === 'super-admin' || parsed.role === 'tenant-admin') {
        throw new Error(
          'Prohibido: solo un super-administrador puede crear cuentas administrativas.',
        );
      }
    }

    // El campo `tenants` (tenantsArrayField del plugin multi-tenant) sólo es
    // escribible por super-admin a nivel de field access. Para el tenant-admin
    // usamos overrideAccess:true con autorización explícita EQUIVALENTE:
    // requireErpTenantAccess ya verificó su membresía y rol, la única membresía
    // asignada es la del inquilino verificado (parsed.tenantId) y los roles
    // administrativos están bloqueados arriba — jamás un inquilino del input
    // libre. El super-admin mantiene overrideAccess:false y el control nativo.
    const doc = await payload.create({
      collection: 'users',
      data: {
        email: parsed.email,
        name: parsed.name,
        password: parsed.password,
        role: parsed.role,
        tenants: [{ tenant: parsed.tenantId }],
      },
      user: actor,
      overrideAccess: actor.role === 'super-admin' ? false : true,
      // Flag interno: habilita el create de colección para tenant-admin SÓLO
      // por esta vía (Users.create lo exige); un POST REST directo no lo lleva.
      context: { viaInviteUserAction: true },
    });

    revalidatePath(`/${parsed.tenantSlug}/erp/settings`);

    return { success: true, data: { id: doc.id, email: doc.email } };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo invitar al usuario.') };
  }
}

/**
 * Sube el comprobante digital de un cobro a la colección media (Sprint 17).
 * Firma FormData: Next.js serializa File en Server Actions nativamente.
 * Devuelve el id de media para adjuntarlo a methods[0].receipt.
 */
export async function uploadReceiptAction(formData: FormData): Promise<{
  success: boolean;
  mediaId?: number;
  error?: string;
}> {
  try {
    const payload = await getPayload({ config });

    const file = formData.get('file');
    const tenantId = Number(formData.get('tenantId'));
    if (!(file instanceof File)) {
      return { success: false, error: 'Archivo requerido.' };
    }
    if (!tenantId) {
      return { success: false, error: 'Inquilino requerido.' };
    }
    if (file.size > 8 * 1024 * 1024) {
      return { success: false, error: 'El comprobante no puede superar 8 MB.' };
    }
    // Valida tipo y tamaño ANTES de materializar el buffer: rechazar temprano
    // evita consumir memoria del serverless con cargas no soportadas.
    const ALLOWED_RECEIPT_TYPES = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ] as const;
    if (!ALLOWED_RECEIPT_TYPES.includes(file.type as (typeof ALLOWED_RECEIPT_TYPES)[number])) {
      return { success: false, error: 'Formato no soportado (usá JPG, PNG, WebP o PDF).' };
    }

    // Aislamiento multi-inquilino: se verifica membresía ANTES de escribir el
    // archivo. Con ella verificada, el overrideAccess privilegiado de la
    // creación de media queda autorizado explícitamente para este inquilino.
    const actor = await requireErpTenantAccess(tenantId);

    const buffer = Buffer.from(await file.arrayBuffer());

    const doc = await payload.create({
      collection: 'media',
      data: {
        tenant: tenantId,
        alt: `${RECEIPT_ALT_PREFIX} — ${file.name}`,
      },
      file: {
        data: buffer,
        mimetype: file.type || 'application/octet-stream',
        name: file.name,
        size: file.size,
      },
      user: actor,
      overrideAccess: true,
    });

    return { success: true, mediaId: doc.id };
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) return { success: false, error: error.message };
    console.error('[uploadReceipt]', error);
    return { success: false, error: 'No se pudo subir el comprobante.' };
  }
}

/**
 * Limpieza compensatoria del flujo cobro+comprobante: si la creación del cobro
 * falla DESPUÉS de subir el recibo, se elimina el archivo huérfano.
 *
 * Acotado y seguro por diseño:
 * - Sólo comprobantes del flujo (alt con el prefijo que pone uploadReceiptAction):
 *   imágenes de productos u otros media del inquilino NO se tocan.
 * - Sólo roles operativos (los mismos que crean cobros).
 * - Transaccional con advisory lock `receipt-media:<id>` COMPARTIDO con
 *   createPaymentAction: la verificación de referencias y el borrado son
 *   atómicos respecto a la adjunción del recibo por un cobro concurrente —
 *   imposible que el FK ON DELETE SET NULL desadjunte un cobro ya confirmado.
 */
export async function deleteOrphanReceiptAction(tenantId: number, mediaId: number): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const actor = await requireErpTenantAccess(tenantId, ERP_OPERATOR_ROLES);
    const payload = await getPayload({ config });

    await withTransaction(payload, actor, async (req) => {
      // Serializa adjunción (cobro) vs limpieza (aquí) del mismo media.
      const db = getActiveDb(req);
      await db.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`receipt-media:${mediaId}`}))`,
      );

      const media = await payload.findByID({
        collection: 'media',
        id: mediaId,
        depth: 0,
        req,
      });
      if (!media || Number(media.tenant) !== Number(tenantId)) {
        throw new Error('El comprobante no pertenece a este inquilino.');
      }
      if (!media.alt || !String(media.alt).startsWith(RECEIPT_ALT_PREFIX)) {
        throw new Error('El archivo no es un comprobante de cobro: no se puede borrar por esta vía.');
      }

      const referenced = await payload.find({
        collection: 'customer-payments',
        where: { 'methods.receipt': { equals: mediaId } },
        limit: 1,
        depth: 0,
        req,
      });
      if (referenced.totalDocs > 0) {
        throw new Error('El comprobante está referenciado por un cobro.');
      }

      // Escritura privilegiada con autorización explícita equivalente:
      // pertenencia al inquilino, marcador de comprobante y ausencia de
      // referencias ya verificadas bajo lock.
      await payload.delete({
        collection: 'media',
        id: mediaId,
        req,
        overrideAccess: true,
      });
    });

    return { success: true };
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) return { success: false, error: error.message };
    console.error('[deleteOrphanReceipt]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'No se pudo limpiar el comprobante huérfano.',
    };
  }
}

// ==========================================
// 5. CAJAS REGISTRADORAS & ARQUEOS CIEGOS
// ==========================================// ==========================================
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
  salesDocumentDefault?: 'nota_entrega' | 'factura';
  autoSendQuoteEmail?: boolean;
  autoSendInvoiceEmail?: boolean;
  alertsEmailEnabled?: boolean;
  alertsEmailRecipients?: string[];
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
        // Solo se persiste cuando viene explícito: no se pisa lo ya guardado
        ...(parsed.salesDocumentDefault
          ? { salesConfig: { salesDocumentDefault: parsed.salesDocumentDefault } }
          : {}),
        ...(parsed.autoSendQuoteEmail !== undefined ||
        parsed.autoSendInvoiceEmail !== undefined ||
        parsed.alertsEmailEnabled !== undefined ||
        parsed.alertsEmailRecipients !== undefined
          ? {
              emailConfig: {
                ...(parsed.autoSendQuoteEmail !== undefined
                  ? { autoSendQuoteEmail: parsed.autoSendQuoteEmail }
                  : {}),
                ...(parsed.autoSendInvoiceEmail !== undefined
                  ? { autoSendInvoiceEmail: parsed.autoSendInvoiceEmail }
                  : {}),
                ...(parsed.alertsEmailEnabled !== undefined
                  ? { alertsEmailEnabled: parsed.alertsEmailEnabled }
                  : {}),
                ...(parsed.alertsEmailRecipients !== undefined
                  ? {
                      alertsEmailRecipients: parsed.alertsEmailRecipients.map((email) => ({
                        email,
                      })),
                    }
                  : {}),
              },
            }
          : {}),
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
        // Escenario regulatorio venezolano 2026: los nuevos inquilinos entregan
        // con Nota de Entrega; la factura pasa a ser opcional.
        salesConfig: { salesDocumentDefault: 'nota_entrega' },
      },
    });

    revalidatePath('/');

    return { success: true, data: doc };
  } catch (error: unknown) {
    return { success: false, error: toSafeActionError(error, 'No se pudo crear la empresa.') };
  }
}
