'use client';

import React, { useState, useMemo } from 'react';
import { Search, PackageSearch } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StorefrontHeader } from './StorefrontHeader';
import { StorefrontProductCard } from './StorefrontProductCard';
import { StorefrontCartDrawer } from './StorefrontCartDrawer';
import { StorefrontCheckoutModal } from './StorefrontCheckoutModal';
import type {
  ProductProjection,
  StorefrontCategory,
  StorefrontTenantInfo,
  CartItem,
} from './types';

interface StorefrontCatalogProps {
  tenant: StorefrontTenantInfo;
  products: ProductProjection[];
  categories: StorefrontCategory[];
}

export const StorefrontCatalog: React.FC<StorefrontCatalogProps> = ({
  tenant,
  products,
  categories,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Cart operations
  const handleAddToCart = (product: ProductProjection) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const handleUpdateQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveItem(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item,
      ),
    );
  };

  const handleRemoveItem = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  const cartCount = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.quantity, 0);
  }, [cart]);

  const quantityMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of cart) {
      map.set(item.product.id, item.quantity);
    }
    return map;
  }, [cart]);

  // Product filtering
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        !searchQuery.trim() ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        !selectedCategory || product.categoryName === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navbar */}
      <StorefrontHeader
        tenant={tenant}
        cartCount={cartCount}
        onOpenCart={() => setIsCartOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero Banner Minimalista */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-background p-6 sm:p-10 shadow-xs">
          <div className="max-w-2xl space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {tenant.name} · Catálogo Oficial
            </span>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              {tenant.portalTitle || 'Portal de Pedidos y Catálogo Mayorista'}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {tenant.portalDescription ||
                'Seleccione los productos deseados para generar su presupuesto formal y coordinar el despacho directamente por WhatsApp.'}
            </p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            {/* Search Input */}
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre de producto o SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 text-xs bg-card border-border"
              />
            </div>

            {/* Results Counter */}
            <span className="text-xs text-muted-foreground whitespace-nowrap self-end sm:self-center">
              Mostrando <strong className="text-foreground">{filteredProducts.length}</strong> de{' '}
              {products.length} productos
            </span>
          </div>

          {/* Category Filter Pills */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
              <Button
                variant={selectedCategory === null ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(null)}
                className="rounded-full text-xs h-8 px-3 border-border font-medium"
              >
                Todos
              </Button>
              {categories.map((cat) => (
                <Button
                  key={cat.id}
                  variant={selectedCategory === cat.name ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(cat.name)}
                  className="rounded-full text-xs h-8 px-3 border-border font-medium whitespace-nowrap"
                >
                  {cat.name}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="flex h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <PackageSearch className="h-6 w-6 stroke-[1.5]" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">
              No se encontraron productos
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              No hay artículos que coincidan con los filtros aplicados. Intente con otro término de búsqueda.
            </p>
            {(searchQuery || selectedCategory) && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4 text-xs"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory(null);
                }}
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredProducts.map((product) => (
              <StorefrontProductCard
                key={product.id}
                product={product}
                bcvRate={tenant.bcvRate}
                quantityInCart={quantityMap.get(product.id) || 0}
                onAddToCart={handleAddToCart}
                onUpdateQuantity={handleUpdateQuantity}
              />
            ))}
          </div>
        )}
      </main>

      {/* Slide-over Cart Drawer */}
      <StorefrontCartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        bcvRate={tenant.bcvRate}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onProceedToCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
      />

      {/* Checkout / Requisition Modal */}
      <StorefrontCheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cart={cart}
        tenant={tenant}
        onOrderSuccess={handleClearCart}
      />

      {/* Footer */}
      <footer className="border-t border-border mt-16 py-8 bg-muted/20 text-xs text-muted-foreground text-center">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-2">
          <p>© {new Date().getFullYear()} {tenant.name}. Todos los derechos reservados.</p>
          <p className="text-[11px] opacity-75">
            Portal B2B generado con tecnología Cendaro ERP.
          </p>
        </div>
      </footer>
    </div>
  );
};
