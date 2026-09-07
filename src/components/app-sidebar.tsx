"use client";

import Link from "next/link";
import { PlusIcon, SearchIcon, StoreIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NavGroup } from "@/components/nav-group";
import { buildNavGroups } from "@/components/app-shared";

interface AppSidebarProps {
	tenantName: string;
	tenantSlug: string;
	userRole?: string | null;
	activeAlertCount?: number;
	onOpenCommandPalette: () => void;
}

export function AppSidebar({
	tenantName,
	tenantSlug,
	userRole,
	activeAlertCount,
	onOpenCommandPalette,
}: AppSidebarProps) {
	const navGroups = buildNavGroups(tenantSlug, userRole, activeAlertCount);

	return (
		<Sidebar collapsible="icon" variant="floating">
			<SidebarHeader className="h-14 justify-center">
				<SidebarMenuButton asChild tooltip="Ir a empresas">
					<Link href="/">
						<StoreIcon />
						<span className="font-medium">{tenantName}</span>
					</Link>
				</SidebarMenuButton>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarMenuItem className="flex items-center gap-2">
						<SidebarMenuButton
							asChild
							className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
							tooltip="Nueva venta"
						>
							<Link href={`/${tenantSlug}/erp/pos`}>
								<PlusIcon />
								<span>Nueva venta</span>
							</Link>
						</SidebarMenuButton>
						<Button
							aria-label="Buscar (Ctrl+K)"
							className="size-8 group-data-[collapsible=icon]:opacity-0"
							size="icon"
							variant="outline"
							onClick={onOpenCommandPalette}
						>
							<SearchIcon />
							<span className="sr-only">Buscar</span>
						</Button>
					</SidebarMenuItem>
				</SidebarGroup>
				{navGroups.map((group, index) => (
					<NavGroup key={`sidebar-group-${index}`} {...group} />
				))}
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild size="sm" tooltip="Ver empresas" className="text-muted-foreground">
							<Link href="/">
								<StoreIcon />
								<span>Ver empresas</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
