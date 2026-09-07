"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { buildNavGroups } from "@/components/app-shared";

interface AppBreadcrumbsProps {
	tenantName: string;
	tenantSlug: string;
	userRole?: string | null;
}

export function AppBreadcrumbs({ tenantName, tenantSlug, userRole }: AppBreadcrumbsProps) {
	const pathname = usePathname();
	const groups = buildNavGroups(tenantSlug, userRole);

	const current = groups
		.flatMap((group) => group.items)
		.find((item) =>
			item.path === pathname
				? true
				: item.path && !item.exact
					? pathname.startsWith(`${item.path}/`)
					: false,
		);

	return (
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbItem>
					<BreadcrumbLink asChild>
						<Link href={`/${tenantSlug}/erp`}>{tenantName}</Link>
					</BreadcrumbLink>
				</BreadcrumbItem>
				{current && (
					<>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage>{current.title}</BreadcrumbPage>
						</BreadcrumbItem>
					</>
				)}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
