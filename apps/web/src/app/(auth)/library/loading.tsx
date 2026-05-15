import { Skeleton } from "@/components/ui/skeleton";

export default function LibraryLoading() {
  return (
    <div className="flex w-full min-h-[min(100dvh,56rem)] flex-col gap-10 lg:flex-row lg:gap-12 xl:gap-16">
      <div className="order-1 flex flex-1 flex-col items-center gap-8 lg:order-2 lg:sticky lg:top-6 lg:self-start">
        <Skeleton className="aspect-square w-full max-w-[min(100%,19rem)] rounded-[1.75rem] sm:max-w-xs" />
        <div className="flex w-full max-w-md flex-col items-center gap-3">
          <Skeleton className="h-8 w-4/5 max-w-sm rounded-lg" />
          <Skeleton className="h-4 w-32 rounded-md" />
        </div>
        <Skeleton className="h-2 w-full max-w-md rounded-full" />
        <div className="flex justify-center gap-4">
          <Skeleton className="size-11 rounded-full" />
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="size-11 rounded-full" />
        </div>
      </div>
      <aside className="order-2 flex w-full flex-col gap-2 lg:order-1 lg:max-h-[calc(100dvh-6rem)] lg:w-72 lg:shrink-0 xl:w-80">
        <Skeleton className="mb-3 h-6 w-24 rounded-md" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-2xl" />
        ))}
      </aside>
    </div>
  );
}
