import { z } from 'zod';
import type { Where } from 'payload';

// ==========================================
// Contratos de entrada validados en runtime (Server Actions)
// Los navegadores pueden ser omitidos: todo input remoto se revalida aquí.
// ==========================================

const positiveMoney = z.number().min(0, 'El monto no puede ser negativo.').finite();
const idLike = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).transform(Number);

/**
 * Campos opcionales limpiables: en edición, vaciar un campo se representa con
 * `null` (borra el valor almacenado) — distinto de `undefined`, que significa
 * "no modificar". Un string vacío del formulario se normaliza a null.
 */
const clearableText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(max).nullable().optional(),
  );
const clearableEmail = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().email('Email inválido.').max(200).nullable().optional(),
);

export const createCustomerSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  name: z.string().trim().min(2, 'El nombre del cliente es requerido.').max(300),
  taxId: z.string().trim().min(3, 'El RIF/Cédula es requerido.').max(50),
  phone: z.string().trim().min(5, 'El teléfono es requerido.').max(50),
  email: clearableEmail,
  address: clearableText(500),
  status: z.enum(['lead', 'first_time', 'recurring', 'vip', 'inactive']).optional(),
  creditAllowed: z.boolean().optional(),
  creditLimitUSD: positiveMoney.optional(),
  creditDays: z.number().int().min(0).max(365).optional(),
});

export const createProductSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  name: z.string().trim().min(2, 'El nombre del producto es requerido.').max(300),
  sku: z.string().trim().min(1, 'El SKU es requerido.').max(100),
  productType: z.enum(['standard', 'raw_material', 'manufactured', 'service']),
  unitOfMeasure: z.enum(['unit', 'kg', 'g', 'l', 'ml', 'm', 'box']),
  costUSD: positiveMoney,
  priceUSD: positiveMoney,
  taxRate: z.enum(['exempt', 'general', 'reduced']).optional(),
  minStockAlert: positiveMoney.optional(),
  // Nota: el stock inicial NO se acepta por este contrato. La existencia sólo puede
  // modificarse mediante movimientos de inventario (kardex inmutable).
});

export const invoiceItemSchema = z.object({
  productId: idLike.optional(),
  sku: z.string().trim().max(100).optional(),
  description: z.string().trim().min(1, 'Cada línea requiere descripción.').max(500),
  quantity: z.number().positive('La cantidad debe ser mayor a 0.').finite().max(1_000_000),
  unitPriceUSD: z.number().min(0, 'El precio no puede ser negativo.').finite().max(10_000_000),
});

export const createInvoiceSchema = z
  .object({
    tenantId: idLike,
    tenantSlug: z.string().min(1).max(120),
    customerId: idLike,
    paymentTerms: z.enum(['cash', 'credit']),
    // Método de captura inmediata del pago en ventas de contado
    cashMethod: z
      .enum(['cash_usd', 'cash_ves', 'pos_ves', 'pago_movil', 'transfer_ves', 'zelle', 'binance'])
      .optional(),
    cashRegisterId: idLike.optional(),
    // Almacén de despacho: de dónde sale el inventario de esta venta
    warehouseId: idLike.optional(),
    // Cuotas para ventas a crédito (1 = un solo vencimiento)
    installmentsCount: z.number().int().min(1).max(12).optional(),
    items: z.array(invoiceItemSchema).min(1, 'La factura requiere al menos una línea.').max(200),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine(
    (data) => data.paymentTerms !== 'cash' || Boolean(data.cashMethod),
    { message: 'Una venta de contado requiere el método de pago para capturar el recibo.' },
  );

export const createPaymentSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  customerId: idLike,
  invoiceId: idLike.optional(),
  amountUSD: z.number().positive('El monto a cobrar debe ser mayor a 0.').finite().max(10_000_000),
  method: z.enum([
    'cash_usd',
    'cash_ves',
    'pos_ves',
    'pago_movil',
    'transfer_ves',
    'zelle',
    'binance',
  ]),
  receiptMediaId: idLike.optional(),
  referenceNumber: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const INVITABLE_ROLES = ['vendor', 'cashier', 'employee', 'supervisor'] as const;

export const inviteUserSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  email: z.string().trim().email('Email inválido.').max(200),
  name: z.string().trim().min(2, 'El nombre es requerido.').max(200),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(128),
  role: z.enum(['super-admin', 'tenant-admin', ...INVITABLE_ROLES]),
});

export const createCashRegisterSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  name: z.string().trim().min(2).max(300),
  code: z.string().trim().min(1).max(100),
  warehouseId: idLike,
});

export const cashClosureSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  cashRegisterId: idLike,
  physicalUSD: positiveMoney,
  physicalVES: positiveMoney,
  physicalPOS: positiveMoney,
  physicalPagoMovil: positiveMoney,
  physicalTransfer: positiveMoney,
  physicalZelle: positiveMoney,
  physicalBinance: positiveMoney,
  notes: z.string().trim().max(1000).optional(),
});

export const openCashShiftSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  cashRegisterId: idLike,
  openingFloatUSD: positiveMoney,
  openingFloatVES: positiveMoney,
  notes: z.string().trim().max(1000).optional(),
});

export const updateCustomerSchema = createCustomerSchema.extend({
  customerId: idLike,
  // Edición: '' / null borran el valor; undefined (ausente) no lo modifica.
  email: clearableEmail,
  address: clearableText(500),
  priceTier: z.enum(['retail', 'wholesale', 'vendor', 'promo']).optional(),
});

export const updateProductSchema = createProductSchema.extend({
  productId: idLike,
  priceTiers: z
    .array(
      z.object({
        tier: z.enum(['wholesale', 'vendor', 'promo']),
        priceUSD: positiveMoney,
      }),
    )
    .max(3, 'Máximo 3 tiers alternativos (el retail es el precio base).')
    .optional(),
});

export const quoteItemSchema = z.object({
  productId: idLike.optional(),
  sku: z.string().trim().max(100).optional(),
  description: z.string().trim().min(1, 'Cada línea requiere descripción.').max(500),
  quantity: z.number().positive('La cantidad debe ser mayor a 0.').finite().max(1_000_000),
  unitPriceUSD: z.number().min(0, 'El precio no puede ser negativo.').finite().max(10_000_000),
});

export const createQuoteSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  customerId: idLike,
  items: z.array(quoteItemSchema).min(1, 'La cotización requiere al menos una línea.').max(200),
  validUntil: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().datetime({ offset: true }).nullable().optional(),
  ),
  notes: clearableText(2000),
});

export const updateQuoteStatusSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  quoteId: idLike,
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired']),
});

// ==========================================
// Pedidos de venta (Sprint 19)
// ==========================================

export const orderItemSchema = z.object({
  productId: idLike.optional(),
  sku: z.string().trim().max(100).optional(),
  description: z.string().trim().min(1, 'Cada línea requiere descripción.').max(500),
  quantity: z.number().positive('La cantidad debe ser mayor a 0.').finite().max(1_000_000),
  unitPriceUSD: z.number().min(0, 'El precio no puede ser negativo.').finite().max(10_000_000),
  discountPct: z.number().min(0, 'El descuento no puede ser negativo.').max(100).optional(),
});

export const createOrderSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  customerId: idLike,
  items: z.array(orderItemSchema).min(1, 'El pedido requiere al menos una línea.').max(200),
  notes: clearableText(2000),
});

export const updateOrderSchema = createOrderSchema.extend({
  orderId: idLike,
});

export const orderTransitionSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  orderId: idLike,
});

export const deliveryNoteItemSchema = z.object({
  orderItemIndex: z.number().int().min(0),
  quantity: z.number().positive('La cantidad a despachar debe ser mayor a 0.').finite().max(1_000_000),
});

export const issueDeliveryNoteSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  orderId: idLike,
  items: z.array(deliveryNoteItemSchema).min(1, 'La remisión requiere al menos una línea.').max(200),
  notes: clearableText(2000),
});

export const voidDeliveryNoteSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  deliveryNoteId: idLike,
});

// ==========================================
// Alertas (Sprint 22)
// ==========================================

export const alertActionSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  alertId: idLike,
});

export const issueOrderInvoiceSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  orderId: idLike,
  paymentTerms: z.enum(['cash', 'credit']),
  cashMethod: z
    .enum(['cash_usd', 'cash_ves', 'pos_ves', 'pago_movil', 'transfer_ves', 'zelle', 'binance'])
    .optional(),
  cashRegisterId: idLike.optional(),
  warehouseId: idLike.optional(),
});

export const updateQuoteSchema = createQuoteSchema.extend({
  quoteId: idLike,
  // Edición: '' / null borran validUntil/notes; undefined no los modifica.
  validUntil: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().datetime({ offset: true }).nullable().optional(),
  ),
  notes: clearableText(2000),
});

export const convertQuoteSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  quoteId: idLike,
  paymentTerms: z.enum(['cash', 'credit']),
  cashMethod: z
    .enum(['cash_usd', 'cash_ves', 'pos_ves', 'pago_movil', 'transfer_ves', 'zelle', 'binance'])
    .optional(),
  cashRegisterId: idLike.optional(),
  warehouseId: idLike.optional(),
});

export const saleReturnLineSchema = z.object({
  productId: idLike,
  quantity: z.number().positive('La cantidad a devolver debe ser mayor a 0.').finite().max(1_000_000),
});

export const purchaseInvoiceItemSchema = z.object({
  productId: idLike,
  sku: z.string().trim().max(100).optional(),
  description: z.string().trim().min(1, 'Cada línea requiere descripción.').max(500),
  quantity: z.number().positive('La cantidad debe ser mayor a 0.').finite().max(1_000_000),
  unitCostUSD: z.number().min(0, 'El costo no puede ser negativo.').finite().max(10_000_000),
});

export const createPurchaseInvoiceSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  supplierId: idLike,
  items: z.array(purchaseInvoiceItemSchema).min(1, 'La compra requiere al menos una línea.').max(200),
  dueDate: z.string().datetime({ offset: true }).optional(),
  receptionWarehouseId: idLike.optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const receivePurchaseGoodsSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  purchaseInvoiceId: idLike,
  warehouseId: idLike,
});

export const supplierPaymentSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  supplierId: idLike,
  amountUSD: z.number().positive('El monto a pagar debe ser mayor a 0.').finite().max(10_000_000),
  method: z.enum([
    'cash_usd',
    'cash_ves',
    'pos_ves',
    'pago_movil',
    'transfer_ves',
    'zelle',
    'binance',
  ]),
  purchaseInvoiceId: idLike.optional(),
  referenceNumber: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const transferStockSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  productId: idLike,
  sourceWarehouseId: idLike,
  targetWarehouseId: idLike,
  quantity: z.number().positive('La cantidad a transferir debe ser mayor a 0.').finite().max(1_000_000),
  reason: z.string().trim().max(1000).optional(),
});

export const adjustStockSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  productId: idLike,
  warehouseId: idLike,
  direction: z.enum(['in', 'out']),
  quantity: z.number().positive('La cantidad debe ser mayor a 0.').finite().max(1_000_000),
  reason: z.string().trim().min(3, 'Describe el motivo del ajuste.').max(500),
});

export const voidInvoiceSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  invoiceId: idLike,
  reason: z.string().trim().max(1000).optional(),
});

export const createSaleReturnSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  invoiceId: idLike,
  lines: z.array(saleReturnLineSchema).min(1, 'Indica al menos un producto a devolver.').max(200),
  reason: z.string().trim().max(1000).optional(),
});

export const createInventoryCountSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  warehouseId: idLike,
  notes: z.string().trim().max(1000).optional(),
});

export const saveCountedItemsSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  countId: idLike,
  counted: z
    .array(
      z.object({
        productId: idLike,
        countedQty: z.number().min(0, 'La cantidad contada no puede ser negativa.').finite(),
      }),
    )
    .min(1)
    .max(1000),
});

export const completeInventoryCountSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  countId: idLike,
});

export const stockImportRowSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  quantity: z.number().finite('Cantidad no numérica.'),
});

export const importStockSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  warehouseId: idLike,
  mode: z.enum(['adjust', 'set']),
  rows: z
    .array(stockImportRowSchema)
    .min(1, 'El archivo no contiene filas válidas.')
    .max(1000, 'Máximo 1000 filas por importación.'),
});

export const ensureWalkInCustomerSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
});

export const executeProductionSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  bomId: idLike,
  unitsToProduce: z.number().positive('La cantidad a producir debe ser mayor a 0.').finite().max(1_000_000),
  sourceWarehouseId: idLike,
  targetWarehouseId: idLike,
});

export const createSupplierSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  name: z.string().trim().min(2).max(300),
  taxId: z.string().trim().min(3, 'El RIF del proveedor es requerido.').max(50),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().email('Email inválido.').max(200).optional(),
  contactName: z.string().trim().max(300).optional(),
  creditDays: z.number().int().min(0).max(365).optional(),
  creditLimitUSD: positiveMoney.optional(),
});

export const updateTenantSettingsSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  name: z.string().trim().min(2).max(300),
  rifFiscal: z.string().trim().max(50).optional(),
  phone: z.string().trim().max(50).optional(),
  baseCurrency: z.enum(['USD', 'VES']),
  manualExchangeRate: positiveMoney.optional(),
  autoSyncRate: z.boolean(),
});

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(300),
  slug: z
    .string()
    .trim()
    .min(2, 'El slug es requerido.')
    .max(80)
    .transform((s) => s.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
    .refine((s) => /^[a-z0-9-]+$/.test(s) && s.length >= 2, {
      message: 'El slug sólo admite minúsculas, números y guiones.',
    }),
  rifFiscal: z.string().trim().max(50).optional(),
  phone: z.string().trim().max(50).optional(),
});

/** Extrae el primer mensaje legible de un ZodError para devolverlo al cliente. */
export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message || 'Datos inválidos.';
}

// ==========================================
// Filtros de URL (RSC) — el kardex recibe searchParams sin pasar por Server
// Action: todo valor malformado se descarta (no rompe la página).
// ==========================================

/** Fecha de calendario (YYYY-MM-DD): sintaxis y validez real del día. */
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (se espera YYYY-MM-DD).')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, 'Fecha de calendario inexistente.');

/** Entero positivo tolerante: descarta NaN, negativos, cero y fracciones. */
const optionalPositiveInt = z.coerce
  .number()
  .int()
  .positive()
  .optional()
  .catch(undefined);

export const kardexFiltersSchema = z.object({
  page: z.coerce.number().int().positive().catch(1),
  product: optionalPositiveInt,
  warehouse: optionalPositiveInt,
  movementType: z
    .enum([
      'purchase_in',
      'sale_out',
      'sale_return',
      'production_consume',
      'production_output',
      'transfer',
      'adjustment_positive',
      'adjustment_negative',
      'scrap',
    ])
    .optional()
    .catch(undefined),
  from: dateOnly.optional().catch(undefined),
  to: dateOnly.optional().catch(undefined),
});

// Filtros de la vista global de auditoría (URL → RSC): valores malformados
// se descartan, igual que en el kardex.
export const auditFiltersSchema = z.object({
  page: z.coerce.number().int().positive().catch(1),
  collection: z
    .enum([
      'invoices',
      'customer-payments',
      'purchase-invoices',
      'supplier-payments',
      'products',
      'cash-closures',
      'quotes',
      'orders',
      'delivery-notes',
      'tenants',
    ])
    .optional()
    .catch(undefined),
  operation: z.enum(['create', 'update', 'delete']).optional().catch(undefined),
  from: dateOnly.optional().catch(undefined),
  to: dateOnly.optional().catch(undefined),
});

// Rango de fechas de calendario compartido por los listados de negocio Y los
// exports CSV (route handlers): `from`/`to` son fechas YYYY-MM-DD en la zona
// horaria de negocio (UTC-4, ver buildBusinessDateRange). Un valor malformado
// se descarta (catch) en lugar de fallar — el mismo contrato que las páginas
// RSC, así un export con `from=abc` devuelve el conjunto sin filtrar y no un 500.
export const businessDateRangeSchema = z.object({
  from: dateOnly.optional().catch(undefined),
  to: dateOnly.optional().catch(undefined),
});

// Filtros de negocio compartidos (Sprint 39): facturas, cotizaciones, pedidos,
// remisiones, compras y pagos usan el MISMO contrato URL→RSC. `status` es el
// enum propio de cada documento y se filtra por vista con un literal tuple tipado.
export const businessListFiltersSchema = businessDateRangeSchema.extend({
  page: z.coerce.number().int().positive().catch(1),
});

/** Listado de facturas: agrega su enum de estado al contrato compartido. */
export const invoicesListFiltersSchema = businessListFiltersSchema.extend({
  status: z
    .enum(['draft', 'issued', 'partially_paid', 'paid', 'voided'])
    .optional()
    .catch(undefined),
});

/** Listado de cotizaciones: agrega su enum de estado. */
export const quotesListFiltersSchema = businessListFiltersSchema.extend({
  status: z
    .enum(['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'])
    .optional()
    .catch(undefined),
});

/**
 * Campo sobre el que se aplica el período de negocio. Los documentos de venta
 * (facturas, cotizaciones) definen su período por la FECHA DE EMISIÓN
 * (`issueDate`): una factura con fecha retroactiva o editada pertenece al
 * período de su emisión, no al del timestamp en que se insertó la fila. Las
 * bitácoras inmutables (kardex) sí se ordenan por `createdAt`.
 */
export type BusinessDateField = 'issueDate' | 'createdAt';

/**
 * Convierte el par {from,to} de fechas de calendario (YYYY-MM-DD) en un rango
 * de timestamps ISO inclusivo-exclusivo en la zona horaria de negocio
 * (Venezuela, UTC-4, sin DST): "hasta" usa el borde exclusivo del día
 * siguiente para incluir la tarde/noche local que un corte 23:59:59 perdería.
 * Devuelve condiciones `where` listas para spread en un AND:
 * `and.push(...buildBusinessDateRange(q.from, q.to, 'issueDate'))`.
 *
 * El campo se ramifica con literales (sin claves computadas) para que cada
 * condición conserve el tipado estricto de `Where` sin casts.
 */
export function buildBusinessDateRange(
  from?: string,
  to?: string,
  field: BusinessDateField = 'createdAt',
): Where[] {
  const conditions: Where[] = [];
  const lowerInclusive = from ? new Date(`${from}T00:00:00-04:00`).toISOString() : undefined;

  let upperExclusive: string | undefined;
  if (to) {
    const toEndExclusive = new Date(`${to}T00:00:00-04:00`);
    toEndExclusive.setUTCDate(toEndExclusive.getUTCDate() + 1);
    upperExclusive = toEndExclusive.toISOString();
  }

  if (field === 'issueDate') {
    if (lowerInclusive) conditions.push({ issueDate: { greater_than_equal: lowerInclusive } });
    if (upperExclusive) conditions.push({ issueDate: { less_than: upperExclusive } });
  } else {
    if (lowerInclusive) conditions.push({ createdAt: { greater_than_equal: lowerInclusive } });
    if (upperExclusive) conditions.push({ createdAt: { less_than: upperExclusive } });
  }

  return conditions;
}

// Formato del DÍA DE NEGOCIO compartido por el preview de reportes y los
// exports CSV: la zona horaria de negocio es America/Caracas (UTC-4, sin DST)
// y formatear sin `timeZone` usa la del servidor — una venta de las 21:00 en
// Caracas (01:00 UTC del día siguiente) se mostraría "mañana" y saldría del
// período filtrado. `en-CA` produce YYYY-MM-DD: el mismo formato que los
// inputs from/to del período.
const businessDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Caracas',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Fecha de negocio (Caracas) de un timestamp como YYYY-MM-DD; '' si el valor
 * no es una fecha válida — el mismo contrato tolerante de los filtros.
 */
export function formatBusinessDate(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? '' : businessDayFormatter.format(date);
}
