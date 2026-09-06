'use client';

import React, { useState, useTransition } from 'react';
import { UserPlus, Loader2 } from 'lucide-react';
import { inviteUserAction } from '@/actions/erpActions';
import { Badge } from './Badge';
import { Modal } from './modals/Modal';
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

/** Panel de usuarios del inquilino (Sprint 17): listado + invitación con rol. */
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
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden space-y-3 p-5">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Usuarios del Inquilino</h2>
        </div>
        {canManage && (
          <button
            onClick={() => setIsInviteOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Invitar Usuario</span>
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
              <th className="p-3">Nombre</th>
              <th className="p-3">Email</th>
              <th className="p-3 text-center">Rol</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-800/30">
                <td className="p-3 font-semibold text-white">{u.name}</td>
                <td className="p-3 font-mono text-slate-300">{u.email}</td>
                <td className="p-3 text-center">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-300">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Nombre *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. María Pérez"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Rol *</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="vendor">Vendedor / Representante Comercial</option>
                  <option value="cashier">Cajero / Operador</option>
                  <option value="employee">Empleado / Consulta</option>
                  <option value="supervisor">Supervisor / Ventas</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Contraseña Temporal *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsInviteOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all disabled:opacity-50"
              >
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Invitar</span>
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
