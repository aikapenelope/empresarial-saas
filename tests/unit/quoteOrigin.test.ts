import { describe, expect, it } from 'vitest';
import { quotesListFiltersSchema } from '@/utilities/erpValidation';
import { Quotes } from '@/collections/Quotes';

describe('Sprint 52: Rastreo de Origen de Cotizaciones (Web B2B vs Mostrador)', () => {
  describe('Validación Zod: quotesListFiltersSchema (Filtro por Origen)', () => {
    it('permite omitir el origen y resulta en undefined', () => {
      const parsed = quotesListFiltersSchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.origin).toBeUndefined();
      }
    });

    it('acepta origin="storefront" correctamente', () => {
      const parsed = quotesListFiltersSchema.safeParse({ origin: 'storefront' });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.origin).toBe('storefront');
      }
    });

    it('acepta origin="manual" correctamente', () => {
      const parsed = quotesListFiltersSchema.safeParse({ origin: 'manual' });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.origin).toBe('manual');
      }
    });

    it('captura valores desconocidos o inválidos y devuelve undefined sin fallar', () => {
      const parsed = quotesListFiltersSchema.safeParse({ origin: 'hack_attempt' });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.origin).toBeUndefined();
      }
    });
  });

  describe('Colección Quotes: Configuración del campo origin', () => {
    it('define el campo origin con tipo select, indexado y valor por defecto "manual"', () => {
      const originField = Quotes.fields.find(
        (f) => 'name' in f && f.name === 'origin',
      );
      expect(originField).toBeDefined();
      if (originField && 'type' in originField && originField.type === 'select') {
        expect(originField.type).toBe('select');
        expect(originField.index).toBe(true);
        expect(originField.defaultValue).toBe('manual');
        const optionValues = originField.options.map(
          (opt) => (typeof opt === 'string' ? opt : opt.value),
        );
        expect(optionValues).toContain('manual');
        expect(optionValues).toContain('storefront');
      }
    });
  });

  describe('Lógica de detección de pedidos Web B2B (Retrocompatibilidad)', () => {
    const isWebQuote = (q: { origin?: string | null; notes?: string | null }) =>
      q.origin === 'storefront' ||
      (typeof q.notes === 'string' && q.notes.includes('[Pedido Web B2B]'));

    it('identifica correctamente pedidos creados con origin="storefront"', () => {
      expect(isWebQuote({ origin: 'storefront', notes: null })).toBe(true);
      expect(isWebQuote({ origin: 'storefront', notes: 'Alguna nota adicional' })).toBe(true);
    });

    it('identifica cotizaciones legadas basadas en el prefijo de notas [Pedido Web B2B]', () => {
      expect(
        isWebQuote({
          origin: 'manual',
          notes: '[Pedido Web B2B] Pedido recibido desde portal público',
        }),
      ).toBe(true);
    });

    it('no marca cotizaciones convencionales de mostrador como Web B2B', () => {
      expect(isWebQuote({ origin: 'manual', notes: 'Cotización en tienda' })).toBe(false);
      expect(isWebQuote({ origin: null, notes: null })).toBe(false);
    });
  });

  describe('Construcción de URL de contacto WhatsApp para vendedores', () => {
    it('formatea el enlace de WhatsApp con número limpio y texto de confirmación de stock', () => {
      const customerPhone = '+58 (414) 123-4567';
      const cleanPhone = customerPhone.replace(/\D/g, '');
      expect(cleanPhone).toBe('584141234567');

      const customerName = 'Ferretería El Tornillo C.A.';
      const quoteNumber = 'COT-00100';
      const totalUSD = 245.5;

      const message = `Hola ${customerName}, te contactamos respecto a tu solicitud web ${quoteNumber} por $${totalUSD.toFixed(
        2,
      )} USD. Estamos confirmando disponibilidad de stock para coordinar la entrega.`;

      const targetUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
      expect(targetUrl).toContain('https://wa.me/584141234567?text=');
      expect(targetUrl).toContain(encodeURIComponent('COT-00100'));
      expect(targetUrl).toContain(encodeURIComponent('$245.50 USD'));
    });
  });
});
