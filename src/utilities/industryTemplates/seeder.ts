import type { PayloadRequest } from 'payload';
import { BUILTIN_TEMPLATES, type IndustryTemplateDefinition } from './definitions';
import { extractId } from '../cashLedger';

export interface ApplyTemplateOptions {
  tenantId: string | number;
  templateSlug: string;
  req: PayloadRequest;
}

export interface ApplyTemplateResult {
  success: boolean;
  message: string;
  templateName: string;
  stats: {
    warehousesCreated: number;
    categoriesCreated: number;
    cashRegistersCreated: number;
    productsCreated: number;
    bomsCreated: number;
  };
}

/**
 * Aplica una plantilla industrial completa a un inquilino de forma atómica e idempotente.
 * Siembra almacenes, categorías, cajas registradoras, productos (materias primas y terminados)
 * y recetas BOM respetando la integridad referencial y el aislamiento multi-tenant.
 */
export async function applyIndustryTemplateToTenant({
  tenantId,
  templateSlug,
  req,
}: ApplyTemplateOptions): Promise<ApplyTemplateResult> {
  const normTenantId = extractId(tenantId);
  if (!normTenantId) {
    throw new Error('Debe especificar un ID de inquilino válido.');
  }

  const numericTenantId = typeof normTenantId === 'number' ? normTenantId : Number(normTenantId);

  // 1. Validar existencia del Tenant
  const tenant = await req.payload.findByID({
    collection: 'tenants',
    id: numericTenantId,
    depth: 0,
    req,
  });

  if (!tenant) {
    throw new Error(`Inquilino con ID ${numericTenantId} no existe.`);
  }

  // 2. Localizar plantilla (DB-First para permitir personalizaciones dinámicas en BD, fallback a BUILTIN_TEMPLATES)
  let template: IndustryTemplateDefinition | undefined;

  const dbTemplate = await req.payload.find({
    collection: 'industry-templates',
    where: {
      and: [
        { slug: { equals: templateSlug } },
        { isPublished: { equals: true } },
      ],
    },
    limit: 1,
    depth: 0,
    req,
  });

  if (dbTemplate.docs.length > 0) {
    const doc = dbTemplate.docs[0] as unknown as {
      name: string;
      slug: string;
      description: string;
      industryType: 'food_production' | 'retail_health' | 'wholesale' | 'services';
      icon: string;
      templateData?: IndustryTemplateDefinition;
    };

    if (doc.templateData && typeof doc.templateData === 'object') {
      template = doc.templateData;
    }
  }

  if (!template) {
    template = BUILTIN_TEMPLATES.find((t) => t.slug === templateSlug);
  }

  if (!template) {
    throw new Error(`Plantilla industrial con slug '${templateSlug}' no encontrada o no está publicada.`);
  }

  const warehouseMap: Record<string, number> = {};
  const categoryMap: Record<string, number> = {};
  const productMap: Record<string, number> = {};

  let warehousesCreated = 0;
  let categoriesCreated = 0;
  let cashRegistersCreated = 0;
  let productsCreated = 0;
  let bomsCreated = 0;

  const warehouses = Array.isArray(template.warehouses) ? template.warehouses : [];
  const categories = Array.isArray(template.categories) ? template.categories : [];
  const cashRegisters = Array.isArray(template.cashRegisters) ? template.cashRegisters : [];
  const products = Array.isArray(template.products) ? template.products : [];
  const boms = Array.isArray(template.boms) ? template.boms : [];

  // 3. Crear Almacenes
  for (const wh of warehouses) {
    const existing = await req.payload.find({
      collection: 'warehouses',
      where: {
        and: [
          { tenant: { equals: numericTenantId } },
          { code: { equals: wh.code } },
        ],
      },
      limit: 1,
      depth: 0,
      req,
    });

    if (existing.docs.length > 0) {
      warehouseMap[wh.code] = existing.docs[0].id;
    } else {
      const created = await req.payload.create({
        collection: 'warehouses',
        data: {
          name: wh.name,
          code: wh.code,
          type: wh.type,
          isDefault: Boolean(wh.isDefault),
          isActive: true,
          tenant: numericTenantId,
        },
        req,
      });
      warehouseMap[wh.code] = created.id;
      warehousesCreated++;
    }
  }

  // 4. Crear Categorías
  for (const cat of categories) {
    const existing = await req.payload.find({
      collection: 'categories',
      where: {
        and: [
          { tenant: { equals: numericTenantId } },
          { code: { equals: cat.code } },
        ],
      },
      limit: 1,
      depth: 0,
      req,
    });

    if (existing.docs.length > 0) {
      categoryMap[cat.code] = existing.docs[0].id;
    } else {
      const created = await req.payload.create({
        collection: 'categories',
        data: {
          name: cat.name,
          code: cat.code,
          description: cat.description,
          isActive: true,
          tenant: numericTenantId,
        },
        req,
      });
      categoryMap[cat.code] = created.id;
      categoriesCreated++;
    }
  }

  // 5. Crear Cajas Registradoras
  for (const cr of cashRegisters) {
    const targetWhId = warehouseMap[cr.warehouseCode];
    if (targetWhId) {
      const existing = await req.payload.find({
        collection: 'cash-registers',
        where: {
          and: [
            { tenant: { equals: numericTenantId } },
            { code: { equals: cr.code } },
          ],
        },
        limit: 1,
        depth: 0,
        req,
      });

      if (existing.docs.length === 0) {
        await req.payload.create({
          collection: 'cash-registers',
          data: {
            name: cr.name,
            code: cr.code,
            warehouse: targetWhId,
            tenant: numericTenantId,
            currentStatus: 'closed',
            active: true,
          },
          req,
        });
        cashRegistersCreated++;
      }
    }
  }

  // 6. Crear Productos e Insumos
  for (const prod of products) {
    const catId = categoryMap[prod.categoryCode];

    const existing = await req.payload.find({
      collection: 'products',
      where: {
        and: [
          { tenant: { equals: numericTenantId } },
          { sku: { equals: prod.sku } },
        ],
      },
      limit: 1,
      depth: 0,
      req,
    });

    if (existing.docs.length > 0) {
      productMap[prod.sku] = existing.docs[0].id;
    } else {
      const created = await req.payload.create({
        collection: 'products',
        data: {
          name: prod.name,
          sku: prod.sku,
          productType: prod.productType,
          category: catId ?? null,
          unitOfMeasure: prod.unitOfMeasure,
          costUSD: prod.costUSD,
          priceUSD: prod.priceUSD,
          minStockAlert: prod.minStockAlert ?? 0,
          taxRate: prod.taxRate ?? 'exempt',
          currentStock: 0,
          tenant: numericTenantId,
        },
        req,
      });
      productMap[prod.sku] = created.id;
      productsCreated++;
    }
  }

  // 7. Crear Recetas / Fórmulas BOM
  if (boms.length > 0) {
    for (const bom of boms) {
      const finishedId = productMap[bom.finishedProductSku];
      if (!finishedId) continue;

      const rawItems = Array.isArray(bom.items) ? bom.items : [];
      const items = rawItems
        .map((item) => {
          const rawId = productMap[item.rawMaterialSku];
          if (!rawId) return null;
          return {
            rawMaterial: rawId,
            quantity: item.quantity,
            scrapFactorPercent: item.scrapFactorPercent ?? 0,
          };
        })
        .filter(Boolean) as Array<{
          rawMaterial: number;
          quantity: number;
          scrapFactorPercent: number;
        }>;

      if (items.length === 0) continue;

      const existing = await req.payload.find({
        collection: 'bill-of-materials',
        where: {
          and: [
            { tenant: { equals: numericTenantId } },
            { product: { equals: finishedId } },
          ],
        },
        limit: 1,
        depth: 0,
        req,
      });

      if (existing.docs.length === 0) {
        await req.payload.create({
          collection: 'bill-of-materials',
          data: {
            name: bom.name,
            product: finishedId,
            outputQuantity: bom.outputQuantity,
            items,
            laborCostUSD: bom.laborCostUSD ?? 0,
            indirectCostsUSD: bom.indirectCostsUSD ?? 0,
            instructions: bom.instructions,
            isActive: true,
            tenant: numericTenantId,
          },
          req,
        });
        bomsCreated++;
      }
    }
  }

  return {
    success: true,
    message: `Plantilla '${template.name}' aplicada exitosamente al inquilino ${tenant.name}.`,
    templateName: template.name,
    stats: {
      warehousesCreated,
      categoriesCreated,
      cashRegistersCreated,
      productsCreated,
      bomsCreated,
    },
  };
}
