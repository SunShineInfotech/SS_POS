import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BadgePercent,
  Calculator,
  Crown,
  Package,
  ReceiptIndianRupee,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { inr, type Purchase } from "./Usepurchasedata";

// ---------- Count-up animation ----------

const useCountUp = (value: number, duration = 650) => {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion || from === value) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return display;
};

const AnimatedAmount = ({ value }: { value: number }) => (
  <>{inr(useCountUp(value))}</>
);

const AnimatedCount = ({ value }: { value: number }) => (
  <>{Math.round(useCountUp(value)).toLocaleString("en-IN")}</>
);

// ---------- Component ----------

interface Props {
  data: Purchase[];
  loading?: boolean;
  rangeLabel: string;
  /** Name of the vendor currently filtered, or "" for all vendors */
  selectedVendorName: string;
  /** Called when the Top vendor card is tapped */
  onPickVendor?: (name: string) => void;
}

export const PurchaseKpis = ({
  data,
  loading,
  rangeLabel,
  selectedVendorName,
  onPickVendor,
}: Props) => {
  const kpi = useMemo(() => {
    const bills = data.length;
    const amount = data.reduce((s, p) => s + p.total, 0);
    const taxable = data.reduce((s, p) => s + p.subtotal, 0);
    const gst = data.reduce((s, p) => s + p.gst, 0);
    const discount = data.reduce((s, p) => s + p.discount, 0);
    const items = data.reduce((s, p) => s + p.items, 0);
    const qty = data.reduce((s, p) => s + p.qty, 0);
    const vendorsUsed = new Set(data.map((p) => p.vendor)).size;

    const byVendor = new Map<string, number>();
    data.forEach((p) =>
      byVendor.set(p.vendor, (byVendor.get(p.vendor) || 0) + p.total),
    );
    let topVendor = { name: "", amount: 0 };
    byVendor.forEach((amt, name) => {
      if (amt > topVendor.amount) topVendor = { name, amount: amt };
    });

    return {
      bills,
      amount,
      taxable,
      gst,
      discount,
      items,
      qty,
      vendorsUsed,
      avg: bills ? amount / bills : 0,
      topVendor,
    };
  }, [data]);

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 transition-opacity duration-200 lg:grid-cols-4",
        loading && "opacity-60",
      )}
    >
      {/* Hero: purchase amount */}
      <div className="relative col-span-2 overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-primary/75 p-5 text-primary-foreground shadow-xl shadow-primary/25 animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none lg:row-span-2 lg:p-6">
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-16 right-16 h-40 w-40 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
          <ReceiptIndianRupee className="h-5 w-5" />
        </div>

        <p className="pr-14 text-sm text-primary-foreground/80">
          Purchase amount, {rangeLabel}
        </p>
        <p className="mt-2 font-display text-3xl font-bold tracking-tight lg:text-4xl">
          <AnimatedAmount value={kpi.amount} />
        </p>
        <p className="mt-1 text-xs text-primary-foreground/70">
          Taxable {inr(kpi.taxable)} + GST {inr(kpi.gst)}
          {kpi.discount > 0 && ` - discount ${inr(kpi.discount)}`}
        </p>

        <div className="relative mt-5 grid grid-cols-3 gap-2">
          <HeroStat label="Bills" value={<AnimatedCount value={kpi.bills} />} />
          <HeroStat
            label="Line items"
            value={<AnimatedCount value={kpi.items} />}
          />
          <HeroStat
            label="Vendors"
            value={<AnimatedCount value={kpi.vendorsUsed} />}
          />
        </div>
      </div>

      <KpiCard
        delay={60}
        icon={<Calculator className="h-4 w-4" />}
        tone="bg-sky-500/10 text-sky-600 dark:text-sky-400"
        label="GST paid"
        value={<AnimatedAmount value={kpi.gst} />}
        hint="Input tax credit"
      />
      <KpiCard
        delay={120}
        icon={<BadgePercent className="h-4 w-4" />}
        tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        label="Discount received"
        value={<AnimatedAmount value={kpi.discount} />}
        hint={
          kpi.amount + kpi.discount > 0
            ? `${((kpi.discount / (kpi.amount + kpi.discount)) * 100).toFixed(1)}% saved`
            : "No discount yet"
        }
      />
      <KpiCard
        delay={180}
        icon={<Package className="h-4 w-4" />}
        tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        label="Avg. bill value"
        value={<AnimatedAmount value={kpi.avg} />}
        hint={`${kpi.qty.toLocaleString("en-IN")} units purchased`}
      />
      {selectedVendorName ? (
        <KpiCard
          delay={240}
          icon={<Store className="h-4 w-4" />}
          tone="bg-violet-500/10 text-violet-600 dark:text-violet-400"
          label="Taxable value"
          value={<AnimatedAmount value={kpi.taxable} />}
          hint={selectedVendorName}
        />
      ) : (
        <KpiCard
          delay={240}
          icon={<Crown className="h-4 w-4" />}
          tone="bg-violet-500/10 text-violet-600 dark:text-violet-400"
          label="Top vendor"
          value={
            <span className="block truncate text-base">
              {kpi.topVendor.name || "-"}
            </span>
          }
          hint={kpi.topVendor.name ? inr(kpi.topVendor.amount) : "No purchases"}
          onClick={
            kpi.topVendor.name && onPickVendor
              ? () => onPickVendor(kpi.topVendor.name)
              : undefined
          }
        />
      )}
    </div>
  );
};

// ---------- Small UI pieces ----------

const HeroStat = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="rounded-2xl bg-white/10 px-3 py-2 backdrop-blur">
    <p className="font-display text-lg font-bold leading-tight">{value}</p>
    <p className="text-[11px] text-primary-foreground/75">{label}</p>
  </div>
);

const KpiCard = ({
  icon,
  tone,
  label,
  value,
  hint,
  delay = 0,
  onClick,
}: {
  icon: ReactNode;
  tone: string;
  label: string;
  value: ReactNode;
  hint?: string;
  delay?: number;
  onClick?: () => void;
}) => {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
      className={cn(
        "relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-4 text-left shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none",
        onClick &&
          "touch-manipulation transition-transform hover:border-primary/40 active:scale-[0.98]",
      )}
    >
      <div
        className={cn(
          "mb-3 flex h-9 w-9 items-center justify-center rounded-xl",
          tone,
        )}
      >
        {icon}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold leading-tight">
        {value}
      </p>
      {hint && (
        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          {hint}
        </p>
      )}
    </Tag>
  );
};
