import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "@/components/ui/item";
import type { LucideIcon } from "lucide-react";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

export interface QuickAction {
	title: string;
	description: string;
	href: string;
	icon: LucideIcon;
}

export function QuickActions({ actions }: { actions: readonly QuickAction[] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Acciones rápidas</CardTitle>
				<CardDescription>Accesos directos a las operaciones del día.</CardDescription>
			</CardHeader>
			<CardContent>
				<ItemGroup className="gap-0">
					{actions.map((a) => (
						<Item asChild key={a.title} size="sm">
							<Link href={a.href}>
								<ItemMedia variant="icon"><a.icon aria-hidden="true" /></ItemMedia>
								<ItemContent>
									<ItemTitle>{a.title}</ItemTitle>
									<ItemDescription className="line-clamp-1">
										{a.description}
									</ItemDescription>
								</ItemContent>
								<ItemActions>
									<ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
								</ItemActions>
							</Link>
						</Item>
					))}
				</ItemGroup>
			</CardContent>
		</Card>
	);
}
