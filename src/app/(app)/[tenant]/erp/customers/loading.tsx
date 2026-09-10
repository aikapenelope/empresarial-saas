import { Delayed, ListSkeleton } from "@/components/erp/skeletons";

export default function Loading() {
  return (
    <Delayed>
      <ListSkeleton />
    </Delayed>
  );
}
