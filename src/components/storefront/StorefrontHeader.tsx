'use client';

import React from 'react';
import { ShoppingBag, Building2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatVES } from '@/components/erp/format';
import type { StorefrontTenantInfo } from './types';

interface StorefrontHeaderProps {
  tenant: StorefrontTenantInfo;
  cartCount: number;
  onOpenCart: () => void;
}

export const StorefrontHeader: React.FC<StorefrontHeaderProps> = ({
  tenant,
  cartCount,
  onOpenCart,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {tenant.announcementText && (
        <div className="w-full bg-foreground text-background text-[11px] sm:text-xs py-1.5 px-4 text-center font-medium tracking-tight">
          <p className="truncate max-w-5xl mx-auto">{tenant.announcementText}</p>
        </div>
      )}
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand / Tenant identity */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-foreground text-base sm:text-lg">
                {tenant.name}
              </span>
              <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider py-0 px-1.5">
                B2B
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground hidden sm:flex">
              {tenant.tagline && <span className="font-medium text-foreground/80">{tenant.tagline}</span>}
              {tenant.tagline && tenant.rifFiscal && <span>·</span>}
              {tenant.rifFiscal && <span>RIF: {tenant.rifFiscal}</span>}
            </div>
          </div>
        </div>

        {/* BCV Live Exchange Rate Ticker */}
        {tenant.bcvRate > 0 && (
          <div className="hidden md:flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Tasa Oficial BCV:</span>
            <span className="font-mono font-bold text-foreground">
              {formatVES(tenant.bcvRate)}
            </span>
          </div>
        )}

        {/* Cart Drawer Trigger */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenCart}
            className="relative flex items-center gap-2 border-border hover:bg-muted/80"
            aria-label="Abrir carrito de pedidos"
          >
            <ShoppingBag className="h-4 w-4" />
            <span className="hidden sm:inline font-medium text-xs">Pedido</span>
            {cartCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background animate-in zoom-in-50">
                {cartCount}
              </span>
            )}
          </Button>
        </div>
      </div>
    </header>
  );
};
