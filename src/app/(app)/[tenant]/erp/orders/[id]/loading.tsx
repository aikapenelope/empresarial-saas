import { Delayed, DetailSkeleton } from "@/components/erp/skeletons";

export default function Loading() {
  return (
    <Delayed>
      <DetailSkeleton />
    </Delayed>
  );
}
