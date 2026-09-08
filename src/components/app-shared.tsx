"use client";

import type { LucideIcon } from "lucide-react";
import {
	BellRing,
	ClipboardList,
	FileText,
	LayoutDashboard,
	Layers,
	Package,
	Receipt,
	Settings,
	ShoppingCart,
	TrendingUp,
	Trophy,
	Truck,
	Users,
	Wallet,
	Zap,
} from "lucide-react";

export type SidebarNavItem = {
	title: string;
	path?: string;
	icon?: LucideIcon;
	badgeCount?: number;
	exact?: boolean;
	subItems?: SidebarNavItem[];
};

export type SidebarNavGroup = {
	label: string;
	items: SidebarNavItem[];
};

/** Catálogo completo de rutas del ERP (routeKey → definición). */
const NAV_ITEMS: Array<{
	routeKey: string;
	title: string;
	segment: string;
	icon: LucideIcon;
	exact?: boolean;
}> = [
	{ routeKey: "dashboard", title: "Dashboard", segment: "", icon: LayoutDashboard, exact: true },
	{ routeKey: "invoices", title: "Facturación & Ventas", segment: "invoices", icon: Receipt },
	{ routeKey: "customers", title: "Clientes & Cartera", segment: "customers", icon: Users },
	{ routeKey: "alerts", title: "Alertas", segment: "alerts", icon: BellRing },
	{ routeKey: "receivables", title: "Cartera por Antigüedad", segment: "receivables", icon: Wallet },
	{ routeKey: "quotes", title: "Cotizaciones", segment: "quotes", icon: FileText },
	{ routeKey: "quotes-quick", title: "Cotización rápida", segment: "quotes/quick", icon: Zap },
	{ routeKey: "orders", title: "Pedidos de Venta", segment: "orders", icon: ClipboardList },
	{ routeKey: "delivery-notes", title: "Remisiones", segment: "delivery-notes", icon: Truck },
	{ routeKey: "vendors", title: "Vendedores & Comisiones", segment: "vendors", icon: Trophy },
	{ routeKey: "inventory", title: "Catálogo, Stock & BOM", segment: "inventory", icon: Package },
	{ routeKey: "pos", title: "Punto de Venta", segment: "pos", icon: ShoppingCart },
	{ routeKey: "cash-registers", title: "Cajas & Arqueos", segment: "cash-registers", icon: Wallet },
	{ routeKey: "purchases", title: "Compras & CxP", segment: "purchases", icon: ShoppingCart },
	{ routeKey: "suppliers", title: "Proveedores & CxP", segment: "suppliers", icon: Truck },
	{ routeKey: "templates", title: "Plantillas Industriales", segment: "templates", icon: Layers },
	{ routeKey: "rates", title: "Tasas de Cambio", segment: "rates", icon: TrendingUp },
	{ routeKey: "reports", title: "Reportes & Exports", segment: "reports", icon: FileText },
	{ routeKey: "settings", title: "Ajustes de Empresa", segment: "settings", icon: Settings },
];

/** Agrupación visual de la navegación (App Shell 4: grupos con label). */
const NAV_GROUPS: Array<{ label: string; routeKeys: string[] }> = [
	{
		label: "Operación",
		routeKeys: ["dashboard", "invoices", "pos", "quotes", "quotes-quick", "orders", "delivery-notes"],
	},
	{
		label: "Finanzas",
		routeKeys: ["customers", "receivables", "purchases", "suppliers", "cash-registers", "rates", "reports"],
	},
	{
		label: "Inventario",
		routeKeys: ["inventory", "vendors"],
	},
	{
		label: "Administración",
		routeKeys: ["alerts", "templates", "settings"],
	},
];

/** Visibilidad por rol (UX; la autoridad real es la capa de datos server-side). */
const ROLE_NAV: Record<string, string[]> = {
	vendor: ["dashboard", "alerts", "pos", "quotes", "quotes-quick", "orders", "delivery-notes", "vendors", "customers", "receivables"],
	cashier: ["dashboard", "alerts", "pos", "invoices", "orders", "delivery-notes", "customers", "cash-registers"],
	employee: ["dashboard", "alerts", "invoices", "customers", "inventory", "quotes", "quotes-quick", "orders", "delivery-notes"],
	supervisor: [
		"dashboard", "pos", "invoices", "customers", "inventory", "quotes", "quotes-quick",
		"orders", "delivery-notes", "alerts", "receivables", "cash-registers", "purchases", "vendors",
	],
};

const ALL_NAV = "*";

export function buildNavGroups(
	tenantSlug: string,
	userRole?: string | null,
	activeAlertCount?: number,
): SidebarNavGroup[] {
	const allowed = userRole ? ROLE_NAV[userRole] ?? ALL_NAV : ALL_NAV;
	const byKey = new Map(NAV_ITEMS.map((item) => [item.routeKey, item]));

	return NAV_GROUPS.map(({ label, routeKeys }) => ({
		label,
		items: routeKeys
			.filter((key) => allowed === ALL_NAV || (allowed as string[]).includes(key))
			.map((key): SidebarNavItem | null => {
				const item = byKey.get(key);
				if (!item) return null;
				return {
					title: item.title,
					path: `/${tenantSlug}/erp${item.segment ? `/${item.segment}` : ""}`,
					icon: item.icon,
					exact: item.exact,
					badgeCount: key === "alerts" ? activeAlertCount : undefined,
				};
			})
			.filter((item): item is SidebarNavItem => item !== null),
	})).filter((group) => group.items.length > 0);
}

/**
 * Ruta activa para un pathname: 1) match EXACTO tiene prioridad total (así
 * /quotes/quick resuelve sólo a "Cotización rápida" y no también a
 * "Cotizaciones"); 2) si no hay exacto, hereda la sección padre por prefijo
 * con frontera de segmento (p. ej. /invoices/12 → "Facturación & Ventas").
 */
export function resolveActiveNavItem(
	pathname: string,
	items: SidebarNavItem[],
): SidebarNavItem | undefined {
	const exact = items.find((item) => item.path === pathname);
	if (exact) return exact;
	return items.find((item) => item.path && pathname.startsWith(`${item.path}/`));
}
