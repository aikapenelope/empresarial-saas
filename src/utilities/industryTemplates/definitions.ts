export interface TemplateWarehouse {
  name: string;
  code: string;
  type: 'main' | 'raw_materials' | 'work_in_progress' | 'scrap' | 'retail';
  isDefault?: boolean;
}

export interface TemplateCategory {
  name: string;
  code: string;
  description?: string;
}

export interface TemplateCashRegister {
  name: string;
  code: string;
  warehouseCode: string;
}

export interface TemplateProduct {
  name: string;
  sku: string;
  productType: 'standard' | 'raw_material' | 'manufactured' | 'service';
  categoryCode: string;
  unitOfMeasure: 'unit' | 'kg' | 'g' | 'l' | 'ml' | 'm' | 'box';
  costUSD: number;
  priceUSD: number;
  minStockAlert?: number;
  taxRate?: 'exempt' | 'general' | 'reduced';
  description?: string;
}

export interface TemplateBOMItem {
  rawMaterialSku: string;
  quantity: number;
  scrapFactorPercent?: number;
}

export interface TemplateBOM {
  name: string;
  finishedProductSku: string;
  outputQuantity: number;
  laborCostUSD?: number;
  indirectCostsUSD?: number;
  instructions?: string;
  items: TemplateBOMItem[];
}

export interface IndustryTemplateDefinition {
  name: string;
  slug: string;
  description: string;
  industryType: 'food_production' | 'retail_health' | 'wholesale' | 'services';
  icon: string;
  defaultPaymentMethods?: string[];
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
    description:
      'Estructura lista para panaderías y obradores con fórmulas BOM, recetas de pan y pastelería, control de mermas y silos de materia prima.',
    industryType: 'food_production',
    icon: 'Croissant',
    defaultPaymentMethods: ['cash_usd', 'cash_ves', 'pos_ves', 'pago_movil', 'zelle'],
    warehouses: [
      {
        name: 'Silo de Harinas e Insumos',
        code: 'ALM-MAT-01',
        type: 'raw_materials',
        isDefault: false,
      },
      {
        name: 'Obrador y Planta de Horneado',
        code: 'ALM-PROD-01',
        type: 'work_in_progress',
        isDefault: false,
      },
      {
        name: 'Tienda y Despacho Principal',
        code: 'ALM-TIENDA-01',
        type: 'main',
        isDefault: true,
      },
    ],
    categories: [
      {
        name: 'Materias Primas & Harinas',
        code: 'CAT-MAT',
        description: 'Insumos básicos de panificación',
      },
      {
        name: 'Panadería Salada Tradicional',
        code: 'CAT-PAN',
        description: 'Panes de mesa, canillas y campesinos',
      },
      {
        name: 'Repostería & Bollería Dulce',
        code: 'CAT-REP',
        description: 'Croissants, hojaldres y pasteles',
      },
    ],
    cashRegisters: [
      { name: 'Caja Mostrador 01', code: 'CAJA-MOST-01', warehouseCode: 'ALM-TIENDA-01' },
      { name: 'Caja Cafetería 02', code: 'CAJA-CAFE-02', warehouseCode: 'ALM-TIENDA-01' },
    ],
    products: [
      // Materias Primas
      {
        name: 'Harina de Trigo Panadera Especial',
        sku: 'MP-HAR-01',
        productType: 'raw_material',
        categoryCode: 'CAT-MAT',
        unitOfMeasure: 'kg',
        costUSD: 0.95,
        priceUSD: 0,
        taxRate: 'exempt',
      },
      {
        name: 'Levadura Fresca Prensada',
        sku: 'MP-LEV-01',
        productType: 'raw_material',
        categoryCode: 'CAT-MAT',
        unitOfMeasure: 'kg',
        costUSD: 2.2,
        priceUSD: 0,
        taxRate: 'exempt',
      },
      {
        name: 'Manteca Vegetal Repostería',
        sku: 'MP-MAN-01',
        productType: 'raw_material',
        categoryCode: 'CAT-MAT',
        unitOfMeasure: 'kg',
        costUSD: 1.8,
        priceUSD: 0,
        taxRate: 'general',
      },
      {
        name: 'Azúcar Refinada Industrial',
        sku: 'MP-AZU-01',
        productType: 'raw_material',
        categoryCode: 'CAT-MAT',
        unitOfMeasure: 'kg',
        costUSD: 1.1,
        priceUSD: 0,
        taxRate: 'exempt',
      },
      {
        name: 'Sal Marina Fina',
        sku: 'MP-SAL-01',
        productType: 'raw_material',
        categoryCode: 'CAT-MAT',
        unitOfMeasure: 'kg',
        costUSD: 0.35,
        priceUSD: 0,
        taxRate: 'exempt',
      },
      // Productos Terminados (Manufacturados)
      {
        name: 'Pan Canilla Tradicional 250g',
        sku: 'PT-CAN-01',
        productType: 'manufactured',
        categoryCode: 'CAT-PAN',
        unitOfMeasure: 'unit',
        costUSD: 0.22,
        priceUSD: 0.75,
        minStockAlert: 50,
        taxRate: 'exempt',
      },
      {
        name: 'Pan Campesino Rústico 500g',
        sku: 'PT-CAM-01',
        productType: 'manufactured',
        categoryCode: 'CAT-PAN',
        unitOfMeasure: 'unit',
        costUSD: 0.45,
        priceUSD: 1.5,
        minStockAlert: 25,
        taxRate: 'exempt',
      },
      {
        name: 'Croissant Mantequilla Artesanal',
        sku: 'PT-CRO-01',
        productType: 'manufactured',
        categoryCode: 'CAT-REP',
        unitOfMeasure: 'unit',
        costUSD: 0.4,
        priceUSD: 1.75,
        minStockAlert: 30,
        taxRate: 'general',
      },
    ],
    boms: [
      {
        name: 'Fórmula Lote Base Pan Canilla (100 unidades)',
        finishedProductSku: 'PT-CAN-01',
        outputQuantity: 100,
        laborCostUSD: 4.5,
        indirectCostsUSD: 2.5,
        instructions:
          'Amasado durante 12 minutos, reposo en bloque 20 min, formado en piezas de 280g, fermentación en cámara 90 min a 28°C y horneado a 220°C con vapor 18 minutos.',
        items: [
          { rawMaterialSku: 'MP-HAR-01', quantity: 16.0, scrapFactorPercent: 1.5 },
          { rawMaterialSku: 'MP-LEV-01', quantity: 0.4, scrapFactorPercent: 0 },
          { rawMaterialSku: 'MP-MAN-01', quantity: 0.6, scrapFactorPercent: 0 },
          { rawMaterialSku: 'MP-AZU-01', quantity: 0.5, scrapFactorPercent: 0 },
          { rawMaterialSku: 'MP-SAL-01', quantity: 0.3, scrapFactorPercent: 0 },
        ],
      },
    ],
  },

  // 2. Farmacia, Droguería & Retail Salud
  {
    name: 'Farmacia & Droguería Comercial',
    slug: 'pharmacy-retail',
    description:
      'Catálogo de medicamentos clasificados por especialidad, principios activos, stock crítico y múltiples puntos de venta.',
    industryType: 'retail_health',
    icon: 'Pill',
    defaultPaymentMethods: ['cash_usd', 'cash_ves', 'pos_ves', 'pago_movil', 'zelle'],
    warehouses: [
      {
        name: 'Almacén Central de Droguería',
        code: 'ALM-FARM-DEP',
        type: 'main',
        isDefault: false,
      },
      {
        name: 'Piso de Venta / Farmacia Mostrador',
        code: 'ALM-FARM-VENTA',
        type: 'retail',
        isDefault: true,
      },
    ],
    categories: [
      {
        name: 'Analgésicos & Antiinflamatorios',
        code: 'CAT-MED-ANA',
        description: 'Alivio de dolor y fiebre',
      },
      {
        name: 'Antibióticos & Antimicrobianos',
        code: 'CAT-MED-ANT',
        description: 'Tratamiento de infecciones bajo prescripción médica',
      },
      {
        name: 'Vitaminas & Suplementos',
        code: 'CAT-MED-VIT',
        description: 'Salud preventiva y nutrición',
      },
      {
        name: 'Cuidado Personal e Higiene',
        code: 'CAT-MED-HIG',
        description: 'Artículos de tocador y aseo',
      },
    ],
    cashRegisters: [
      { name: 'Caja Principal Farmacia 01', code: 'CAJA-FARM-01', warehouseCode: 'ALM-FARM-VENTA' },
      { name: 'Caja Rápida 02', code: 'CAJA-FARM-02', warehouseCode: 'ALM-FARM-VENTA' },
    ],
    products: [
      {
        name: 'Acetaminofén 500mg (Caja 20 tabletas)',
        sku: 'MED-ACE-500',
        productType: 'standard',
        categoryCode: 'CAT-MED-ANA',
        unitOfMeasure: 'box',
        costUSD: 1.2,
        priceUSD: 2.5,
        minStockAlert: 20,
        taxRate: 'exempt',
      },
      {
        name: 'Ibuprofeno 400mg (Caja 10 cápsulas)',
        sku: 'MED-IBU-400',
        productType: 'standard',
        categoryCode: 'CAT-MED-ANA',
        unitOfMeasure: 'box',
        costUSD: 1.45,
        priceUSD: 3.1,
        minStockAlert: 15,
        taxRate: 'exempt',
      },
      {
        name: 'Amoxicilina 500mg (Caja 14 cápsulas)',
        sku: 'MED-AMX-500',
        productType: 'standard',
        categoryCode: 'CAT-MED-ANT',
        unitOfMeasure: 'box',
        costUSD: 2.8,
        priceUSD: 6.2,
        minStockAlert: 10,
        taxRate: 'exempt',
      },
      {
        name: 'Vitamina C 1000mg Efervescente (Tubo 10)',
        sku: 'MED-VIT-C10',
        productType: 'standard',
        categoryCode: 'CAT-MED-VIT',
        unitOfMeasure: 'unit',
        costUSD: 2.1,
        priceUSD: 4.8,
        minStockAlert: 15,
        taxRate: 'general',
      },
    ],
  },

  // 3. Distribuidora Mayorista de Alimentos & Consumo Masivo
  {
    name: 'Distribuidora Mayorista de Alimentos',
    slug: 'wholesale-distribution',
    description:
      'Gestión de bulto y fardos, precios mayoristas diferenciados y bodegas de despacho logístico masivo.',
    industryType: 'wholesale',
    icon: 'Truck',
    defaultPaymentMethods: ['cash_usd', 'transfer_ves', 'pago_movil', 'zelle', 'binance'],
    warehouses: [
      {
        name: 'Galpón Central de Despacho Masivo',
        code: 'ALM-GALPON-01',
        type: 'main',
        isDefault: true,
      },
      {
        name: 'Punto de Venta Mayorista',
        code: 'ALM-PUNTO-01',
        type: 'retail',
        isDefault: false,
      },
    ],
    categories: [
      {
        name: 'Granos, Arroz & Legumbres',
        code: 'CAT-MAY-GRA',
        description: 'Venta por sacos y fardos cerrados',
      },
      {
        name: 'Aceites & Grasas Comestibles',
        code: 'CAT-MAY-ACE',
        description: 'Cajas de botellas y bidones',
      },
      {
        name: 'Enlatados & Conservas',
        code: 'CAT-MAY-ENL',
        description: 'Cajas de conservas y salsas',
      },
    ],
    cashRegisters: [
      { name: 'Caja Cobranzas Mayorista 01', code: 'CAJA-MAYOR-01', warehouseCode: 'ALM-GALPON-01' },
    ],
    products: [
      {
        name: 'Arroz Blanco Tipo I (Fardo 24x1kg)',
        sku: 'MAY-ARR-24',
        productType: 'standard',
        categoryCode: 'CAT-MAY-GRA',
        unitOfMeasure: 'box',
        costUSD: 21.5,
        priceUSD: 27.5,
        minStockAlert: 100,
        taxRate: 'exempt',
      },
      {
        name: 'Aceite Vegetal de Girasol (Caja 12x1L)',
        sku: 'MAY-ACE-12',
        productType: 'standard',
        categoryCode: 'CAT-MAY-ACE',
        unitOfMeasure: 'box',
        costUSD: 26.0,
        priceUSD: 33.0,
        minStockAlert: 80,
        taxRate: 'general',
      },
      {
        name: 'Atún Desmenuzado en Aceite (Caja 48x140g)',
        sku: 'MAY-ATU-48',
        productType: 'standard',
        categoryCode: 'CAT-MAY-ENL',
        unitOfMeasure: 'box',
        costUSD: 42.0,
        priceUSD: 54.0,
        minStockAlert: 50,
        taxRate: 'general',
      },
    ],
  },
];
