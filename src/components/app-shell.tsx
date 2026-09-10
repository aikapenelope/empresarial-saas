"use client";

import { useState } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "./erp/CommandPalette";

interface Rates {
	bcv: number | null;
	binance: number | null;
	paralelo: number | null;
	effectiveRate: number;
	source: string;
	lastUpdated?: string;
}

interface AppShellProps {
	tenantName: string;
	tenantSlug: string;
	tenantId: number;
	rates: Rates;
	userRole?: string | null;
	userName: string;
	userEmail: string;
	activeAlertCount?: number;
	children: React.ReactNode;
}

export function AppShell({
	tenantName,
	tenantSlug,
	tenantId,
	rates,
	userRole,
	userName,
	userEmail,
	activeAlertCount,
	children,
}: AppShellProps) {
	const [commandOpen, setCommandOpen] = useState(false);

	return (
		// Los botones del sidebar renderizan Tooltip (título al colapsar):
		// sin el provider global el render de /aquela/erp entero reventaba.
		<TooltipProvider>
		<SidebarProvider>
			<AppSidebar
				tenantName={tenantName}
				tenantSlug={tenantSlug}
				userRole={userRole}
				activeAlertCount={activeAlertCount}
				onOpenCommandPalette={() => setCommandOpen(true)}
			/>
			<SidebarInset className="p-4 md:p-6">
				<AppHeader
					tenantName={tenantName}
					tenantSlug={tenantSlug}
					userRole={userRole}
					userName={userName}
					userEmail={userEmail}
					rates={rates}
					onOpenCommandPalette={() => setCommandOpen(true)}
				/>
				<CommandPalette
					tenantSlug={tenantSlug}
					tenantId={tenantId}
					userRole={userRole}
					open={commandOpen}
					onOpenChange={setCommandOpen}
				/>
				{/* erp-views: escopo del puente bimodal de las vistas heredadas (globals.css) */}
				<div className="erp-views flex flex-1 flex-col gap-4">{children}</div>
			</SidebarInset>
			</SidebarProvider>
		</TooltipProvider>
	);
}
