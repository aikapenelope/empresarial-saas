import type { IndustryTemplateDefinition } from './definitions';

const WAREHOUSE_TYPES = new Set([
  'main',
  'raw_materials',
  'work_in_progress',
  'scrap',
  'retail',
]);

const PRODUCT_TYPES = new Set(['standard', 'raw_material', 'manufactured', 'service']);
const UNIT_OF_MEASURE = new Set(['unit', 'kg', 'g', 'l', 'ml', 'm', 'box']);
const TAX_RATES = new Set(['exempt', 'general', 'reduced']);

// Límites que impiden que un JSON malicioso o sobredimensionado agote el worker serverless
const LIMITS = {
  warehouses: 50,
  categories: 100,
  cashRegisters: 50,
  products: 500,
  boms: 100,
  bomItems: 50,
  stringLength: 300,
};

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkString(
  value: unknown,
  label: string,
  errors: string[],
  options: { required: boolean } = { required: true },
): void {
  if (value === undefined || value === null || value === '') {
    if (options.required) errors.push(`${label} es requerido.`);
    return;
  }
  if (typeof value !== 'string') {
    errors.push(`${label} debe ser texto.`);
    return;
  }
  if (value.length > LIMITS.stringLength) {
    errors.push(`${label} excede la longitud máxima permitida (${LIMITS.stringLength}).`);
  }
}

function checkNumber(
  value: unknown,
  label: string,
  errors: string[],
  options: { required: boolean; min?: number; max?: number } = { required: true },
): void {
  if (value === undefined || value === null) {
    if (options.required) errors.push(`${label} es requerido.`);
    return;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${label} debe ser un número finito.`);
    return;
  }
  if (options.min !== undefined && value < options.min) {
    errors.push(`${label} debe ser mayor o igual a ${options.min}.`);
  }
  if (options.max !== undefined && value > options.max) {
    errors.push(`${label} debe ser menor o igual a ${options.max}.`);
  }
}

function checkEnum(value: unknown, label: string, allowed: Set<string>, errors: string[]): void {
  if (typeof value !== 'string' || !allowed.has(value)) {
    errors.push(`${label} debe ser uno de: ${[...allowed].join(', ')}.`);
  }
}

function checkArraySize(value: unknown, label: string, limit: number, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${label} debe ser un arreglo.`);
    return;
  }
  if (value.length > limit) {
    errors.push(`${label} excede el máximo de ${limit} elementos.`);
  }
}

/**
 * Validación estricta y completa de una definición declarativa de plantilla industrial.
 * Se aplica tanto al campo `templateData` de la colección (antes de persistir el JSON)
 * como al seeder (antes de usar el contrato para escrituras privilegiadas), de modo que
 * ningún JSON malformado, sobredimensionado o con referencias rotas llegue a provisionar
 * catálogos del inquilino.
 */
export function validateTemplateDefinition(
  value: unknown,
  result: TemplateValidationResult = { valid: true, errors: [] },
): TemplateValidationResult {
  const errors = result.errors;

  if (!isRecord(value)) {
    return { valid: false, errors: ['templateData debe ser un objeto JSON válido.'] };
  }

  const template = value as unknown as IndustryTemplateDefinition;

  checkString(template.name, 'name', errors);
  checkString(template.slug, 'slug', errors);
  checkString(template.description, 'description', errors);
  checkString(template.icon, 'icon', errors, { required: false });
  if (template.defaultPaymentMethods !== undefined) {
    if (!Array.isArray(template.defaultPaymentMethods)) {
      errors.push('defaultPaymentMethods debe ser un arreglo.');
    }
  }

  checkArraySize(template.warehouses, 'warehouses', LIMITS.warehouses, errors);
  const warehouseCodes = new Set<string>();
  if (Array.isArray(template.warehouses)) {
    template.warehouses.forEach((wh, i) => {
      const label = `warehouses[${i}]`;
      if (!isRecord(wh)) {
        errors.push(`${label} debe ser un objeto.`);
        return;
      }
      checkString(wh.name, `${label}.name`, errors);
      checkString(wh.code, `${label}.code`, errors);
      checkEnum(wh.type, `${label}.type`, WAREHOUSE_TYPES, errors);
      if (wh.isDefault !== undefined && typeof wh.isDefault !== 'boolean') {
        errors.push(`${label}.isDefault debe ser booleano.`);
      }
      if (typeof wh.code === 'string' && wh.code) {
        if (warehouseCodes.has(wh.code)) {
          errors.push(`${label}.code "${wh.code}" está duplicado dentro de la plantilla.`);
        }
        warehouseCodes.add(wh.code);
      }
    });
  }

  checkArraySize(template.categories, 'categories', LIMITS.categories, errors);
  const categoryCodes = new Set<string>();
  if (Array.isArray(template.categories)) {
    template.categories.forEach((cat, i) => {
      const label = `categories[${i}]`;
      if (!isRecord(cat)) {
        errors.push(`${label} debe ser un objeto.`);
        return;
      }
      checkString(cat.name, `${label}.name`, errors);
      checkString(cat.code, `${label}.code`, errors);
      checkString(cat.description, `${label}.description`, errors, { required: false });
      if (typeof cat.code === 'string' && cat.code) {
        if (categoryCodes.has(cat.code)) {
          errors.push(`${label}.code "${cat.code}" está duplicado dentro de la plantilla.`);
        }
        categoryCodes.add(cat.code);
      }
    });
  }

  checkArraySize(template.cashRegisters, 'cashRegisters', LIMITS.cashRegisters, errors);
  if (Array.isArray(template.cashRegisters)) {
    template.cashRegisters.forEach((cr, i) => {
      const label = `cashRegisters[${i}]`;
      if (!isRecord(cr)) {
        errors.push(`${label} debe ser un objeto.`);
        return;
      }
      checkString(cr.name, `${label}.name`, errors);
      checkString(cr.code, `${label}.code`, errors);
      checkString(cr.warehouseCode, `${label}.warehouseCode`, errors);
      if (
        typeof cr.warehouseCode === 'string' &&
        cr.warehouseCode &&
        !warehouseCodes.has(cr.warehouseCode)
      ) {
        errors.push(
          `${label}.warehouseCode "${cr.warehouseCode}" no existe en warehouses de la plantilla.`,
        );
      }
    });
  }

  checkArraySize(template.products, 'products', LIMITS.products, errors);
  const productSkus = new Set<string>();
  if (Array.isArray(template.products)) {
    if (template.products.length === 0) {
      errors.push('products debe contener al menos un producto o insumo.');
    }
    template.products.forEach((prod, i) => {
      const label = `products[${i}]`;
      if (!isRecord(prod)) {
        errors.push(`${label} debe ser un objeto.`);
        return;
      }
      checkString(prod.name, `${label}.name`, errors);
      checkString(prod.sku, `${label}.sku`, errors);
      checkEnum(prod.productType, `${label}.productType`, PRODUCT_TYPES, errors);
      checkString(prod.categoryCode, `${label}.categoryCode`, errors, { required: false });
      if (
        typeof prod.categoryCode === 'string' &&
        prod.categoryCode &&
        !categoryCodes.has(prod.categoryCode)
      ) {
        errors.push(
          `${label}.categoryCode "${prod.categoryCode}" no existe en categories de la plantilla.`,
        );
      }
      checkEnum(prod.unitOfMeasure, `${label}.unitOfMeasure`, UNIT_OF_MEASURE, errors);
      checkNumber(prod.costUSD, `${label}.costUSD`, errors, { required: true, min: 0 });
      checkNumber(prod.priceUSD, `${label}.priceUSD`, errors, { required: true, min: 0 });
      checkNumber(prod.minStockAlert, `${label}.minStockAlert`, errors, {
        required: false,
        min: 0,
      });
      if (prod.taxRate !== undefined) {
        checkEnum(prod.taxRate, `${label}.taxRate`, TAX_RATES, errors);
      }
      checkString(prod.description, `${label}.description`, errors, { required: false });
      if (typeof prod.sku === 'string' && prod.sku) {
        if (productSkus.has(prod.sku)) {
          errors.push(`${label}.sku "${prod.sku}" está duplicado dentro de la plantilla.`);
        }
        productSkus.add(prod.sku);
      }
    });
  }

  // boms es opcional (p. ej. retail puro sin producción): sólo se valida si fue provisto.
  if (template.boms != null) {
    checkArraySize(template.boms, 'boms', LIMITS.boms, errors);
  }
  if (Array.isArray(template.boms)) {
    template.boms.forEach((bom, i) => {
      const label = `boms[${i}]`;
      if (!isRecord(bom)) {
        errors.push(`${label} debe ser un objeto.`);
        return;
      }
      checkString(bom.name, `${label}.name`, errors);
      checkString(bom.finishedProductSku, `${label}.finishedProductSku`, errors);
      if (
        typeof bom.finishedProductSku === 'string' &&
        bom.finishedProductSku &&
        !productSkus.has(bom.finishedProductSku)
      ) {
        errors.push(
          `${label}.finishedProductSku "${bom.finishedProductSku}" no existe en products de la plantilla.`,
        );
      }
      checkNumber(bom.outputQuantity, `${label}.outputQuantity`, errors, {
        required: true,
        min: 0.0001,
      });
      checkNumber(bom.laborCostUSD, `${label}.laborCostUSD`, errors, { required: false, min: 0 });
      checkNumber(bom.indirectCostsUSD, `${label}.indirectCostsUSD`, errors, {
        required: false,
        min: 0,
      });
      checkString(bom.instructions, `${label}.instructions`, errors, { required: false });

      checkArraySize(bom.items, `${label}.items`, LIMITS.bomItems, errors);
      if (Array.isArray(bom.items)) {
        if (bom.items.length === 0) {
          errors.push(`${label}.items debe contener al menos un insumo.`);
        }
        bom.items.forEach((item, j) => {
          const itemLabel = `${label}.items[${j}]`;
          if (!isRecord(item)) {
            errors.push(`${itemLabel} debe ser un objeto.`);
            return;
          }
          checkString(item.rawMaterialSku, `${itemLabel}.rawMaterialSku`, errors);
          if (
            typeof item.rawMaterialSku === 'string' &&
            item.rawMaterialSku &&
            !productSkus.has(item.rawMaterialSku)
          ) {
            errors.push(
              `${itemLabel}.rawMaterialSku "${item.rawMaterialSku}" no existe en products de la plantilla.`,
            );
          }
          checkNumber(item.quantity, `${itemLabel}.quantity`, errors, {
            required: true,
            min: 0.0001,
          });
          checkNumber(item.scrapFactorPercent, `${itemLabel}.scrapFactorPercent`, errors, {
            required: false,
            min: 0,
            max: 100,
          });
        });
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/** Versión para `validate` de campo Payload: devuelve `true` o el primer mensaje de error. */
export function isValidTemplateDefinition(value: unknown): true | string {
  const result = validateTemplateDefinition(value);
  return result.valid ? true : result.errors[0];
}
