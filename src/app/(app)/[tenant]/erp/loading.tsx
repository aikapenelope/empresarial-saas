import { Delayed } from "@/components/erp/skeletons";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";

export default function Loading() {
  return (
    <Delayed>
      <DashboardSkeleton />
    </Delayed>
  );
}
