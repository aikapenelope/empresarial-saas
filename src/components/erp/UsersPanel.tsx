'use client';

import React, { useState, useTransition } from 'react';
import { UserPlus, Loader2 } from 'lucide-react';
import { inviteUserAction } from '@/actions/erpActions';
import { Badge } from './Badge';
import { Modal } from './modals/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';

interface UsersPanelProps {
  tenantId: number;
  tenantSlug: string;
  users: Array<{ id: number; name: string; email: string; role: string }>;
  canManage: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  'super-admin': 'Super Admin',
  'tenant-admin': 'Admin',
  supervisor: 'Supervisor',
  vendor: 'Vendedor',
  cashier: 'Cajero',
  employee: 'Empleado',
};

/** Panel de usuarios del inquilino (Sprint 17 → reskin 37): listado + invitación con rol. */
export function UsersPanel({ tenantId, tenantSlug, users, canManage }: UsersPanelProps) {
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>('cashier');
  const [password, setPassword] = useState('');

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await inviteUserAction({
        tenantId,
        tenantSlug,
        email,
        name,
        role: role as 'cashier',
        password,
      });

      if (res.success) {
        toast.success(`Usuario ${email} invitado al inquilino.`);
        setEmail('');
        setName('');
        setPassword('');
        setRole('cashier');
        setIsInviteOpen(false);
      } else {
        setError(res.error || 'Error al invitar al usuario.');
      }
    });
  };

  return (
    <Card className="rounded-xl overflow-hidden space-y-3 p-5">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Usuarios del Inquilino</h2>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setIsInviteOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            Invitar Usuario
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-center">Rol</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-semibold">{u.name}</TableCell>
                <TableCell className="font-mono text-muted-foreground">{u.email}</TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant={
                      u.role === 'tenant-admin' || u.role === 'super-admin'
                        ? 'indigo'
                        : u.role === 'vendor'
                          ? 'amber'
                          : 'slate'
                    }
                    size="sm"
                  >
                    {ROLE_LABELS[u.role] || u.role}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {isInviteOpen && (
        <Modal
          isOpen
          onClose={() => setIsInviteOpen(false)}
          title="Invitar Usuario"
          description="Crea una cuenta con acceso a este inquilino. El usuario podrá cambiar su contraseña desde el panel."
          maxWidth="lg"
        >
          <form onSubmit={handleInvite} className="space-y-4 text-xs">
            {error && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-600 dark:text-rose-400" role="alert">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-foreground mb-1" htmlFor="invite-name">
                  Nombre *
                </label>
                <Input
                  id="invite-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. María Pérez"
                />
              </div>
              <div>
                <label className="block font-semibold text-foreground mb-1" htmlFor="invite-email">
                  Email *
                </label>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-foreground mb-1" htmlFor="invite-role">
                  Rol *
                </label>
                <select
                  id="invite-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground"
                >
                  <option value="vendor">Vendedor / Representante Comercial</option>
                  <option value="cashier">Cajero / Operador</option>
                  <option value="employee">Empleado / Consulta</option>
                  <option value="supervisor">Supervisor / Ventas</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-foreground mb-1" htmlFor="invite-password">
                  Contraseña Temporal *
                </label>
                <Input
                  id="invite-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setIsInviteOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                <span>Invitar</span>
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
