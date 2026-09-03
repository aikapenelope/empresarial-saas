import type { PayloadRequest } from 'payload';
import { BUILTIN_TEMPLATES, type IndustryTemplateDefinition } from './definitions';

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
 * Aplica una plantilla industrial completa a un inquilino de forma atómica.
 * 
 * Siembra almacenes, categorías, cajas registradoras, productos (materias primas y terminados)
 * y fórmulas BOM conectadas entre sí con sus relaciones íntegras.
 */
export async function applyIndustryTemplateToTenant({
  tenantId,
  templateSlug,
  req,
}: ApplyTemplateOptions): Promise<ApplyTemplateResult> {
  const normalizedTenantId = typeof tenantId === 'object' && tenantId !== null
    ? (tenantId as { id: string | number }).id
    : tenantId;

  // 1. Validar existencia del Tenant
  const tenant = await req.payload.findByID({
    collection: 'tenants',
    id: String(normalizedTenantId),
    depth: 0,
    req,
  });

  if (!tenant) {
    throw new Error(`Inquilino con ID ${normalizedTenantId} no existe`);
  }

  // 2. Localizar plantilla
  const template: IndustryTemplateDefinition | undefined = BUILTIN_TEMPLATES.find(
    (t) => t.slug === templateSlug,
  );

  if (!template) {
    throw new Error(`Plantilla industrial con slug '${templateSlug}' no encontrada`);
  }

  const warehouseMap: Record<string, string | number> = {};
  const categoryMap: Record<string, string | number> = {};
  const productMap: Record<string, string | number> = {};

  let warehousesCreated = 0;
  let categoriesCreated = 0;
  let cashRegistersCreated = 0;
  let productsCreated = 0;
  let bomsCreated = 0;

  // 3. Crear Almacenes
  for (const wh of template.warehouses) {
    const existing = await req.payload.find({
      collection: 'warehouses',
      where: {
        and: [
          { tenant: { equals: normalizedTenantId } },
          { code: { equals: wh.code } },
        ],
      },
      limit: 1,
      depth: 0,
      req,
      overrideAccess: true,
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
          tenant: normalizedTenantId,
        } as any,
        req,
        overrideAccess: true,
      });
      warehouseMap[wh.code] = created.id;
      warehousesCreated++;
    }
  }

  // 4. Crear Categorías
  for (const cat of template.categories) {
    const existing = await req.payload.find({
      collection: 'categories',
      where: {
        and: [
          { tenant: { equals: normalizedTenantId } },
          { slug: { equals: cat.slug } },
        ],
      },
      limit: 1,
      depth: 0,
      req,
      overrideAccess: true,
    });

    if (existing.docs.length > 0) {
      categoryMap[cat.slug] = existing.docs[0].id;
    } else {
      const created = await req.payload.create({
        collection: 'categories',
        data: {
          name: cat.name,
          slug: cat.slug,
          description: cat.description,
          tenant: normalizedTenantId,
        } as any,
        req,
        overrideAccess: true,
      });
      categoryMap[cat.slug] = created.id;
      categoriesCreated++;
    }
  }

  // 5. Crear Cajas Registradoras
  for (const cr of template.cashRegisters) {
    const targetWhId = warehouseMap[cr.warehouseCode];
    if (targetWhId) {
      const existing = await req.payload.find({
        collection: 'cash-registers',
        where: {
          and: [
            { tenant: { equals: normalizedTenantId } },
            { code: { equals: cr.code } },
          ],
        },
        limit: 1,
        depth: 0,
        req,
        overrideAccess: true,
      });

      if (existing.docs.length === 0) {
        await req.payload.create({
          collection: 'cash-registers',
          data: {
            name: cr.name,
            code: cr.code,
            warehouse: targetWhId,
            tenant: normalizedTenantId,
            currentStatus: 'closed',
            active: true,
          } as any,
          req,
          overrideAccess: true,
        });
        cashRegistersCreated++;
      }
    }
  }

  // 6. Crear Productos e Insumos
  for (const prod of template.products) {
    const catId = categoryMap[prod.categorySlug];

    const existing = await req.payload.find({
      collection: 'products',
      where: {
        and: [
          { tenant: { equals: normalizedTenantId } },
          { sku: { equals: prod.sku } },
        ],
      },
      limit: 1,
      depth: 0,
      req,
      overrideAccess: true,
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
          category: catId,
          unitOfMeasure: prod.unitOfMeasure,
          pricing: {
            salePriceUSD: prod.salePriceUSD,
            wholesalePriceUSD: prod.wholesalePriceUSD || 0,
            costPriceUSD: prod.costPriceUSD,
            averageCostUSD: prod.costPriceUSD,
          },
          inventory: {
            stockQuantity: 0,
            minStock: prod.minStock || 0,
            reorderPoint: prod.reorderPoint || 0,
          },
          description: prod.description,
          tenant: normalizedTenantId,
        } as any,
        req,
        overrideAccess: true,
      });
      productMap[prod.sku] = created.id;
      productsCreated++;
    }
  }

  // 7. Crear Fórmulas BOM
  if (Array.isArray(template.boms)) {
    for (const bom of template.boms) {
      const finishedId = productMap[bom.finishedProductSku];
      if (!finishedId) continue;

      const components = bom.components
        .map((c) => {
          const rawId = productMap[c.rawMaterialSku];
          if (!rawId) return null;
          return {
            rawMaterial: rawId,
            quantity: c.quantity,
            unit: c.unit,
            scrapPercentage: c.scrapPercentage || 0,
          };
        })
        .filter(Boolean);

      const existing = await req.payload.find({
        collection: 'bill-of-materials',
        where: {
          and: [
            { tenant: { equals: normalizedTenantId } },
            { code: { equals: bom.code } },
          ],
        },
        limit: 1,
        depth: 0,
        req,
        overrideAccess: true,
      });

      if (existing.docs.length === 0) {
        await req.payload.create({
          collection: 'bill-of-materials',
          data: {
            name: bom.name,
            code: bom.code,
            finishedProduct: finishedId,
            yieldQuantity: bom.yieldQuantity,
            yieldUnit: bom.yieldUnit,
            version: bom.version || 'v1.0',
            status: 'active',
            components,
            costs: {
              laborCostUSD: bom.laborCostUSD || 0,
              overheadCostUSD: bom.overheadCostUSD || 0,
            },
            instructions: bom.instructions,
            tenant: normalizedTenantId,
          } as any,
          req,
          overrideAccess: true,
        });
        bomsCreated++;
      }
    }
  }

  return {
    success: true,
    message: `Plantilla '${template.name}' aplicada con éxito.`,
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
