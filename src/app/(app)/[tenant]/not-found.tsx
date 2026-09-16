import React from 'react';
import Link from 'next/link';
import { Store, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function StorefrontNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-background text-foreground text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted/40 text-muted-foreground mb-4">
        <Store className="h-8 w-8 stroke-[1.5]" />
      </div>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
        Catálogo Web No Disponible
      </h1>
      <p className="mt-2 text-xs sm:text-sm text-muted-foreground max-w-md">
        La empresa solicitada no existe o no tiene habilitado el portal público de pedidos B2B.
      </p>
      <div className="mt-6">
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            <span>Volver al Inicio</span>
          </Link>
        </Button>
      </div>
    </main>
  );
}
