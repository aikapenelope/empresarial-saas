"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
	Avatar,
	AvatarFallback,
} from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { LogOutIcon, MoonIcon, StoreIcon, SunIcon } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
	"super-admin": "Super Administrador",
	"tenant-admin": "Administrador de Empresa",
	supervisor: "Supervisor",
	vendor: "Vendedor",
	cashier: "Cajero",
	employee: "Empleado",
};

interface NavUserProps {
	userName: string;
	userEmail: string;
	userRole?: string | null;
}

export function NavUser({ userName, userEmail, userRole }: NavUserProps) {
	const router = useRouter();
	const { resolvedTheme, setTheme } = useTheme();
	// resolvedTheme sólo existe en el cliente: hasta montar se muestra un
	// ítem neutro para evitar hydration mismatch. useSyncExternalStore es el
	// detector de hidratación canónico (sin setState dentro del efecto).
	const mounted = React.useSyncExternalStore(
		() => () => {},
		() => true,
		() => false,
	);
	const isDark = mounted ? resolvedTheme === 'dark' : null;

	const handleLogout = async () => {
		// Endpoint REST oficial de Payload para cerrar la sesión del token.
		// Sólo navegamos si el endpoint CONFIRMA el logout: un fallo HTTP no
		// limpia la cookie y abandonar la pantalla daría la impresión de sesión
		// cerrada cuando sigue activa.
		try {
			const res = await fetch("/api/users/logout", {
				method: "POST",
				credentials: "include",
			});
			if (!res.ok) {
				toast.error("No se pudo cerrar la sesión. Inténtalo de nuevo.");
				return;
			}
		} catch {
			toast.error("No se pudo contactar al servidor. Revisa tu conexión.");
			return;
		}
		router.push("/");
		router.refresh();
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Menú de usuario"
				>
					<Avatar className="size-8">
						<AvatarFallback>{userName.charAt(0).toUpperCase()}</AvatarFallback>
					</Avatar>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuLabel className="flex items-center gap-3">
					<Avatar className="size-10">
						<AvatarFallback>{userName.charAt(0).toUpperCase()}</AvatarFallback>
					</Avatar>
					<div className="min-w-0">
						<span className="font-medium text-foreground">{userName}</span>{" "}
						<br />
						<div className="max-w-full overflow-hidden overflow-ellipsis whitespace-nowrap text-muted-foreground text-xs">
							{userEmail}
						</div>
						<div className="mt-0.5 text-[10px] text-muted-foreground">
							{ROLE_LABEL[userRole ?? ""] ?? userRole}
						</div>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						onClick={() => setTheme(isDark ? 'light' : 'dark')}
					>
						{isDark ? <SunIcon /> : <MoonIcon />}
						Cambiar a modo {isDark === false ? 'oscuro' : 'claro'}
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<Link href="/">
							<StoreIcon />
							Ver empresas
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleLogout}>
						<LogOutIcon />
						Cerrar sesión
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
