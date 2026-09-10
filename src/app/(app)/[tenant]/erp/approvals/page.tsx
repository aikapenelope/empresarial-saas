import { notFound } from 'next/navigation';
import { getPayload } from 'payload';
import config from '@payload-config';
import type { User } from '@/payload-types';
import { getTenantBySlug } from '@/utilities/erpData';
import { ErpAccessError, requireErpTenantAccess } from '@/utilities/erpAuth';
import { ErpAccessDenied } from '@/components/erp/ErpAccessDenied';
import { ErpPageHeader } from '@/components/erp/ErpPageHeader';
import { ApprovalsView, type ApprovalEntry } from '@/components/erp/ApprovalsView';

interface PageProps {
  params: Promise<{ tenant: string }>;
}

/** Sólo quienes autorizan ven la bandeja (coincide con APPROVAL_RESOLVER_ROLES). */
const APPROVAL_RESOLVER_ROLES: Array<User['role']> = [
  'super-admin',
  'tenant-admin',
  'supervisor',
];

export default async function ApprovalsPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;

  let tenant: Awaited<ReturnType<typeof getTenantBySlug>> = null;
  let actor: User | null = null;
  try {
    tenant = await getTenantBySlug(tenantSlug);
    if (tenant) {
      actor = await requireErpTenantAccess(tenant.id, APPROVAL_RESOLVER_ROLES);
    }
  } catch (error: unknown) {
    if (error instanceof ErpAccessError) {
      return <ErpAccessDenied status={error.status} />;
    }
    throw error;
  }

  if (!tenant || !actor) {
    notFound();
  }

  const payload = await getPayload({ config });
  const res = await payload.find({
    collection: 'approvals',
    where: { tenant: { equals: tenant.id } },
    sort: '-createdAt',
    limit: 50,
    depth: 1,
    user: actor,
    overrideAccess: false,
  });

  // Nombre del cliente para cada solicitud: el input guardado trae customerId.
  const entries: ApprovalEntry[] = res.docs.map((a) => {
    const input = (a.payload ?? {}) as {
      customerId?: number;
      customerName?: string;
      items?: Array<{ quantity: number; unitPriceUSD: number }>;
    };
    const requestedBy =
      typeof a.requestedBy === 'object' && a.requestedBy !== null ? a.requestedBy.name : null;
    const resolvedBy =
      typeof a.resolvedBy === 'object' && a.resolvedBy !== null ? a.resolvedBy.name : null;
    const totalUSD = (input.items ?? []).reduce(
      (acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unitPriceUSD) || 0),
      0,
    );
    return {
      id: a.id,
      status: a.status,
      requestedByName: requestedBy ?? `Usuario #${typeof a.requestedBy === 'object' ? a.requestedBy.id : a.requestedBy}`,
      resolvedByName: resolvedBy ?? null,
      decisionNote: a.decisionNote ?? null,
      customerId: input.customerId ?? null,
      totalUSD: Number(totalUSD.toFixed(2)),
      itemCount: (input.items ?? []).length,
      expiresAt: a.expiresAt ?? null,
      createdAt: a.createdAt,
    };
  });

  return (
    <div className="space-y-6">
      <ErpPageHeader
        title="Aprobaciones"
        description="Ventas a crédito que exceden el límite del cliente y esperan autorización. Aprobar re-ejecuta la venta con revalidación completa (stock, precios, kardex)."
        breadcrumbHref={`/${tenantSlug}/erp`}
        section="Aprobaciones"
      />
      <ApprovalsView tenantId={tenant.id} tenantSlug={tenantSlug} entries={entries} />
    </div>
  );
}
