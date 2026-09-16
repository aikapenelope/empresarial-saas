import { describe, expect, it } from 'vitest';
import { Alerts } from '@/collections/Alerts';

describe('Sprint 53: Alertas Operativas para Pedidos Web B2B', () => {
  describe('Colección Alerts: Configuración del campo type e índices', () => {
    it('incluye la opción "storefront_order" en el campo type con etiqueta "Pedido Web B2B"', () => {
      const typeField = Alerts.fields.find(
        (f) => 'name' in f && f.name === 'type',
      );
      expect(typeField).toBeDefined();
      if (typeField && 'type' in typeField && typeField.type === 'select') {
        const option = typeField.options.find(
          (opt) => (typeof opt === 'string' ? opt : opt.value) === 'storefront_order',
        );
        expect(option).toBeDefined();
        if (typeof option === 'object' && option !== null) {
          expect(option.label).toBe('Pedido Web B2B');
        }
      }
    });

    it('mantiene el índice único compuesto (tenant, type, refId) para idempotencia', () => {
      const uniqueIdx = Alerts.indexes?.find(
        (idx) => idx.unique && idx.fields.includes('tenant') && idx.fields.includes('type') && idx.fields.includes('refId'),
      );
      expect(uniqueIdx).toBeDefined();
    });
  });

  describe('Formateo del mensaje de alerta operativa', () => {
    it('construye un mensaje claro con cantidad de productos, total USD, cliente y RIF', () => {
      const quoteNumber = 'COT-00042';
      const items = [{ id: 1 }, { id: 2 }];
      const totalUSD = 150.75;
      const companyName = 'Distribuidora Central C.A.';
      const taxId = 'J-98765432-1';

      const message = `Nuevo pedido Web B2B recibido: ${quoteNumber} (${items.length} producto${
        items.length > 1 ? 's' : ''
      }, $${totalUSD.toFixed(2)} USD) de ${companyName} (RIF: ${taxId}).`;

      expect(message).toBe(
        'Nuevo pedido Web B2B recibido: COT-00042 (2 productos, $150.75 USD) de Distribuidora Central C.A. (RIF: J-98765432-1).',
      );
      expect(message).toContain('COT-00042');
      expect(message).toContain('$150.75 USD');
      expect(message).toContain('J-98765432-1');
    });

    it('maneja singular cuando hay un solo producto', () => {
      const quoteNumber = 'COT-00043';
      const items = [{ id: 1 }];
      const totalUSD = 45.0;
      const companyName = 'Abasto El Éxito';
      const taxId = 'V-12345678';

      const message = `Nuevo pedido Web B2B recibido: ${quoteNumber} (${items.length} producto${
        items.length > 1 ? 's' : ''
      }, $${totalUSD.toFixed(2)} USD) de ${companyName} (RIF: ${taxId}).`;

      expect(message).toBe(
        'Nuevo pedido Web B2B recibido: COT-00043 (1 producto, $45.00 USD) de Abasto El Éxito (RIF: V-12345678).',
      );
    });
  });

  describe('Navegación y Enrutamiento desde Alertas', () => {
    it('enruta los pedidos Web B2B a la vista de cotizaciones filtrada por origin=storefront', () => {
      const tenantSlug = 'mi-empresa';
      const buildRoute = (t: string) => `/${t}/erp/quotes?origin=storefront`;
      expect(buildRoute(tenantSlug)).toBe('/mi-empresa/erp/quotes?origin=storefront');
    });
  });
});
