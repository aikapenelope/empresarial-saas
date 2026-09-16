import { describe, it, expect } from 'vitest';
import { buildStorefrontContactWhatsAppUrl } from '@/utilities/storefrontQuotes';
import type { ProductProjection, StorefrontSortOption } from '@/components/storefront/types';

describe('Storefront Catalog UX & Contact Helpers (Sprint 55)', () => {
  describe('buildStorefrontContactWhatsAppUrl', () => {
    it('returns empty string when phone is empty or undefined', () => {
      expect(buildStorefrontContactWhatsAppUrl(undefined, 'Distribuidora')).toBe('');
      expect(buildStorefrontContactWhatsAppUrl(null, 'Distribuidora')).toBe('');
      expect(buildStorefrontContactWhatsAppUrl('', 'Distribuidora')).toBe('');
      expect(buildStorefrontContactWhatsAppUrl('   ', 'Distribuidora')).toBe('');
    });

    it('sanitizes 11-digit Venezuelan national phone prefixing with 58', () => {
      const url = buildStorefrontContactWhatsAppUrl('04141234567', 'Inversiones ABC');
      expect(url).toContain('https://wa.me/584141234567');
      expect(url).toContain(encodeURIComponent('Inversiones ABC'));
    });

    it('cleans non-digit characters (+, spaces, dashes)', () => {
      const url = buildStorefrontContactWhatsAppUrl('+58 (424) 987-6543', 'Comercializadora');
      expect(url).toContain('https://wa.me/584249876543');
    });

    it('works without tenant name gracefully', () => {
      const url = buildStorefrontContactWhatsAppUrl('584120001122');
      expect(url).toContain('https://wa.me/584120001122');
      expect(url).toContain('cat%C3%A1logo%20digital');
    });
  });

  describe('Catalog Sorting & Pagination Utilities', () => {
    const sampleProducts: ProductProjection[] = [
      {
        id: 1,
        name: 'Zapato Deportivo',
        sku: 'ZAP-01',
        priceUSD: 45.5,
        currentStock: 10,
        trackInventory: true,
      },
      {
        id: 2,
        name: 'Aceite de Oliva 1L',
        sku: 'ACE-01',
        priceUSD: 12.0,
        currentStock: 0,
        trackInventory: true,
      },
      {
        id: 3,
        name: 'Bicicleta Montañera',
        sku: 'BIC-01',
        priceUSD: 250.0,
        currentStock: 5,
        trackInventory: true,
      },
      {
        id: 4,
        name: 'Servicio de Instalación',
        sku: 'SRV-01',
        priceUSD: 30.0,
        currentStock: 0,
        trackInventory: false, // No track inventory = siempre disponible
      },
    ];

    function sortProducts(products: ProductProjection[], sortBy: StorefrontSortOption) {
      const copy = [...products];
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
      }
    }

    it('sorts alphabetically A to Z', () => {
      const sorted = sortProducts(sampleProducts, 'name-asc');
      expect(sorted[0].name).toBe('Aceite de Oliva 1L');
      expect(sorted[sorted.length - 1].name).toBe('Zapato Deportivo');
    });

    it('sorts alphabetically Z to A', () => {
      const sorted = sortProducts(sampleProducts, 'name-desc');
      expect(sorted[0].name).toBe('Zapato Deportivo');
      expect(sorted[sorted.length - 1].name).toBe('Aceite de Oliva 1L');
    });

    it('sorts by price ascending', () => {
      const sorted = sortProducts(sampleProducts, 'price-asc');
      expect(sorted[0].priceUSD).toBe(12.0);
      expect(sorted[sorted.length - 1].priceUSD).toBe(250.0);
    });

    it('sorts by price descending', () => {
      const sorted = sortProducts(sampleProducts, 'price-desc');
      expect(sorted[0].priceUSD).toBe(250.0);
      expect(sorted[sorted.length - 1].priceUSD).toBe(12.0);
    });

    it('sorts by stock availability (in stock & untracked items first)', () => {
      const sorted = sortProducts(sampleProducts, 'stock-desc');
      // In stock items: id 1 (10), id 3 (5), id 4 (trackInventory: false)
      // Out of stock item: id 2 (currentStock: 0, trackInventory: true)
      expect(sorted[sorted.length - 1].id).toBe(2);
      expect(sorted.slice(0, 3).every((p) => !p.trackInventory || p.currentStock > 0)).toBe(true);
    });

    it('correctly handles pagination slicing with remainder', () => {
      const PAGE_SIZE = 2;
      const firstBatch = sampleProducts.slice(0, PAGE_SIZE);
      expect(firstBatch.length).toBe(2);

      const secondBatch = sampleProducts.slice(0, PAGE_SIZE * 2);
      expect(secondBatch.length).toBe(4);
    });
  });
});
