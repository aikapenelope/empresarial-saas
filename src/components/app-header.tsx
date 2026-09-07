"use client";

import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import { NavUser } from "@/components/nav-user";
import { CurrencyTicker } from "./erp/CurrencyTicker";

interface Rates {
	bcv: number | null;
	binance: number | null;
	paralelo: number | null;
	effectiveRate: number;
	source: string;
	lastUpdated?: string;
}

interface AppHeaderProps {
	tenantName: string;
	tenantSlug: string;
	userRole?: string | null;
	userName: string;
	userEmail: string;
	rates: Rates;
	onOpenCommandPalette: () => void;
}

export function AppHeader({
	tenantName,
	tenantSlug,
	userRole,
	userName,
	userEmail,
	rates,
	onOpenCommandPalette,
}: AppHeaderProps) {
	return (
		<header className="no-print mb-4 flex items-center justify-between gap-2">
			<div className="flex items-center gap-3">
				<CustomSidebarTrigger />
				<Separator
					className="mr-2 h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<AppBreadcrumbs tenantName={tenantName} tenantSlug={tenantSlug} userRole={userRole} />
			</div>
			<div className="flex items-center gap-3">
				<Button
					aria-label="Buscar (Ctrl+K)"
					variant="outline"
					size="sm"
					className="gap-2 text-muted-foreground"
					onClick={onOpenCommandPalette}
				>
					<SearchIcon />
					<span className="hidden sm:inline">Buscar…</span>
					<Kbd>⌘K</Kbd>
				</Button>
				<CurrencyTicker rates={rates} />
				<Separator
					className="h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<NavUser userName={userName} userEmail={userEmail} userRole={userRole} />
			</div>
		</header>
	);
}
