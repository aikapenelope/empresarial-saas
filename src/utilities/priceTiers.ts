/**
 * Utilidades puras de tiers de precio — sin dependencias de Payload,
 * importables desde componentes cliente y servidor por igual.
 *
 * Modelo bimonetario: el margen se fija en USD (tier `retail` = priceUSD base);
 * el VES siempre se deriva con la tasa snapshot del documento.
 */

export type PriceTier = 'retail' | 'wholesale' | 'vendor' | 'promo';

export interface ProductWithTiers {
  priceUSD?: number | null;
  priceTiers?: Array<{ tier: string; priceUSD?: number | null }> | null;
}

/** Precio efectivo de un producto para un tier de cliente (fallback: retail). */
export function effectivePriceForTier(
  product: ProductWithTiers,
  tier: string | null | undefined,
): number {
  const base = Number(product.priceUSD) || 0;
  if (!tier || tier === 'retail') return base;
  const entry = (product.priceTiers || []).find((t) => t.tier === tier);
  return entry && entry.priceUSD != null ? Number(entry.priceUSD) : base;
}
