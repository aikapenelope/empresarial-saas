"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	useSidebar,
} from "@/components/ui/sidebar";
import type { SidebarNavGroup } from "@/components/app-shared";
import { resolveActiveNavItem } from "@/components/app-shared";
import { ChevronRightIcon } from "lucide-react";

export function NavGroup({ label, items }: SidebarNavGroup) {
	const pathname = usePathname();
	// FIX móvil: los links navegan sin desmontar el layout, así que el drawer
	// (Sheet) hay que cerrarlo explícitamente en cada selección.
	const { isMobile, setOpenMobile } = useSidebar();
	const activeItem = resolveActiveNavItem(pathname, items);

	const closeMobile = () => {
		if (isMobile) setOpenMobile(false);
	};

	return (
		<SidebarGroup>
			{label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
			<SidebarMenu>
				{items.map((item) => {
					const isActive = activeItem === item;
					return (
						<Collapsible
							asChild
							className="group/collapsible"
							defaultOpen={isActive || !!item.subItems?.some((i) => i.path === pathname)}
							key={item.title}
						>
							<SidebarMenuItem>
								{item.subItems?.length ? (
									<>
										<CollapsibleTrigger asChild>
											<SidebarMenuButton isActive={isActive} tooltip={item.title}>
												{item.icon ? <item.icon /> : null}
												<span>{item.title}</span>
												<ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
											</SidebarMenuButton>
										</CollapsibleTrigger>
										<CollapsibleContent>
											<SidebarMenuSub>
												{item.subItems?.map((subItem) => {
													const subActive = subItem.path === pathname;
													return (
														<SidebarMenuSubItem key={subItem.title}>
															<SidebarMenuSubButton asChild isActive={subActive}>
																<Link href={subItem.path ?? "#"} onClick={closeMobile}>
																	<span>{subItem.title}</span>
																</Link>
															</SidebarMenuSubButton>
														</SidebarMenuSubItem>
													);
												})}
											</SidebarMenuSub>
										</CollapsibleContent>
									</>
								) : (
									<SidebarMenuItem>
										<SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
											<Link href={item.path ?? "#"} onClick={closeMobile}>
												{item.icon ? <item.icon /> : null}
												<span>{item.title}</span>
											</Link>
										</SidebarMenuButton>
										{item.badgeCount ? (
											<SidebarMenuBadge className="text-foreground">
												{item.badgeCount}
											</SidebarMenuBadge>
										) : null}
									</SidebarMenuItem>
								)}
							</SidebarMenuItem>
						</Collapsible>
					);
				})}
			</SidebarMenu>
		</SidebarGroup>
	);
}
