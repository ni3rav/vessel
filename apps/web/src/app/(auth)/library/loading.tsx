import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function LibraryCardSkeleton() {
  return (
    <Card className="overflow-hidden shadow-xs">
      <CardHeader className="gap-4 border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-1 items-start gap-3">
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-3/5 max-w-xs" />
              <Skeleton className="h-4 w-2/5 max-w-48" />
            </div>
          </div>
          <Skeleton className="h-6 w-20 rounded-md" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        <Skeleton className="h-24 w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}

export default function LibraryLoading() {
  return (
    <section className="w-full space-y-8">
      <header className="space-y-2">
        <Skeleton className="h-9 w-48 max-w-full sm:h-10" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </header>

      <div className="flex flex-col gap-4">
        <LibraryCardSkeleton />
        <LibraryCardSkeleton />
      </div>
    </section>
  );
}
