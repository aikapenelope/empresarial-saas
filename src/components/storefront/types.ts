export interface ProductProjection {
  id: number;
  name: string;
  sku: string;
  priceUSD: number;
  description?: string | null;
  categoryName?: string | null;
  unitOfMeasure?: string | null;
  currentStock: number;
  trackInventory: boolean;
  imageUrl?: string | null;
}

export interface StorefrontCategory {
  id: number;
  name: string;
}

export interface StorefrontTenantInfo {
  id: number;
  name: string;
  slug: string;
  rifFiscal?: string | null;
  phone?: string | null;
  whatsappOrdersNumber?: string | null;
  portalTitle?: string | null;
  portalDescription?: string | null;
  tagline?: string | null;
  announcementText?: string | null;
  deliveryPolicy?: string | null;
  bcvRate: number;
}

export interface CartItem {
  product: ProductProjection;
  quantity: number;
}
