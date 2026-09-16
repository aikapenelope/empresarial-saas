import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPayload } from 'payload';
import config from '@payload-config';
import { resolveEffectiveRate } from '@/utilities/exchangeRate';
import { StorefrontCatalog } from '@/components/storefront/StorefrontCatalog';
import type {
  ProductProjection,
  StorefrontCategory,
  StorefrontTenantInfo,
} from '@/components/storefront/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tenant: tenantSlug } = await params;
  const payload = await getPayload({ config });

  const tenantDocs = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: tenantSlug } },
    limit: 1,
    depth: 0,
  });

  const tenant = tenantDocs.docs[0];
  if (!tenant || !tenant.storefrontConfig?.enabled) {
    return { title: 'Catálogo No Encontrado' };
  }

  return {
    title: `${tenant.storefrontConfig.portalTitle || 'Catálogo B2B'} | ${tenant.name}`,
    description:
      tenant.storefrontConfig.portalDescription ||
      `Portal oficial de cotizaciones y catálogo de productos de ${tenant.name}`,
  };
}

export default async function StorefrontPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const payload = await getPayload({ config });

  // 1. Resolver inquilino por slug
  const tenantDocs = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: tenantSlug } },
    limit: 1,
    depth: 0,
  });

  const tenant = tenantDocs.docs[0];
  if (!tenant || !tenant.storefrontConfig?.enabled) {
    notFound();
  }

  const tenantId = tenant.id;

  // 2. Resolver tasa de cambio oficial BCV
  const rateResult = await resolveEffectiveRate(
    tenant.currencyConfig
      ? {
          manualExchangeRate: tenant.currencyConfig.manualExchangeRate ?? undefined,
          autoSyncRate: tenant.currencyConfig.autoSyncRate ?? undefined,
        }
      : undefined,
  );
  const bcvRate = rateResult.rate;

  // 3. Consultar productos del catálogo activos y publicados en web
  const productsDocs = await payload.find({
    collection: 'products',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { isActive: { equals: true } },
        { isPublishedOnWeb: { equals: true } },
        { productType: { in: ['standard', 'manufactured'] } },
      ],
    },
    limit: 500,
    depth: 1,
    sort: 'name',
  });

  // 4. Consultar categorías del inquilino
  const categoriesDocs = await payload.find({
    collection: 'categories',
    where: {
      tenant: { equals: tenantId },
    },
    limit: 100,
    depth: 0,
    sort: 'name',
  });

  // 5. Proyección segura de productos (omite costos, márgenes, BOM y proveedores)
  const products: ProductProjection[] = productsDocs.docs.map((p) => {
    let imageUrl: string | null = null;
    if (typeof p.image === 'object' && p.image !== null) {
      const img = p.image as {
        url?: string;
        sizes?: { card?: { url?: string }; thumbnail?: { url?: string } };
      };
      imageUrl = img.sizes?.card?.url || img.url || null;
    }

    const categoryName =
      typeof p.category === 'object' && p.category !== null && 'name' in p.category
        ? (p.category as { name: string }).name
        : null;

    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      priceUSD: Number(p.priceUSD) || 0,
      description: p.description || null,
      categoryName,
      unitOfMeasure: p.unitOfMeasure || null,
      currentStock: Number(p.currentStock) || 0,
      trackInventory: Boolean(p.trackInventory),
      imageUrl,
    };
  });

  const categories: StorefrontCategory[] = categoriesDocs.docs.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const tenantInfo: StorefrontTenantInfo = {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    rifFiscal: tenant.rifFiscal || null,
    phone: tenant.phone || null,
    whatsappOrdersNumber: tenant.storefrontConfig?.whatsappOrdersNumber || null,
    portalTitle: tenant.storefrontConfig?.portalTitle || null,
    portalDescription: tenant.storefrontConfig?.portalDescription || null,
    tagline: tenant.storefrontConfig?.tagline || null,
    announcementText: tenant.storefrontConfig?.announcementText || null,
    deliveryPolicy: tenant.storefrontConfig?.deliveryPolicy || null,
    bcvRate,
  };

  return (
    <StorefrontCatalog
      tenant={tenantInfo}
      products={products}
      categories={categories}
    />
  );
}
