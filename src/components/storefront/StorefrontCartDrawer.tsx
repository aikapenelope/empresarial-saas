'use client';

import React from 'react';
import Image from 'next/image';
import { ShoppingBag, Trash2, Plus, Minus, ArrowRight, Package } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { formatUSD, formatVES } from '@/components/erp/format';
import type { CartItem } from './types';

interface StorefrontCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  bcvRate: number;
  onUpdateQuantity: (productId: number, quantity: number) => void;
  onRemoveItem: (productId: number) => void;
  onProceedToCheckout: () => void;
}

export const StorefrontCartDrawer: React.FC<StorefrontCartDrawerProps> = ({
  isOpen,
  onClose,
  cart,
  bcvRate,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout,
}) => {
  const totalUSD = cart.reduce(
    (acc, item) => acc + item.product.priceUSD * item.quantity,
    0,
  );
  const totalVES = bcvRate > 0 ? totalUSD * bcvRate : 0;
  const totalItemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col sm:max-w-md p-0 bg-card border-l border-border"
      >
        {/* Header */}
        <SheetHeader className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-foreground" />
              <SheetTitle className="text-lg font-bold tracking-tight">
                Lista de Pedido
              </SheetTitle>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              {totalItemsCount} {totalItemsCount === 1 ? 'artículo' : 'artículos'}
            </span>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            Los productos se añadirán a una cotización oficial de venta en el ERP.
          </SheetDescription>
        </SheetHeader>

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {cart.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
                <ShoppingBag className="h-6 w-6 stroke-[1.5]" />
              </div>
              <h4 className="mt-4 text-sm font-semibold text-foreground">
                Su lista de pedido está vacía
              </h4>
              <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                Explore el catálogo y añada los artículos que desea cotizar con su asesor.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {cart.map(({ product, quantity }) => {
                const lineTotalUSD = product.priceUSD * quantity;
                return (
                  <li key={product.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-3">
                      {/* Thumbnail */}
                      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-border bg-muted/20">
                        {product.imageUrl ? (
                          <Image
                            src={product.imageUrl}
                            alt={product.name}
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                            <Package className="h-6 w-6" />
                          </div>
                        )}
                      </div>

                      {/* Product details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <h4 className="text-xs font-semibold text-foreground truncate">
                            {product.name}
                          </h4>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => onRemoveItem(product.id)}
                            aria-label="Eliminar producto"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        <span className="font-mono text-[10px] text-muted-foreground uppercase">
                          {product.sku}
                        </span>

                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded"
                              onClick={() => onUpdateQuantity(product.id, quantity - 1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="px-2 font-mono text-xs font-bold text-foreground">
                              {quantity}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded"
                              onClick={() => onUpdateQuantity(product.id, quantity + 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>

                          <div className="text-right">
                            <span className="text-xs font-bold text-foreground">
                              {formatUSD(lineTotalUSD)}
                            </span>
                            {bcvRate > 0 && (
                              <span className="block text-[10px] font-mono text-muted-foreground">
                                {formatVES(lineTotalUSD * bcvRate)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer & Checkout CTA */}
        {cart.length > 0 && (
          <div className="border-t border-border p-6 bg-background">
            <div className="space-y-1.5 mb-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Total Estimado (USD):
                </span>
                <span className="text-lg font-extrabold text-foreground">
                  {formatUSD(totalUSD)}
                </span>
              </div>
              {totalVES > 0 && (
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">
                    Equivalente Referencial (BCV):
                  </span>
                  <span className="font-mono font-semibold text-foreground">
                    {formatVES(totalVES)}
                  </span>
                </div>
              )}
            </div>

            <Button
              className="w-full font-semibold text-xs h-10 shadow-sm"
              onClick={onProceedToCheckout}
            >
              <span>Continuar al Pedido</span>
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
