import { useEffect, useState } from "react";
import { Check, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Keyframes for the loaders. Render <LoaderStyles /> once on any page
 * that uses these components.
 */
const KEYFRAMES = `
@keyframes ldr-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
@keyframes ldr-shimmer { 100% { transform: translateX(100%); } }
@keyframes ldr-pop { 0% { opacity: 0; transform: translateY(6px) scale(.96); } 100% { opacity: 1; transform: none; } }
@keyframes ldr-spin { to { transform: rotate(360deg); } }
@keyframes ldr-spin-rev { to { transform: rotate(-360deg); } }
@keyframes ldr-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
@keyframes ldr-ping { 0% { transform: scale(.85); opacity: .55; } 100% { transform: scale(1.9); opacity: 0; } }
@keyframes ldr-dot { 0%,80%,100% { transform: translateY(0); opacity: .35; } 40% { transform: translateY(-5px); opacity: 1; } }
@keyframes ldr-blob { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(30px,-24px) scale(1.1); } 66% { transform: translate(-22px,18px) scale(.95); } }
@keyframes ldr-sheet-up { 0% { transform: translateY(100%); } 100% { transform: translateY(0); } }
@keyframes ldr-fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
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

/** Three bouncing dots */
const Dots = ({ className }: { className?: string }) => (
  <span className={cn("inline-flex items-end gap-1", className)} aria-hidden>
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="ldr-anim h-1.5 w-1.5 rounded-full bg-primary"
        style={{ animation: `ldr-dot 1.1s ease-in-out ${i * 0.15}s infinite` }}
      />
    ))}
  </span>
);

/** Keeps a component mounted for `ms` after `active` turns false so it can fade out */
const useDelayedUnmount = (active: boolean, ms = 320) => {
  const [mounted, setMounted] = useState(active);
  useEffect(() => {
    if (active) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return mounted;
};

/**
 * Full-screen branded loader — app "splash" feel on mobile and desktop.
 * Covers the whole viewport (including any layout chrome) and fades out.
 */
export const FullScreenLoader = ({
  active,
  label = "Getting things ready",
  sublabel = "Loading products & customers",
}: {
  active: boolean;
  label?: string;
  sublabel?: string;
}) => {
  const mounted = useDelayedUnmount(active);
  if (!mounted) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={active}
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-background transition-opacity duration-300",
        active ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {/* Floating colour blobs for depth */}
      <div
        className="ldr-anim absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
        style={{ animation: "ldr-blob 9s ease-in-out infinite" }}
      />
      <div
        className="ldr-anim absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-accent/25 blur-3xl"
        style={{ animation: "ldr-blob 11s ease-in-out infinite reverse" }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,hsl(var(--background))_70%)]" />

      <div
        className="ldr-anim relative flex flex-col items-center px-6 text-center"
        style={{ animation: "ldr-pop .4s ease-out both" }}
      >
        {/* Logo mark with orbiting rings */}
        <div className="relative flex h-28 w-28 items-center justify-center md:h-32 md:w-32">
          <span
            className="ldr-anim absolute inset-4 rounded-full bg-primary/30"
            style={{
              animation: "ldr-ping 1.8s cubic-bezier(0,0,.2,1) infinite",
            }}
          />
          <span
            className="ldr-anim absolute inset-0 rounded-full border-[3px] border-transparent border-r-primary/40 border-t-primary"
            style={{ animation: "ldr-spin 1.1s linear infinite" }}
          />
          <span
            className="ldr-anim absolute inset-3 rounded-full border-2 border-transparent border-b-accent border-l-accent/50"
            style={{ animation: "ldr-spin-rev 1.6s linear infinite" }}
          />
          <span
            className="ldr-anim relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-xl shadow-primary/30 md:h-16 md:w-16"
            style={{ animation: "ldr-breathe 1.8s ease-in-out infinite" }}
          >
            <Receipt className="h-7 w-7 md:h-8 md:w-8" />
          </span>
        </div>

        <p className="mt-8 flex items-end gap-2 font-display text-lg font-bold tracking-tight md:text-xl">
          {label}
          <Dots className="mb-1.5" />
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{sublabel}</p>

        <div className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-primary/10">
          <div
            className="ldr-anim h-full w-2/5 rounded-full bg-gradient-to-r from-primary/0 via-primary to-primary/0"
            style={{ animation: "ldr-slide 1.1s ease-in-out infinite" }}
          />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
        Point of Sale
      </div>
    </div>
  );
};

export interface ProcessingStep {
  key: string;
  label: string;
}

/**
 * Step-by-step progress for multi-request actions (e.g. save customer → save bill → print).
 * Bottom sheet on mobile, centred card on desktop.
 */
export const ProcessingOverlay = ({
  active,
  steps,
  current,
  title = "Processing",
}: {
  active: boolean;
  steps: ProcessingStep[];
  current: number; // index of the step in progress
  title?: string;
}) => {
  const mounted = useDelayedUnmount(active, 200);
  if (!mounted) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-0 z-[90] flex items-end justify-center bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 md:items-center",
        active ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div
        className="ldr-anim w-full rounded-t-3xl border border-border bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl md:max-w-sm md:rounded-3xl md:pb-6"
        style={{ animation: "ldr-sheet-up .3s cubic-bezier(.32,.72,0,1) both" }}
      >
        <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-muted md:hidden" />
        <div className="flex items-center gap-3">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <span
              className="ldr-anim absolute inset-0 rounded-2xl border-2 border-transparent border-t-primary"
              style={{ animation: "ldr-spin 0.9s linear infinite" }}
            />
            <Receipt className="h-5 w-5 text-primary" />
          </span>
          <div>
            <p className="font-display text-base font-bold">{title}</p>
            <p className="text-xs text-muted-foreground">
              Please don't close the app
            </p>
          </div>
        </div>

        <ol className="mt-5 space-y-3">
          {steps.map((step, i) => {
            const done = i < current;
            const running = i === current;
            return (
              <li key={step.key} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                    done && "bg-success text-white",
                    running && "bg-primary/10 text-primary",
                    !done && !running && "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? (
                    <Check className="h-4 w-4" />
                  ) : running ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={cn(
                    "text-sm transition-colors",
                    done &&
                      "text-muted-foreground line-through decoration-muted-foreground/40",
                    running && "font-semibold text-foreground",
                    !done && !running && "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
};

/** First-load placeholder for the POS product grid (matches the card layout) */
export const ProductGridSkeleton = ({ count = 18 }: { count?: number }) => (
  <div
    role="status"
    aria-label="Loading products"
    className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 md:gap-3"
  >
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="overflow-hidden rounded-xl border border-border bg-card p-1.5"
        style={{ opacity: Math.max(1 - Math.floor(i / 6) * 0.2, 0.35) }}
      >
        <Shimmer className="aspect-square w-full rounded-lg" />
        <div className="space-y-1.5 px-1 pb-1 pt-2">
          <Shimmer className="h-3 w-4/5" />
          <Shimmer className="h-3.5 w-1/2" />
        </div>
      </div>
    ))}
  </div>
);

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
