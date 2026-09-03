export interface TemplateCategory {
  name: string;
  slug: string;
  description?: string;
}

export interface TemplateWarehouse {
  name: string;
  code: string;
  type: 'general' | 'raw_materials' | 'production_floor' | 'transit';
  isDefault?: boolean;
}

export interface TemplateCashRegister {
  name: string;
  code: string;
  warehouseCode: string;
}

export interface TemplateProduct {
  name: string;
  sku: string;
  productType: 'standard' | 'raw_material' | 'manufactured' | 'combo';
  categorySlug: string;
  unitOfMeasure: 'unit' | 'kg' | 'g' | 'l' | 'ml' | 'm' | 'box' | 'pack';
  costPriceUSD: number;
  salePriceUSD: number;
  wholesalePriceUSD?: number;
  minStock?: number;
  reorderPoint?: number;
  description?: string;
}

export interface TemplateBOMComponent {
  rawMaterialSku: string;
  quantity: number;
  unit: string;
  scrapPercentage?: number;
}

export interface TemplateBOM {
  name: string;
  code: string;
  finishedProductSku: string;
  yieldQuantity: number;
  yieldUnit: 'unit' | 'kg' | 'g' | 'l' | 'box' | 'pack';
  version?: string;
  laborCostUSD?: number;
  overheadCostUSD?: number;
  instructions?: string;
  components: TemplateBOMComponent[];
}

export interface IndustryTemplateDefinition {
  name: string;
  slug: string;
  description: string;
  industryType: 'food_production' | 'retail_health' | 'wholesale' | 'services';
  icon: string;
  warehouses: TemplateWarehouse[];
  categories: TemplateCategory[];
  cashRegisters: TemplateCashRegister[];
  products: TemplateProduct[];
  boms?: TemplateBOM[];
}

export const BUILTIN_TEMPLATES: IndustryTemplateDefinition[] = [
  // 1. Panadería, Repostería y Fábrica de Alimentos (con BOM)
  {
    name: 'Panadería & Pastelería Industrial (BOM)',
    slug: 'bakery-production',
    description: 'Estructura lista para panaderías y obradores con fórmulas BOM, recetas de pan y pastelería, control de mermas y silos de materia prima.',
    industryType: 'food_production',
    icon: 'Croissant',
    warehouses: [
      { name: 'Silo de Harinas e Insumos', code: 'ALM-MAT-01', type: 'raw_materials', isDefault: false },
      { name: 'Obrador y Planta de Horneado', code: 'ALM-PROD-01', type: 'production_floor', isDefault: false },
      { name: 'Tienda y Despacho Principal', code: 'ALM-TIENDA-01', type: 'general', isDefault: true },
    ],
    categories: [
      { name: 'Materias Primas & Harinas', slug: 'materias-primas', description: 'Insumos básicos de panificación' },
      { name: 'Panadería Salada Tradicional', slug: 'panaderia-salada', description: 'Panes de mesa, canillas y campesinos' },
      { name: 'Repostería & Bollería Dulce', slug: 'reposteria-dulce', description: 'Croissants, hojaldres y pasteles' },
    ],
    cashRegisters: [
      { name: 'Caja Mostrador 01', code: 'CAJA-MOST-01', warehouseCode: 'ALM-TIENDA-01' },
      { name: 'Caja Cafetería 02', code: 'CAJA-CAFE-02', warehouseCode: 'ALM-TIENDA-01' },
    ],
    products: [
      // Materias Primas
      { name: 'Harina de Trigo Panadera Especial', sku: 'MP-HAR-01', productType: 'raw_material', categorySlug: 'materias-primas', unitOfMeasure: 'kg', costPriceUSD: 0.95, salePriceUSD: 0 },
      { name: 'Levadura Fresca Prensada', sku: 'MP-LEV-01', productType: 'raw_material', categorySlug: 'materias-primas', unitOfMeasure: 'kg', costPriceUSD: 2.20, salePriceUSD: 0 },
      { name: 'Manteca Vegetal Repostería', sku: 'MP-MAN-01', productType: 'raw_material', categorySlug: 'materias-primas', unitOfMeasure: 'kg', costPriceUSD: 1.80, salePriceUSD: 0 },
      { name: 'Azúcar Refinada Industrial', sku: 'MP-AZU-01', productType: 'raw_material', categorySlug: 'materias-primas', unitOfMeasure: 'kg', costPriceUSD: 1.10, salePriceUSD: 0 },
      { name: 'Sal Marina Fina', sku: 'MP-SAL-01', productType: 'raw_material', categorySlug: 'materias-primas', unitOfMeasure: 'kg', costPriceUSD: 0.35, salePriceUSD: 0 },
      // Productos Terminados (Manufacturados)
      { name: 'Pan Canilla Tradicional 250g', sku: 'PT-CAN-01', productType: 'manufactured', categorySlug: 'panaderia-salada', unitOfMeasure: 'unit', costPriceUSD: 0.22, salePriceUSD: 0.75, wholesalePriceUSD: 0.55, minStock: 50 },
      { name: 'Pan Campesino Rústico 500g', sku: 'PT-CAM-01', productType: 'manufactured', categorySlug: 'panaderia-salada', unitOfMeasure: 'unit', costPriceUSD: 0.45, salePriceUSD: 1.50, wholesalePriceUSD: 1.20, minStock: 25 },
      { name: 'Croissant Mantequilla Artesanal', sku: 'PT-CRO-01', productType: 'manufactured', categorySlug: 'reposteria-dulce', unitOfMeasure: 'unit', costPriceUSD: 0.40, salePriceUSD: 1.75, wholesalePriceUSD: 1.35, minStock: 30 },
    ],
    boms: [
      {
        name: 'Fórmula Lote Base Pan Canilla (100 unidades)',
        code: 'BOM-CAN-100',
        finishedProductSku: 'PT-CAN-01',
        yieldQuantity: 100,
        yieldUnit: 'unit',
        version: 'v1.0',
        laborCostUSD: 4.50,
        overheadCostUSD: 2.50,
        instructions: 'Amasado durante 12 minutos, reposo en bloque 20 min, formado en piezas de 280g, fermentación en cámara 90 min a 28°C y horneado a 220°C con vapor 18 minutos.',
        components: [
          { rawMaterialSku: 'MP-HAR-01', quantity: 16.0, unit: 'kg', scrapPercentage: 1.5 },
          { rawMaterialSku: 'MP-LEV-01', quantity: 0.4, unit: 'kg', scrapPercentage: 0 },
          { rawMaterialSku: 'MP-MAN-01', quantity: 0.6, unit: 'kg', scrapPercentage: 0 },
          { rawMaterialSku: 'MP-AZU-01', quantity: 0.5, unit: 'kg', scrapPercentage: 0 },
          { rawMaterialSku: 'MP-SAL-01', quantity: 0.3, unit: 'kg', scrapPercentage: 0 },
        ],
      },
    ],
  },

  // 2. Farmacia, Droguería & Retail Salud
  {
    name: 'Farmacia & Droguería Comercial',
    slug: 'pharmacy-retail',
    description: 'Catálogo de medicamentos clasificados por especialidad, principios activos, stock crítico y múltiples puntos de venta.',
    industryType: 'retail_health',
    icon: 'Pill',
    warehouses: [
      { name: 'Almacén Central de Droguería', code: 'ALM-FARM-DEP', type: 'general', isDefault: false },
      { name: 'Piso de Venta / Farmacia Mostrador', code: 'ALM-FARM-VENTA', type: 'general', isDefault: true },
    ],
    categories: [
      { name: 'Analgésicos & Antiinflamatorios', slug: 'analgesicos', description: 'Alivio de dolor y fiebre' },
      { name: 'Antibióticos & Antimicrobianos', slug: 'antibioticos', description: 'Tratamiento de infecciones bajo prescripción' },
      { name: 'Vitaminas & Suplementos', slug: 'vitaminas', description: 'Salud preventiva y nutrición' },
      { name: 'Cuidado Personal e Higiene', slug: 'higiene', description: 'Artículos de tocador y aseo' },
    ],
    cashRegisters: [
      { name: 'Caja Principal Farmacia 01', code: 'CAJA-FARM-01', warehouseCode: 'ALM-FARM-VENTA' },
      { name: 'Caja Rápida 02', code: 'CAJA-FARM-02', warehouseCode: 'ALM-FARM-VENTA' },
    ],
    products: [
      { name: 'Acetaminofén 500mg (Caja 20 tabletas)', sku: 'MED-ACE-500', productType: 'standard', categorySlug: 'analgesicos', unitOfMeasure: 'box', costPriceUSD: 1.20, salePriceUSD: 2.50, minStock: 20, reorderPoint: 40 },
      { name: 'Ibuprofeno 400mg (Caja 10 cápsulas)', sku: 'MED-IBU-400', productType: 'standard', categorySlug: 'analgesicos', unitOfMeasure: 'box', costPriceUSD: 1.45, salePriceUSD: 3.10, minStock: 15, reorderPoint: 30 },
      { name: 'Amoxicilina 500mg (Caja 14 cápsulas)', sku: 'MED-AMX-500', productType: 'standard', categorySlug: 'antibioticos', unitOfMeasure: 'box', costPriceUSD: 2.80, salePriceUSD: 6.20, minStock: 10, reorderPoint: 25 },
      { name: 'Vitamina C 1000mg Efervescente (Tubo 10)', sku: 'MED-VIT-C10', productType: 'standard', categorySlug: 'vitaminas', unitOfMeasure: 'unit', costPriceUSD: 2.10, salePriceUSD: 4.80, minStock: 15, reorderPoint: 35 },
    ],
  },

  // 3. Distribuidora Mayorista de Alimentos & Consumo Masivo
  {
    name: 'Distribuidora Mayorista de Alimentos',
    slug: 'wholesale-distribution',
    description: 'Gestión bulto/detalle, precios mayoristas diferenciados y bodegas de despacho logístico masivo.',
    industryType: 'wholesale',
    icon: 'Truck',
    warehouses: [
      { name: 'Galpón Central de Despacho Masivo', code: 'ALM-GALPON-01', type: 'general', isDefault: true },
      { name: 'Bahía de Tránsito y Carga Pesada', code: 'ALM-TRANSITO-01', type: 'transit', isDefault: false },
    ],
    categories: [
      { name: 'Granos, Arroz & Legumbres', slug: 'granos-arroz', description: 'Venta por sacos y fardos' },
      { name: 'Aceites & Grasas Comestibles', slug: 'aceites', description: 'Cajas de botellas' },
      { name: 'Enlatados & Conservas', slug: 'enlatados', description: 'Cajas de conservas' },
    ],
    cashRegisters: [
      { name: 'Caja Cobranzas Mayorista 01', code: 'CAJA-MAYOR-01', warehouseCode: 'ALM-GALPON-01' },
    ],
    products: [
      { name: 'Arroz Blanco Tipo I (Fardo 24x1kg)', sku: 'MAY-ARR-24', productType: 'standard', categorySlug: 'granos-arroz', unitOfMeasure: 'pack', costPriceUSD: 21.50, salePriceUSD: 27.50, wholesalePriceUSD: 24.50, minStock: 100, reorderPoint: 200 },
      { name: 'Aceite Vegetal de Girasol (Caja 12x1L)', sku: 'MAY-ACE-12', productType: 'standard', categorySlug: 'aceites', unitOfMeasure: 'box', costPriceUSD: 26.00, salePriceUSD: 33.00, wholesalePriceUSD: 29.50, minStock: 80, reorderPoint: 150 },
      { name: 'Atún Desmenuzado en Aceite (Caja 48x140g)', sku: 'MAY-ATU-48', productType: 'standard', categorySlug: 'enlatados', unitOfMeasure: 'box', costPriceUSD: 42.00, salePriceUSD: 54.00, wholesalePriceUSD: 48.00, minStock: 50, reorderPoint: 100 },
    ],
  },
];
