import { CategoryRankChart } from "@/components/category-rank-chart";
import { QuickActions, type QuickAction } from "@/components/quick-actions";
import { RefundReturnRateChart } from "@/components/refund-return-rate-chart";
import { RevenueChart, type RevenueRow } from "@/components/revenue-chart";
import { DashboardStats } from "@/components/stats";
import type { CategoryMixDatum, ReturnDailyDatum, DashboardStatsData } from "@/utilities/dashboardData";

interface DashboardProps {
	stats: DashboardStatsData[];
	revenueDaily: RevenueRow[];
	categoryMix: CategoryMixDatum[];
	returnDaily: ReturnDailyDatum[];
	refundedSharePct: number;
	quickActions: readonly QuickAction[];
}

export function Dashboard({
	stats,
	revenueDaily,
	categoryMix,
	returnDaily,
	refundedSharePct,
	quickActions,
}: DashboardProps) {
	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
			<DashboardStats stats={stats} />
			<RevenueChart data={revenueDaily} />
			<RefundReturnRateChart daily={returnDaily} refundedSharePct={refundedSharePct} />
			<CategoryRankChart data={categoryMix} />
			<QuickActions actions={quickActions} />
		</div>
	);
}
