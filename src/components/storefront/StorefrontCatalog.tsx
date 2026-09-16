'use client';

import React, { useState, useMemo } from 'react';
import { Search, PackageSearch, Truck, ArrowUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StorefrontHeader } from './StorefrontHeader';
import { StorefrontProductCard } from './StorefrontProductCard';
import { StorefrontCartDrawer } from './StorefrontCartDrawer';
import { StorefrontCheckoutModal } from './StorefrontCheckoutModal';
import { StorefrontQuickViewModal } from './StorefrontQuickViewModal';
import { StorefrontFloatingWhatsApp } from './StorefrontFloatingWhatsApp';
import type {
  ProductProjection,
  StorefrontCategory,
  StorefrontTenantInfo,
  StorefrontSortOption,
  CartItem,
} from './types';

interface StorefrontCatalogProps {
  tenant: StorefrontTenantInfo;
  products: ProductProjection[];
  categories: StorefrontCategory[];
}

const PAGE_SIZE = 16;

export const StorefrontCatalog: React.FC<StorefrontCatalogProps> = ({
  tenant,
  products,
  categories,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<StorefrontSortOption>('name-asc');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  const [quickViewProduct, setQuickViewProduct] = useState<ProductProjection | null>(null);
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);

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

  // Handle filter changes and reset pagination
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setVisibleCount(PAGE_SIZE);
  };

  const handleCategoryChange = (cat: string | null) => {
    setSelectedCategory(cat);
    setVisibleCount(PAGE_SIZE);
  };

  const handleSortChange = (sort: StorefrontSortOption) => {
    setSortBy(sort);
    setVisibleCount(PAGE_SIZE);
  };

  // Product filtering & sorting
  const sortedAndFilteredProducts = useMemo(() => {
    const list = products.filter((product) => {
      const matchesSearch =
        !searchQuery.trim() ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        !selectedCategory || product.categoryName === selectedCategory;

      return matchesSearch && matchesCategory;
    });

    const copy = [...list];
    switch (sortBy) {
      case 'name-asc':
        return copy.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      case 'name-desc':
        return copy.sort((a, b) => b.name.localeCompare(a.name, 'es'));
      case 'price-asc':
        return copy.sort((a, b) => a.priceUSD - b.priceUSD);
      case 'price-desc':
        return copy.sort((a, b) => b.priceUSD - a.priceUSD);
      case 'stock-desc':
        return copy.sort((a, b) => {
          const aInStock = !a.trackInventory || a.currentStock > 0 ? 1 : 0;
          const bInStock = !b.trackInventory || b.currentStock > 0 ? 1 : 0;
          if (bInStock !== aInStock) return bInStock - aInStock;
          return a.name.localeCompare(b.name, 'es');
        });
      default:
        return copy;
    }
  }, [products, searchQuery, selectedCategory, sortBy]);

  // Paginated visible slice
  const displayedProducts = useMemo(() => {
    return sortedAndFilteredProducts.slice(0, visibleCount);
  }, [sortedAndFilteredProducts, visibleCount]);

  const handleOpenQuickView = (product: ProductProjection) => {
    setQuickViewProduct(product);
    setIsQuickViewOpen(true);
  };

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
          <div className="max-w-3xl space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {tenant.name} · {tenant.tagline || 'Catálogo Oficial'}
            </span>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              {tenant.portalTitle || 'Portal de Pedidos y Catálogo Mayorista'}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {tenant.portalDescription ||
                'Seleccione los productos deseados para generar su presupuesto formal y coordinar el despacho directamente por WhatsApp.'}
            </p>
            {tenant.deliveryPolicy && (
              <div className="pt-2 flex items-start gap-2 text-xs text-muted-foreground border-t border-border/40 mt-3">
                <Truck className="h-4 w-4 shrink-0 mt-0.5 text-foreground" aria-hidden="true" />
                <span>{tenant.deliveryPolicy}</span>
              </div>
            )}
          </div>
        </div>

        {/* Filter & Search & Sort Bar */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            {/* Search & Sort Controls */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:max-w-2xl">
              {/* Search Input */}
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre de producto o SKU..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-9 h-10 text-xs bg-card border-border"
                />
              </div>

              {/* Sort Selector */}
              <div className="relative w-full sm:w-auto">
                <ArrowUpDown className="absolute left-2.5 top-3 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <select
                  value={sortBy}
                  onChange={(e) => handleSortChange(e.target.value as StorefrontSortOption)}
                  className="w-full sm:w-auto pl-8 pr-4 h-10 rounded-md border border-border bg-card text-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  aria-label="Ordenar productos por"
                >
                  <option value="name-asc">Nombre (A - Z)</option>
                  <option value="name-desc">Nombre (Z - A)</option>
                  <option value="price-asc">Precio: Menor a Mayor</option>
                  <option value="price-desc">Precio: Mayor a Menor</option>
                  <option value="stock-desc">En Existencia Primero</option>
                </select>
              </div>
            </div>

            {/* Results Counter */}
            <span className="text-xs text-muted-foreground whitespace-nowrap self-end sm:self-center">
              Mostrando <strong className="text-foreground">{displayedProducts.length}</strong> de{' '}
              {sortedAndFilteredProducts.length} productos
            </span>
          </div>

          {/* Category Filter Pills */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
              <Button
                variant={selectedCategory === null ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleCategoryChange(null)}
                className="rounded-full text-xs h-8 px-3 border-border font-medium"
              >
                Todos
              </Button>
              {categories.map((cat) => (
                <Button
                  key={cat.id}
                  variant={selectedCategory === cat.name ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleCategoryChange(cat.name)}
                  className="rounded-full text-xs h-8 px-3 border-border font-medium whitespace-nowrap"
                >
                  {cat.name}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Product Grid */}
        {sortedAndFilteredProducts.length === 0 ? (
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
                  handleSearchChange('');
                  handleCategoryChange(null);
                }}
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {displayedProducts.map((product) => (
                <StorefrontProductCard
                  key={product.id}
                  product={product}
                  bcvRate={tenant.bcvRate}
                  quantityInCart={quantityMap.get(product.id) || 0}
                  onAddToCart={handleAddToCart}
                  onUpdateQuantity={handleUpdateQuantity}
                  onQuickView={handleOpenQuickView}
                />
              ))}
            </div>

            {/* Pagination Controls */}
            {visibleCount < sortedAndFilteredProducts.length && (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t border-border/40">
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                  className="w-full sm:w-auto text-xs font-semibold px-6 border-border hover:bg-muted"
                >
                  Cargar más productos ({sortedAndFilteredProducts.length - visibleCount} restantes)
                </Button>
                {sortedAndFilteredProducts.length > PAGE_SIZE * 2 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setVisibleCount(sortedAndFilteredProducts.length)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Mostrar todos ({sortedAndFilteredProducts.length})
                  </Button>
                )}
              </div>
            )}
            {visibleCount >= sortedAndFilteredProducts.length && sortedAndFilteredProducts.length > PAGE_SIZE && (
              <p className="text-center text-xs text-muted-foreground pt-4">
                Has visto los {sortedAndFilteredProducts.length} productos disponibles.
              </p>
            )}
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

      {/* Quick View Modal */}
      <StorefrontQuickViewModal
        product={quickViewProduct}
        isOpen={isQuickViewOpen}
        onClose={() => {
          setIsQuickViewOpen(false);
          setQuickViewProduct(null);
        }}
        bcvRate={tenant.bcvRate}
        quantityInCart={quickViewProduct ? quantityMap.get(quickViewProduct.id) || 0 : 0}
        onAddToCart={handleAddToCart}
        onUpdateQuantity={handleUpdateQuantity}
      />

      {/* Persistent Floating WhatsApp Button */}
      <StorefrontFloatingWhatsApp tenant={tenant} />

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
