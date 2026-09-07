"use client";

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
import { LogOutIcon, StoreIcon } from "lucide-react";

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

	const handleLogout = async () => {
		// Endpoint REST oficial de Payload para cerrar la sesión del token.
		try {
			await fetch("/api/users/logout", { method: "POST", credentials: "include" });
		} catch {
			// la cookie se limpia igual al navegar al selector sin sesión válida
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
