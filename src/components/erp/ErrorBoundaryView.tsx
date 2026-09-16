'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Database,
  RefreshCw,
  Home,
  ShieldAlert,
  WifiOff,
  ServerCrash,
  ChevronDown,
  ChevronUp,
  Activity,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { classifyError } from '@/utilities/errorClassifier';

export interface ErrorBoundaryViewProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  backUrl?: string;
  backLabel?: string;
}

export function ErrorBoundaryView({
  error,
  reset,
  title: customTitle,
  backUrl = '/',
  backLabel = 'Volver al inicio',
}: ErrorBoundaryViewProps) {
  const classified = classifyError(error);
  const [showDetails, setShowDetails] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'idle' | 'checking' | 'healthy' | 'unhealthy'>('idle');
  const [healthMessage, setHealthMessage] = useState<string | null>(null);

  const displayTitle = customTitle || classified.title;

  const checkHealth = async () => {
    setHealthStatus('checking');
    setHealthMessage('Consultando el estado de la base de datos...');
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch('/api/health', {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);

      if (res.ok) {
        setHealthStatus('healthy');
        setHealthMessage('Base de datos conectada y operativa. Puedes pulsar "Reintentar" o recargar.');
      } else {
        setHealthStatus('unhealthy');
        setHealthMessage('El servicio aún no responde (código ' + res.status + '). Espera a que termine el mantenimiento.');
      }
    } catch {
      setHealthStatus('unhealthy');
      setHealthMessage('No se pudo contactar el servidor de salud. Revisa tu conexión de red.');
    }
  };

  const renderIcon = () => {
    if (classified.category === 'auth') {
      return (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <ShieldAlert className="h-6 w-6" aria-hidden="true" />
        </div>
      );
    }

    if (classified.isDatabaseError) {
      return (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20">
          <Database className="h-6 w-6" aria-hidden="true" />
        </div>
      );
    }

    if (classified.category === 'network') {
      return (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <WifiOff className="h-6 w-6" aria-hidden="true" />
        </div>
      );
    }

    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-foreground border border-border">
        <ServerCrash className="h-6 w-6" aria-hidden="true" />
      </div>
    );
  };

  return (
    <main className="flex min-h-[80vh] items-center justify-center p-4 sm:p-6 bg-background text-foreground">
      <Card className="w-full max-w-lg shadow-sm border border-border">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            {renderIcon()}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono bg-muted/60 px-2.5 py-1 rounded-md border border-border">
              <span>Cendaro ERP</span>
              <span>·</span>
              <span className="uppercase font-semibold">{classified.category}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <CardTitle className="text-xl font-bold tracking-tight">
              {displayTitle}
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed text-muted-foreground">
              {classified.description}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Liveness checker */}
          <div className="rounded-lg border border-border/80 bg-muted/40 p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                Diagnóstico del servicio
              </span>
              <Button
                variant="outline"
                size="xs"
                onClick={checkHealth}
                disabled={healthStatus === 'checking'}
              >
                {healthStatus === 'checking' ? 'Comprobando...' : 'Comprobar estado'}
              </Button>
            </div>

            {healthStatus === 'healthy' && (
              <p className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {healthMessage}
              </p>
            )}

            {healthStatus === 'unhealthy' && (
              <p className="flex items-center gap-1.5 text-destructive font-medium">
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                {healthMessage}
              </p>
            )}

            {healthStatus === 'idle' && (
              <p className="text-muted-foreground">
                Verifica si la base de datos de Supabase/Postgres ya volvió a estar disponible.
              </p>
            )}
          </div>

          {/* Technical Details Collapsible */}
          {(classified.digest || classified.technicalDetails) && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
              >
                <span>Detalles técnicos</span>
                {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>

              {showDetails && (
                <div className="rounded-md bg-muted p-3 font-mono text-[11px] text-muted-foreground break-all space-y-1 border border-border">
                  {classified.digest && (
                    <div>
                      <span className="font-semibold text-foreground">Digest: </span>
                      <span>{classified.digest}</span>
                    </div>
                  )}
                  {classified.technicalDetails && (
                    <div>
                      <span className="font-semibold text-foreground">Detalle: </span>
                      <span>{classified.technicalDetails}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row gap-2.5 justify-between bg-muted/30 pt-4 border-t border-border">
          <div className="flex gap-2 w-full sm:w-auto">
            {classified.canRetry && (
              <Button
                variant="default"
                size="sm"
                onClick={() => reset()}
                className="flex-1 sm:flex-none"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                Reintentar
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="flex-1 sm:flex-none"
            >
              Recargar página
            </Button>
          </div>

          <Button variant="ghost" size="sm" asChild className="w-full sm:w-auto">
            <Link href={backUrl}>
              <Home className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              {backLabel}
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
