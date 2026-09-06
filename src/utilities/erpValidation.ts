import { z } from 'zod';

// ==========================================
// Contratos de entrada validados en runtime (Server Actions)
// Los navegadores pueden ser omitidos: todo input remoto se revalida aquí.
// ==========================================

const positiveMoney = z.number().min(0, 'El monto no puede ser negativo.').finite();
const idLike = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).transform(Number);

export const createCustomerSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  name: z.string().trim().min(2, 'El nombre del cliente es requerido.').max(300),
  taxId: z.string().trim().min(3, 'El RIF/Cédula es requerido.').max(50),
  phone: z.string().trim().min(5, 'El teléfono es requerido.').max(50),
  email: z.string().trim().email('Email inválido.').max(200).optional(),
  address: z.string().trim().max(500).optional(),
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
  referenceNumber: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
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
  validUntil: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const updateQuoteStatusSchema = z.object({
  tenantId: idLike,
  tenantSlug: z.string().min(1).max(120),
  quoteId: idLike,
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired']),
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
