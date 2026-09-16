'use client';

import React from 'react';
import Image from 'next/image';
import { Package, Plus, Minus, Check, Layers } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatUSD, formatVES } from '@/components/erp/format';
import type { ProductProjection } from './types';

interface StorefrontQuickViewModalProps {
  product: ProductProjection | null;
  isOpen: boolean;
  onClose: () => void;
  bcvRate: number;
  quantityInCart: number;
  onAddToCart: (product: ProductProjection) => void;
  onUpdateQuantity: (productId: number, quantity: number) => void;
}

export const StorefrontQuickViewModal: React.FC<StorefrontQuickViewModalProps> = ({
  product,
  isOpen,
  onClose,
  bcvRate,
  quantityInCart,
  onAddToCart,
  onUpdateQuantity,
}) => {
  if (!product) return null;

  const isAvailable = !product.trackInventory || product.currentStock > 0;
  const priceVES = bcvRate > 0 ? product.priceUSD * bcvRate : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl overflow-hidden p-0 sm:rounded-2xl border-border bg-card">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Left Column: Product Image */}
          <div className="relative aspect-square w-full bg-muted/20 overflow-hidden md:border-r border-border">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                <Package className="h-20 w-20 stroke-[1]" />
              </div>
            )}

            {/* Availability Badge */}
            <div className="absolute top-3 left-3">
              {isAvailable ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/15 text-xs font-semibold text-emerald-400 backdrop-blur-md"
                >
                  En Existencia
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/15 text-xs font-semibold text-amber-400 backdrop-blur-md"
                >
                  Bajo Pedido
                </Badge>
              )}
            </div>

            {product.categoryName && (
              <div className="absolute top-3 right-3">
                <span className="rounded-md border border-border bg-background/85 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur-md">
                  {product.categoryName}
                </span>
              </div>
            )}
          </div>

          {/* Right Column: Product Details & Purchase Actions */}
          <div className="flex flex-col justify-between p-6 sm:p-8 space-y-6">
            <div className="space-y-4">
              <DialogHeader className="text-left space-y-1.5 p-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground tracking-wider uppercase">
                    SKU: {product.sku}
                  </span>
                  {product.unitOfMeasure && (
                    <span className="text-xs text-muted-foreground font-medium lowercase">
                      · /{product.unitOfMeasure}
                    </span>
                  )}
                </div>
                <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  {product.name}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Detalles y opciones de compra del producto {product.name}
                </DialogDescription>
              </DialogHeader>

              {/* Price Display */}
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-foreground tracking-tight">
                    {formatUSD(product.priceUSD)}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">USD</span>
                </div>
                {priceVES > 0 && (
                  <p className="text-xs text-muted-foreground font-mono">
                    Ref. {formatVES(priceVES)} (a tasa oficial BCV)
                  </p>
                )}
              </div>

              {/* Detailed Description */}
              {product.description && (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Descripción
                  </span>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    {product.description}
                  </p>
                </div>
              )}

              {/* Inventory Specification */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t border-border/40">
                <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                {product.trackInventory ? (
                  <span>
                    Disponibilidad estimada:{' '}
                    <strong className="text-foreground font-semibold">
                      {product.currentStock} {product.unitOfMeasure || 'unidades'}
                    </strong>{' '}
                    en inventario.
                  </span>
                ) : (
                  <span>Disponibilidad inmediata o bajo pedido mayorista.</span>
                )}
              </div>
            </div>

            {/* Action Bar */}
            <div className="pt-4 border-t border-border">
              {quantityInCart > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 text-emerald-500 font-medium">
                      <Check className="h-3.5 w-3.5" /> En su pedido
                    </span>
                    <span>Modificar cantidad:</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-md hover:bg-background"
                      onClick={() => onUpdateQuantity(product.id, quantityInCart - 1)}
                      aria-label="Disminuir cantidad"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="font-mono text-sm font-bold text-foreground">
                      {quantityInCart} {product.unitOfMeasure || 'unidades'}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-md hover:bg-background"
                      onClick={() => onUpdateQuantity(product.id, quantityInCart + 1)}
                      aria-label="Aumentar cantidad"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="default"
                  size="lg"
                  className="w-full text-xs sm:text-sm font-semibold h-11"
                  onClick={() => onAddToCart(product)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar al Pedido
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
