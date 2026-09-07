"use client";

import { CartesianGrid, Line, LineChart, XAxis } from "recharts";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Delta, DeltaIcon, DeltaValue } from "@/components/delta";
import { ArrowRightIcon } from "lucide-react";

const chartConfig = {
	returnRate: {
		label: "Return %",
		color: "var(--chart-1)",
	},
} satisfies ChartConfig;

export function RefundReturnRateChart({
	daily,
	refundedSharePct,
}: {
	daily: Array<{ day: string; returnRate: number }>;
	refundedSharePct: number;
}) {
	const first = daily[0];
	const lastW = daily.at(-1) ?? first;
	const returnTrendPct =
		first.returnRate > 0
			? ((lastW.returnRate - first.returnRate) / first.returnRate) * 100
			: 0;

	return (
		<Card className="md:col-span-2">
			<CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-1">
					<CardTitle>Tasa de devoluciones</CardTitle>
					<CardDescription>Últimos 7 días</CardDescription>
				</div>
				<div className="space-y-1">
					<CardTitle className="text-right">
						{refundedSharePct}%
					</CardTitle>
					<CardDescription>of orders refunded</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="mt-auto">
				<ChartContainer
					className="aspect-auto h-56 w-full"
					config={chartConfig}
				>
					<LineChart
						accessibilityLayer
						data={daily}
						margin={{ left: 12, right: 12, top: 12, bottom: 0 }}
					>
						<CartesianGrid horizontal={false} strokeDasharray="3 3" />
						<XAxis
							axisLine={false}
							dataKey="day"
							interval={1}
							minTickGap={8}
							tickLine={false}
							tickMargin={8}
						/>
						<ChartTooltip content={<ChartTooltipContent indicator="line" />} />
						<Line
							dataKey="returnRate"
							dot={false}
							stroke="var(--color-returnRate)"
							strokeWidth={2.5}
							type="monotone"
						/>
					</LineChart>
				</ChartContainer>
			</CardContent>
			<CardFooter>
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-muted-foreground text-xs">
					<Delta value={returnTrendPct}>
						<DeltaIcon />
						<DeltaValue />
					</Delta>
					<span className="inline-flex min-w-0 text-pretty">
						vs first day (last 7 days)
					</span>
				</div>
				<Button
					asChild
					className="text-muted-foreground"
					size="xs"
					variant="ghost"
				>
					<a href="#/orders/returns">
						Returns desk
						<ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
					</a>
				</Button>
			</CardFooter>
		</Card>
	);
}
