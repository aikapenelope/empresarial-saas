import React from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, ShieldAlert } from 'lucide-react';
import { getPayload } from 'payload';
import config from '@payload-config';
import { getErpUser } from '@/utilities/erpAuth';
import { resolvePostLoginTarget, safeInternalPath } from '@/utilities/loginRedirect';
import { LoginForm } from '@/components/erp/LoginForm';

export const metadata = { title: 'Iniciar sesión · Empresarial' };

interface PageProps {
  searchParams: Promise<{ redirect?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { redirect: redirectParam } = await searchParams;

  // SEC: sólo rutas internas del propio origen (rechaza //host y \host).
  const safeRedirect = safeInternalPath(redirectParam);

  // Con sesión activa no se muestra el formulario: se resuelve el destino
  // (empresa única -> su ERP; super-admin o varias -> selector).
  const user = await getErpUser().catch(() => null);
  if (user) {
    let target = safeRedirect ?? resolvePostLoginTarget(user);

    // FIX sesiones activas: getErpUser carga las membresías con depth 0, es
    // decir, tenant como ID numérico sin slug. Se resuelven los slugs vía
    // Local API (el access de tenants exige sesión; el usuario sólo puede
    // resolver los suyos).
    if (!target && user.role !== 'super-admin') {
      const membershipIds = (user.tenants ?? [])
        .map((membership) => (typeof membership?.tenant === 'object' ? null : membership?.tenant))
        .filter((id): id is number => typeof id === 'number');

      if (membershipIds.length > 0) {
        const payload = await getPayload({ config });
        const tenantsRes = await payload.find({
          collection: 'tenants',
          where: { id: { in: membershipIds } },
          depth: 0,
          limit: 100,
          select: { slug: true },
          user,
          overrideAccess: false,
        });
        const slugs = tenantsRes.docs
          .map((tenant) => tenant.slug)
          .filter((slug): slug is string => Boolean(slug));
        if (slugs.length === 1) target = `/${slugs[0]}/erp`;
      }
    }

    if (target) {
      redirect(target);
    }

    // FIX usuario sin empresas asignadas: aviso server-rendered en lugar de
    // mandarlo al selector como si nada.
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="flex items-center gap-2 justify-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-lg font-extrabold tracking-tight">Empresarial</span>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 space-y-3">
            <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
            <h1 className="text-base font-bold">Tu usuario no tiene empresas asignadas</h1>
            <p className="text-sm text-muted-foreground">
              Tu cuenta existe, pero ningún administrador te ha asignado a una
              empresa todavía. Contacta a tu administrador para que te invite
              desde Configuración → Usuarios.
            </p>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-2 justify-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-lg font-extrabold tracking-tight">Empresarial</span>
        </div>
        <LoginForm redirectParam={safeRedirect} />
        <p className="text-center text-xs text-muted-foreground">
          ¿Todavía no trabajas con una empresa?{' '}
          <Link href="/" className="underline underline-offset-2">
            Volver al inicio
          </Link>
        </p>
      </div>
    </main>
  );
}
