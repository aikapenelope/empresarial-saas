'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resolvePostLoginTarget, safeInternalPath } from '@/utilities/loginRedirect';

/**
 * Login propio del ERP (Sprint 34): autentica contra el endpoint REST oficial
 * de Payload (/api/users/login, cookie HTTP-only incluida con credentials),
 * resuelve la empresa del usuario y lo lleva directo a su dashboard — nunca
 * al admin de Payload, que queda reservado a quien lo busque explícitamente.
 */
export function LoginForm({ redirectParam }: { redirectParam?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const loginRes = await fetch('/api/users/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!loginRes.ok) {
        setError(loginRes.status === 401 ? 'Email o contraseña incorrectos.' : 'No se pudo iniciar sesión. Inténtalo de nuevo.');
        setLoading(false);
        return;
      }

      // Resuelve el destino según las empresas del usuario autenticado.
      const meRes = await fetch('/api/users/me?depth=1', { credentials: 'include' });
      if (!meRes.ok) {
        setError('Sesión iniciada, pero no se pudo resolver tu empresa. Vuelve a intentar.');
        setLoading(false);
        return;
      }
      const { user } = (await meRes.json()) as { user?: Parameters<typeof resolvePostLoginTarget>[0] };
      if (!user) {
        setError('Sesión iniciada, pero no se pudo leer tu usuario.');
        setLoading(false);
        return;
      }

      const target = redirectParam ?? resolvePostLoginTarget(user);
      if (!target) {
        setError('Tu usuario no está asignado a ninguna empresa. Contacta al administrador.');
        setLoading(false);
        return;
      }
      const destination = redirectParam
        ? safeInternalPath(redirectParam)
        : target ?? undefined;
      if (!destination) {
        setError('Tu usuario no está asignado a ninguna empresa. Contacta al administrador.');
        setLoading(false);
        return;
      }
      router.push(destination);
      router.refresh();
    } catch {
      setError('No se pudo contactar al servidor. Revisa tu conexión.');
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
        <CardDescription>Accede al panel de tu empresa.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-email">Correo electrónico</Label>
            <Input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@empresa.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">Contraseña</Label>
            <Input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Entrar al panel
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
