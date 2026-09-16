'use client';

import React from 'react';
import Image from 'next/image';
import { Package, Plus, Minus, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatUSD, formatVES } from '@/components/erp/format';
import type { ProductProjection } from './types';

interface StorefrontProductCardProps {
  product: ProductProjection;
  bcvRate: number;
  quantityInCart: number;
  onAddToCart: (product: ProductProjection) => void;
  onUpdateQuantity: (productId: number, quantity: number) => void;
  onQuickView?: (product: ProductProjection) => void;
}

export const StorefrontProductCard: React.FC<StorefrontProductCardProps> = ({
  product,
  bcvRate,
  quantityInCart,
  onAddToCart,
  onUpdateQuantity,
  onQuickView,
}) => {
  const isAvailable = !product.trackInventory || product.currentStock > 0;
  const priceVES = bcvRate > 0 ? product.priceUSD * bcvRate : 0;

  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-foreground/30 hover:shadow-sm">
      {/* Product Image Container */}
      <div
        className="relative aspect-square w-full overflow-hidden bg-muted/20 cursor-pointer"
        onClick={() => onQuickView?.(product)}
      >

        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <Package className="h-12 w-12 stroke-[1.25]" />
          </div>
        )}

        {/* Stock Badge Overlay */}
        <div className="absolute top-2.5 left-2.5">
          {isAvailable ? (
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 text-[10px] font-semibold text-emerald-400 backdrop-blur-sm"
            >
              En Existencia
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-[10px] font-semibold text-amber-400 backdrop-blur-sm"
            >
              Bajo Pedido
            </Badge>
          )}
        </div>

        {product.categoryName && (
          <div className="absolute top-2.5 right-2.5">
            <span className="rounded-md border border-border bg-background/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur-sm">
              {product.categoryName}
            </span>
          </div>
        )}

        {/* Quick View Hover Indicator */}
        {onQuickView && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-background/95 px-3 py-1 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur-xs">
              <Eye className="h-3.5 w-3.5" />
              Vista Rápida
            </span>
          </div>
        )}
      </div>

      {/* Content details */}
      <div className="flex flex-1 flex-col justify-between p-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-muted-foreground tracking-wider uppercase">
              {product.sku}
            </span>
            {product.unitOfMeasure && (
              <span className="text-[11px] text-muted-foreground font-medium lowercase">
                /{product.unitOfMeasure}
              </span>
            )}
          </div>

          <h3
            className="mt-1 font-semibold text-sm leading-snug text-foreground line-clamp-2 cursor-pointer hover:underline"
            onClick={() => onQuickView?.(product)}
          >
            {product.name}
          </h3>

          {product.description && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {product.description}
            </p>
          )}
        </div>

        {/* Pricing & Cart Action */}
        <div className="mt-4 pt-3 border-t border-border/60">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <span className="text-base font-bold text-foreground tracking-tight">
                {formatUSD(product.priceUSD)}
              </span>
              {priceVES > 0 && (
                <span className="block text-[11px] text-muted-foreground font-mono">
                  {formatVES(priceVES)}
                </span>
              )}
            </div>
          </div>

          {quantityInCart > 0 ? (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md hover:bg-background"
                onClick={() => onUpdateQuantity(product.id, quantityInCart - 1)}
                aria-label="Disminuir cantidad"
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="font-mono text-xs font-bold text-foreground">
                {quantityInCart}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md hover:bg-background"
                onClick={() => onUpdateQuantity(product.id, quantityInCart + 1)}
                aria-label="Aumentar cantidad"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              variant="default"
              size="sm"
              className="w-full text-xs font-semibold"
              onClick={() => onAddToCart(product)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Agregar al Pedido
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
