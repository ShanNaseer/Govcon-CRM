import { Card } from "@/components/ui/card";
import { LoadingState, Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <>
      <Skeleton className="mb-5 h-7 w-48" />
      <Card>
        <LoadingState rows={8} label="Loading clients" />
      </Card>
    </>
  );
}
