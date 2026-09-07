import React from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { getErpUser } from '@/utilities/erpAuth';
import { resolvePostLoginTarget } from '@/utilities/loginRedirect';
import { LoginForm } from '@/components/erp/LoginForm';

export const metadata = { title: 'Iniciar sesión · Empresarial' };

interface PageProps {
  searchParams: Promise<{ redirect?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { redirect: redirectParam } = await searchParams;

  // Con sesión activa no se muestra el formulario: se resuelve el destino
  // (empresa única -> su ERP; super-admin o varias -> selector).
  const user = await getErpUser().catch(() => null);
  if (user) {
    redirect(redirectParam && redirectParam.startsWith('/') ? redirectParam : resolvePostLoginTarget(user) ?? '/');
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
        <LoginForm redirectParam={redirectParam && redirectParam.startsWith('/') ? redirectParam : undefined} />
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
