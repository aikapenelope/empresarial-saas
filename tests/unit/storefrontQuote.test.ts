import { describe, expect, it } from 'vitest';
import {
  createStorefrontQuoteSchema,
  buildStorefrontWhatsAppUrl,
  calculateStorefrontQuoteTotals,
} from '@/actions/storefrontActions';

describe('Sprint 50: Motor de Cotización B2B y Validación Zod', () => {
  describe('Validación Zod: createStorefrontQuoteSchema', () => {
    const validPayload = {
      tenantSlug: 'distribuidora-polar',
      companyName: 'Inversiones Los Andes C.A.',
      taxId: 'J-12345678-9',
      phone: '+584121234567',
      email: 'compras@losandes.com',
      notes: 'Despacho en horario matutino',
      items: [
        { productId: 1, quantity: 5 },
        { productId: 2, quantity: 10 },
      ],
    };

    it('acepta una carga de pedido B2B válida', () => {
      const parsed = createStorefrontQuoteSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.companyName).toBe('Inversiones Los Andes C.A.');
        expect(parsed.data.items).toHaveLength(2);
      }
    });

    it('rechaza cuando el slug de la empresa está vacío o es inválido', () => {
      const parsed = createStorefrontQuoteSchema.safeParse({
        ...validPayload,
        tenantSlug: 'Empresa Con Espacios!',
      });
      expect(parsed.success).toBe(false);
    });

    it('rechaza cuando la razón social o nombre es menor a 2 caracteres', () => {
      const parsed = createStorefrontQuoteSchema.safeParse({
        ...validPayload,
        companyName: 'A',
      });
      expect(parsed.success).toBe(false);
    });

    it('rechaza cuando el RIF o identificación es menor a 3 caracteres', () => {
      const parsed = createStorefrontQuoteSchema.safeParse({
        ...validPayload,
        taxId: '12',
      });
      expect(parsed.success).toBe(false);
    });

    it('rechaza cuando el teléfono es demasiado corto', () => {
      const parsed = createStorefrontQuoteSchema.safeParse({
        ...validPayload,
        phone: '123',
      });
      expect(parsed.success).toBe(false);
    });

    it('rechaza cuando la lista de productos está vacía', () => {
      const parsed = createStorefrontQuoteSchema.safeParse({
        ...validPayload,
        items: [],
      });
      expect(parsed.success).toBe(false);
    });

    it('rechaza cantidades negativas o cero', () => {
      const parsedZero = createStorefrontQuoteSchema.safeParse({
        ...validPayload,
        items: [{ productId: 1, quantity: 0 }],
      });
      expect(parsedZero.success).toBe(false);

      const parsedNegative = createStorefrontQuoteSchema.safeParse({
        ...validPayload,
        items: [{ productId: 1, quantity: -3 }],
      });
      expect(parsedNegative.success).toBe(false);
    });
  });

  describe('Cálculo de Totales y Anti-Tampering: calculateStorefrontQuoteTotals', () => {
    const mockProducts = [
      { id: 1, name: 'Harina PAN 1kg', sku: 'HAR-001', priceUSD: 1.25 },
      { id: 2, name: 'Aceite Mazeite 1L', sku: 'ACE-002', priceUSD: 3.5 },
    ];

    it('calcula los subtotales usando exclusivamente los precios del catálogo en BD', () => {
      const items = [
        { productId: 1, quantity: 4 }, // 4 * 1.25 = 5.00
        { productId: 2, quantity: 2 }, // 2 * 3.50 = 7.00
      ];

      const { lineItems, totalUSD, totalVES } = calculateStorefrontQuoteTotals(
        items,
        mockProducts,
        40.0, // tasa BCV 40 Bs/USD
      );

      expect(lineItems).toHaveLength(2);
      expect(lineItems[0].totalUSD).toBe(5.0);
      expect(lineItems[1].totalUSD).toBe(7.0);
      expect(totalUSD).toBe(12.0);
      expect(totalVES).toBe(480.0);
    });

    it('arroja error si algún producto solicitado no existe en la base de datos', () => {
      const items = [{ productId: 999, quantity: 1 }];

      expect(() =>
        calculateStorefrontQuoteTotals(items, mockProducts, 40.0),
      ).toThrowError(/no está disponible/);
    });
  });

  describe('Generador de URL para WhatsApp: buildStorefrontWhatsAppUrl', () => {
    it('formatea correctamente el enlace wa.me con codificación de URI y parámetros', () => {
      const url = buildStorefrontWhatsAppUrl({
        targetPhone: '+58 (412) 123-4567',
        quoteNumber: 'COT-00123',
        companyName: 'Comercializadora El Sol',
        taxId: 'J-98765432-1',
        totalUSD: 150.75,
        totalVES: 6030.0,
        shareUrl: 'https://mi-erp.com/share/quote/abc123token',
      });

      expect(url).toContain('https://wa.me/584121234567?text=');
      expect(url).toContain(encodeURIComponent('COT-00123'));
      expect(url).toContain(encodeURIComponent('Comercializadora El Sol'));
      expect(url).toContain(encodeURIComponent('https://mi-erp.com/share/quote/abc123token'));
    });

    it('devuelve cadena vacía si no hay número de teléfono destino', () => {
      const url = buildStorefrontWhatsAppUrl({
        targetPhone: '',
        quoteNumber: 'COT-00123',
        companyName: 'Comercializadora El Sol',
        taxId: 'J-98765432-1',
        totalUSD: 100,
        totalVES: 4000,
        shareUrl: 'https://mi-erp.com/share/quote/abc',
      });

      expect(url).toBe('');
    });
  });
});
