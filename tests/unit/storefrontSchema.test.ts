import { describe, expect, it } from 'vitest';
import { Media } from '@/collections/Media';
import { Products } from '@/collections/Products';
import { Tenants } from '@/collections/Tenants';
import type { Field, GroupField } from 'payload';

describe('Sprint 49: Configuración de Esquemas y Media de Storefront', () => {
  describe('Colección Media', () => {
    it('configura compresión nativa Sharp con WebP en imageSizes', () => {
      expect(Media.upload).toBeDefined();
      if (typeof Media.upload === 'object') {
        expect(Media.upload.imageSizes).toBeDefined();
        const sizes = Media.upload.imageSizes || [];
        const cardSize = sizes.find((s) => s.name === 'card');
        const thumbSize = sizes.find((s) => s.name === 'thumbnail');

        expect(cardSize).toBeDefined();
        expect(cardSize?.width).toBe(800);
        expect(cardSize?.height).toBe(800);
        expect(cardSize?.formatOptions?.format).toBe('webp');
        expect(cardSize?.formatOptions?.options).toEqual({ quality: 80 });

        expect(thumbSize).toBeDefined();
        expect(thumbSize?.width).toBe(400);
        expect(thumbSize?.height).toBe(400);
        expect(thumbSize?.formatOptions?.format).toBe('webp');

        expect(Media.upload.adminThumbnail).toBe('thumbnail');
      }
    });

    it('permite lectura pública de Media para alimentar la web sin sesión', () => {
      expect(typeof Media.access?.read).toBe('function');
      if (typeof Media.access?.read === 'function') {
        const result = Media.access.read({
          req: { user: undefined } as unknown as Parameters<NonNullable<typeof Media.access.read>>[0]['req'],
        });
        expect(result).toBe(true);
      }
    });
  });

  describe('Colección Products', () => {
    it('incluye el campo isPublishedOnWeb como checkbox indexado con default true', () => {
      const field = Products.fields.find(
        (f) => 'name' in f && f.name === 'isPublishedOnWeb',
      ) as Field | undefined;

      expect(field).toBeDefined();
      if (field && 'type' in field) {
        expect(field.type).toBe('checkbox');
        expect(field.defaultValue).toBe(true);
        expect(field.index).toBe(true);
      }
    });
  });

  describe('Colección Tenants - storefrontConfig', () => {
    const storefrontGroup = Tenants.fields.find(
      (f) => 'name' in f && f.name === 'storefrontConfig',
    ) as GroupField | undefined;

    it('define el grupo storefrontConfig en Tenants', () => {
      expect(storefrontGroup).toBeDefined();
      expect(storefrontGroup?.type).toBe('group');
    });

    it('restringe la mutación de storefrontConfig.enabled exclusivamente a super-admin', () => {
      expect(storefrontGroup?.fields).toBeDefined();
      const enabledField = storefrontGroup?.fields.find(
        (f) => 'name' in f && f.name === 'enabled',
      );

      expect(enabledField).toBeDefined();
      if (enabledField && 'access' in enabledField && enabledField.access?.update) {
        const updateAccess = enabledField.access.update;

        // super-admin -> true
        const canSuperAdmin = updateAccess({
          req: {
            user: { role: 'super-admin' },
          } as unknown as Parameters<typeof updateAccess>[0]['req'],
        });
        expect(canSuperAdmin).toBe(true);

        // tenant-admin -> false
        const canTenantAdmin = updateAccess({
          req: {
            user: { role: 'tenant-admin' },
          } as unknown as Parameters<typeof updateAccess>[0]['req'],
        });
        expect(canTenantAdmin).toBe(false);

        // regular user o sin sesión -> false
        const canRegular = updateAccess({
          req: {
            user: { role: 'vendor' },
          } as unknown as Parameters<typeof updateAccess>[0]['req'],
        });
        expect(canRegular).toBe(false);

        const canAnon = updateAccess({
          req: {
            user: undefined,
          } as unknown as Parameters<typeof updateAccess>[0]['req'],
        });
        expect(canAnon).toBe(false);
      }
    });

    it('permite lectura pública de storefrontConfig.enabled', () => {
      const enabledField = storefrontGroup?.fields.find(
        (f) => 'name' in f && f.name === 'enabled',
      );
      if (enabledField && 'access' in enabledField && enabledField.access?.read) {
        const readAccess = enabledField.access.read;
        const result = readAccess({
          req: { user: undefined } as unknown as Parameters<typeof readAccess>[0]['req'],
        });
        expect(result).toBe(true);
      }
    });
  });
});
