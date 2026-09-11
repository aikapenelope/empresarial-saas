"use client";

import type { LucideIcon } from "lucide-react";
import {
	BellRing,
	ClipboardList,
	ClipboardCheck,
	FileText,
	History,
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
	/** Sinónimos de búsqueda para la paleta de comandos (IE-PR3). */
	keywords?: string;
}> = [
	{ routeKey: "dashboard", title: "Dashboard", segment: "", icon: LayoutDashboard, exact: true, keywords: "inicio resumen kpi ejecutivo" },
	{ routeKey: "invoices", title: "Facturación & Ventas", segment: "invoices", icon: Receipt, keywords: "facturas facturar ventas cobrar emitir" },
	{ routeKey: "customers", title: "Clientes & Cartera", segment: "customers", icon: Users, keywords: "clientes crm rif deuda estado de cuenta" },
	{ routeKey: "alerts", title: "Alertas", segment: "alerts", icon: BellRing, keywords: "alertas notificaciones avisos" },
	{ routeKey: "approvals", title: "Aprobaciones", segment: "approvals", icon: ClipboardCheck, keywords: "aprobaciones autorizar crédito supervisión pendientes firmar" },
	// Devin #80: la paleta anterior tenía "Auditoría Global" y al consumir
	// NAV_ITEMS desapareció. La auditoría es EXCLUSIVA de super-admin/
	// tenant-admin (getAuditLogData lo revalida con 403), así que la ruta va al
	// catálogo para esos roles vía ALL_NAV y NO se lista en ROLE_NAV de los
	// roles operativos, y NO va a NAV_GROUPS: el sidebar no cambia.
	{ routeKey: "audit", title: "Auditoría Global", segment: "audit", icon: History, keywords: "auditoría bitácora eventos cambios quién registro" },
	{ routeKey: "receivables", title: "Cartera por Antigüedad", segment: "receivables", icon: Wallet, keywords: "cxc cobranza cartera aging antigüedad vencidos" },
	{ routeKey: "quotes", title: "Cotizaciones", segment: "quotes", icon: FileText, keywords: "cotizaciones presupuesto cotizar proforma" },
	{ routeKey: "quotes-quick", title: "Cotización rápida", segment: "quotes/quick", icon: Zap, keywords: "cotización rápida quick quote venta rápida presupuesto express" },
	{ routeKey: "orders", title: "Pedidos de Venta", segment: "orders", icon: ClipboardList, keywords: "pedidos orden despacho confirmar" },
	{ routeKey: "delivery-notes", title: "Remisiones", segment: "delivery-notes", icon: Truck, keywords: "remisiones notas de entrega guías despacho" },
	{ routeKey: "vendors", title: "Vendedores & Comisiones", segment: "vendors", icon: Trophy, keywords: "vendedores comisiones cartera canal" },
	{ routeKey: "inventory", title: "Catálogo, Stock & BOM", segment: "inventory", icon: Package, keywords: "inventario catálogo stock kardex bom producción artículos productos" },
	{ routeKey: "pos", title: "Punto de Venta", segment: "pos", icon: ShoppingCart, keywords: "pos punto de venta mostrador caja cobrar escáner ticket" },
	{ routeKey: "cash-registers", title: "Cajas & Arqueos", segment: "cash-registers", icon: Wallet, keywords: "cajas arqueos turnos efectivo cierre fondo" },
	{ routeKey: "purchases", title: "Compras & CxP", segment: "purchases", icon: ShoppingCart, keywords: "compras cxp facturas de proveedor comprar importaciones" },
	{ routeKey: "suppliers", title: "Proveedores & CxP", segment: "suppliers", icon: Truck, keywords: "proveedores cxp pagar cuentas por pagar" },
	{ routeKey: "templates", title: "Plantillas Industriales", segment: "templates", icon: Layers, keywords: "plantillas industriales rubro onboarding seed" },
	{ routeKey: "rates", title: "Tasas de Cambio", segment: "rates", icon: TrendingUp, keywords: "tasas cambio bcv binance paralelo divisa dolar" },
	{ routeKey: "reports", title: "Reportes & Exports", segment: "reports", icon: FileText, keywords: "reportes exports libro de ventas csv contador fiscal" },
	{ routeKey: "settings", title: "Ajustes de Empresa", segment: "settings", icon: Settings, keywords: "ajustes empresa configuración email resend iva igtf impuestos" },
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
		routeKeys: ["alerts", "approvals", "templates", "settings"],
	},
];

/** Visibilidad por rol (UX; la autoridad real es la capa de datos server-side). */
const ROLE_NAV: Record<string, string[]> = {
	// 'audit' NO se lista aquí: es exclusiva de super-admin/tenant-admin
	// (ALL_NAV) — ofrecerla a roles operativos sería un 403 garantizado.
	vendor: ["dashboard", "alerts", "pos", "quotes", "quotes-quick", "orders", "delivery-notes", "vendors", "customers", "receivables"],
	cashier: ["dashboard", "alerts", "pos", "invoices", "orders", "delivery-notes", "customers", "cash-registers"],
	employee: ["dashboard", "alerts", "invoices", "customers", "inventory", "quotes", "quotes-quick", "orders", "delivery-notes"],
	supervisor: [
		"dashboard", "pos", "invoices", "customers", "inventory", "quotes", "quotes-quick",
		"orders", "delivery-notes", "alerts", "approvals", "receivables", "cash-registers", "purchases", "vendors",
	],
};

const ALL_NAV = "*";

export interface PaletteRoute {
	title: string;
	href: string;
	keywords?: string;
}

/**
 * Rutas planas para la paleta de comandos (IE-PR3): MISMA fuente que el sidebar
 * (NAV_ITEMS + ROLE_NAV) — la visibilidad por rol es idéntica y un solo lugar
 * para añadir rutas o sinónimos.
 */
export function getPaletteRoutes(
	tenantSlug: string,
	userRole?: string | null,
): PaletteRoute[] {
	const allowed = userRole ? ROLE_NAV[userRole] ?? ALL_NAV : ALL_NAV;
	return NAV_ITEMS.filter(
		(item) => allowed === ALL_NAV || (allowed as string[]).includes(item.routeKey),
	).map((item) => ({
		title: item.title,
		href: `/${tenantSlug}/erp${item.segment ? `/${item.segment}` : ""}`,
		keywords: item.keywords,
	}));
}

export function buildNavGroups(
	tenantSlug: string,
	userRole?: string | null,
	activeAlertCount?: number,
	approvalsPendingCount?: number,
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
					badgeCount:
						key === "alerts"
							? activeAlertCount
							: key === "approvals"
								? approvalsPendingCount
								: undefined,
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
