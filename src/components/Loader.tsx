import { cn } from "@/lib/utils";

/**
 * Keyframes for the loaders. Render <LoaderStyles /> once on any page
 * that uses these components.
 */
const KEYFRAMES = `
@keyframes ldr-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
@keyframes ldr-shimmer { 100% { transform: translateX(100%); } }
@keyframes ldr-pop { 0% { opacity: 0; transform: translateY(6px) scale(.96); } 100% { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .ldr-anim { animation: none !important; }
}
`;

export const LoaderStyles = () => <style>{KEYFRAMES}</style>;

/** Slim indeterminate bar pinned to the top of a relative container */
export const TopProgressBar = ({ active }: { active: boolean }) => (
  <div
    aria-hidden
    className={cn(
      "pointer-events-none absolute inset-x-0 top-0 z-20 h-1 overflow-hidden rounded-t-xl bg-primary/10 transition-opacity duration-300",
      active ? "opacity-100" : "opacity-0",
    )}
  >
    <div
      className="ldr-anim h-full w-2/5 rounded-full bg-gradient-to-r from-primary/0 via-primary to-primary/0"
      style={{ animation: "ldr-slide 1.1s ease-in-out infinite" }}
    />
  </div>
);

/** Grey block with a moving highlight */
export const Shimmer = ({ className }: { className?: string }) => (
  <div
    className={cn("relative overflow-hidden rounded-md bg-muted", className)}
  >
    <div
      className="ldr-anim absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-white/10"
      style={{ animation: "ldr-shimmer 1.4s ease-in-out infinite" }}
    />
  </div>
);

/** Floating "updating" pill shown over content that is being refreshed */
export const LoadingOverlay = ({
  active,
  label = "Loading…",
}: {
  active: boolean;
  label?: string;
}) => {
  if (!active) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-10 flex justify-center rounded-xl bg-background/40 backdrop-blur-[1.5px]"
    >
      <div
        className="ldr-anim sticky top-24 mt-16 flex h-fit items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium shadow-xl shadow-primary/10"
        style={{ animation: "ldr-pop .25s ease-out both" }}
      >
        <span className="relative flex h-4 w-4">
          <span className="absolute inset-0 rounded-full border-2 border-primary/20" />
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
        </span>
        {label}
      </div>
    </div>
  );
};

/** First-load placeholder: table rows on desktop, cards on mobile */
export const TableSkeleton = ({
  rows = 6,
  columns = 8,
}: {
  rows?: number;
  columns?: number;
}) => (
  <div role="status" aria-label="Loading" className="space-y-3">
    {/* Toolbar */}
    <div className="flex items-center justify-between gap-3">
      <Shimmer className="h-10 w-full max-w-sm rounded-xl" />
      <Shimmer className="hidden h-10 w-36 rounded-xl md:block" />
    </div>

    {/* Desktop table */}
    <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
      <div
        className="grid gap-4 border-b border-border bg-muted/40 px-5 py-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <Shimmer key={i} className="h-3.5 w-2/3" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid items-center gap-4 border-b border-border px-5 py-4 last:border-b-0"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            opacity: 1 - r * 0.12,
          }}
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Shimmer
              key={c}
              className={cn(
                "h-4",
                c === 2 ? "w-full" : c % 2 ? "w-1/2" : "w-3/4",
              )}
            />
          ))}
        </div>
      ))}
    </div>

    {/* Mobile cards */}
    <div className="space-y-3 md:hidden">
      {Array.from({ length: Math.min(rows, 4) }).map((_, r) => (
        <div
          key={r}
          className="rounded-2xl border border-border bg-card p-4"
          style={{ opacity: 1 - r * 0.15 }}
        >
          <div className="flex items-center justify-between">
            <Shimmer className="h-4 w-24" />
            <Shimmer className="h-5 w-20 rounded-full" />
          </div>
          <Shimmer className="mt-3 h-4 w-3/5" />
          <div className="mt-4 flex items-center justify-between">
            <Shimmer className="h-3 w-28" />
            <Shimmer className="h-6 w-24" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

/** First-load placeholder for the KPI grid */
export const KpiSkeleton = () => (
  <div
    role="status"
    aria-label="Loading"
    className="grid grid-cols-2 gap-3 lg:grid-cols-4"
  >
    <div className="col-span-2 rounded-3xl bg-primary/10 p-5 lg:row-span-2 lg:p-6">
      <Shimmer className="h-4 w-40 bg-primary/15" />
      <Shimmer className="mt-4 h-10 w-52 bg-primary/15" />
      <Shimmer className="mt-2 h-3 w-44 bg-primary/15" />
      <div className="mt-6 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <Shimmer key={i} className="h-14 rounded-2xl bg-primary/15" />
        ))}
      </div>
    </div>
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="rounded-2xl border border-border bg-card p-4">
        <Shimmer className="h-9 w-9 rounded-xl" />
        <Shimmer className="mt-3 h-3 w-20" />
        <Shimmer className="mt-2 h-5 w-24" />
        <Shimmer className="mt-2 h-3 w-16" />
      </div>
    ))}
  </div>
);
