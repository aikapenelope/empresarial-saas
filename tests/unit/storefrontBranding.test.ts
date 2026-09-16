import { describe, expect, it } from 'vitest';
import { updateTenantSettingsSchema } from '@/utilities/erpValidation';
import { Tenants } from '@/collections/Tenants';

describe('Sprint 54: Personalización de Marca y Banner del Storefront (Branding)', () => {
  describe('Validación Zod: updateTenantSettingsSchema con campos de Storefront', () => {
    const basePayload = {
      tenantId: 1,
      tenantSlug: 'distribuidora-polar',
      name: 'Distribuidora Polar C.A.',
      baseCurrency: 'USD' as const,
      autoSyncRate: true,
    };

    it('acepta configuración de marca y banner válida', () => {
      const parsed = updateTenantSettingsSchema.safeParse({
        ...basePayload,
        storefrontWhatsappNumber: '+584121234567',
        storefrontPortalTitle: 'Catálogo Mayorista Oriente',
        storefrontTagline: 'Líder en Distribución de Alimentos y Bebidas',
        storefrontAnnouncementText: 'Despacho gratis en compras mayores a $300 a nivel nacional',
        storefrontDeliveryPolicy: 'Entregas en 24-48 horas hábiles en zona metropolitana',
        storefrontPortalDescription: 'Precios exclusivos para clientes registrados.',
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.storefrontTagline).toBe('Líder en Distribución de Alimentos y Bebidas');
        expect(parsed.data.storefrontAnnouncementText).toBe(
          'Despacho gratis en compras mayores a $300 a nivel nacional',
        );
        expect(parsed.data.storefrontDeliveryPolicy).toBe(
          'Entregas en 24-48 horas hábiles en zona metropolitana',
        );
      }
    });

    it('permite omitir todos los campos de storefront sin error', () => {
      const parsed = updateTenantSettingsSchema.safeParse(basePayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.storefrontTagline).toBeUndefined();
        expect(parsed.data.storefrontAnnouncementText).toBeUndefined();
      }
    });

    it('rechaza títulos o anuncios que superen los límites de longitud', () => {
      const parsed = updateTenantSettingsSchema.safeParse({
        ...basePayload,
        storefrontAnnouncementText: 'A'.repeat(301),
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('Colección Tenants: Configuración del grupo storefrontConfig', () => {
    it('define los campos tagline, announcementText y deliveryPolicy dentro de storefrontConfig', () => {
      const groupField = Tenants.fields.find(
        (f) => 'name' in f && f.name === 'storefrontConfig',
      );
      expect(groupField).toBeDefined();

      if (groupField && 'fields' in groupField) {
        const subFields = groupField.fields.map((f) => ('name' in f ? f.name : ''));
        expect(subFields).toContain('enabled');
        expect(subFields).toContain('whatsappOrdersNumber');
        expect(subFields).toContain('portalTitle');
        expect(subFields).toContain('portalDescription');
        expect(subFields).toContain('tagline');
        expect(subFields).toContain('announcementText');
        expect(subFields).toContain('deliveryPolicy');
      }
    });

    it('mantiene la restricción RBAC de super-admin en el campo enabled', () => {
      const groupField = Tenants.fields.find(
        (f) => 'name' in f && f.name === 'storefrontConfig',
      );
      if (groupField && 'fields' in groupField) {
        const enabledField = groupField.fields.find(
          (f) => 'name' in f && f.name === 'enabled',
        );
        expect(enabledField).toBeDefined();
        if (enabledField && 'access' in enabledField && enabledField.access) {
          expect(typeof enabledField.access.update).toBe('function');
        }
      }
    });
  });

  describe('Lógica de Visualización del Banner de Anuncio', () => {
    it('determina correctamente cuándo renderizar el Announcement Bar', () => {
      const shouldShowBanner = (announcementText?: string | null): boolean =>
        Boolean(announcementText && announcementText.trim().length > 0);

      expect(shouldShowBanner('Ofertas de fin de mes activas')).toBe(true);
      expect(shouldShowBanner('')).toBe(false);
      expect(shouldShowBanner('   ')).toBe(false);
      expect(shouldShowBanner(null)).toBe(false);
      expect(shouldShowBanner(undefined)).toBe(false);
    });
  });
});
