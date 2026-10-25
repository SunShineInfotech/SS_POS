import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  LayoutGrid,
  Package,
  PauseCircle,
  RefreshCw,
  Search,
  ShoppingBag,
  Users,
  UtensilsCrossed,
  X,
  Flame,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TableService, Table } from "@/services/table.service";
import {
  ORDERS_EVENT,
  buildOccupancy,
  type TableOccupancy,
} from "@/lib/restaurantOrders.ts";

/* ============================================================
   TYPES & HELPERS
   ============================================================ */

type TableStatus = "Free" | "Booked" | "Packed" | "Out of Service";
type TableType = "dine" | "parcel";
type FilterKey = "all" | "free" | "booked" | "oos";

interface RestaurantTable {
  id: string;
  name: string;
  capacity: number;
  status: TableStatus;
  type: TableType;
  raw: Table;
}

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

// Map API status (1-4) to UI labels
const statusMap: Record<number, TableStatus> = {
  1: "Free",
  2: "Booked",
  3: "Booked", // Reserved → treat as Booked
  4: "Out of Service",
};

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

const elapsed = (iso: string | null, now: number) => {
  if (!iso) return "";
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
};

/** Visual state of a card — "running" / "hold" are local orders on top of API status */
type CardState = "free" | "running" | "hold" | "booked" | "packed" | "oos";

const CARD_STYLES: Record<
  CardState,
  {
    label: string;
    pill: string;
    dot: string;
    tile: string;
    glow: string;
    border: string;
  }
> = {
  free: {
    label: "Free",
    pill: "bg-success/10 text-success",
    dot: "bg-success",
    tile: "from-emerald-500 to-teal-500",
    glow: "bg-emerald-500/15",
    border: "border-border hover:border-success/50",
  },
  running: {
    label: "Running",
    pill: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
    tile: "from-rose-500 to-orange-500",
    glow: "bg-rose-500/20",
    border: "border-destructive/40 hover:border-destructive/70",
  },
  hold: {
    label: "On Hold",
    pill: "bg-warning/15 text-warning",
    dot: "bg-warning",
    tile: "from-amber-500 to-orange-500",
    glow: "bg-amber-500/20",
    border: "border-warning/40 hover:border-warning/70",
  },
  booked: {
    label: "Booked",
    pill: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
    tile: "from-rose-500 to-pink-500",
    glow: "bg-rose-500/15",
    border: "border-destructive/30 hover:border-destructive/60",
  },
  packed: {
    label: "Packed",
    pill: "bg-warning/15 text-warning",
    dot: "bg-warning",
    tile: "from-amber-500 to-yellow-500",
    glow: "bg-amber-500/15",
    border: "border-warning/30 hover:border-warning/60",
  },
  oos: {
    label: "Out of Service",
    pill: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
    tile: "from-slate-400 to-slate-500",
    glow: "bg-slate-500/10",
    border: "border-dashed border-border",
  },
};

/* ============================================================
   PAGE
   ============================================================ */

const RestaurantTables = () => {
  const navigate = useNavigate();
  const company = useMemo(() => getCompanyData(), []);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  // Local running orders / held bills → re-read when they change
  const [ordersVersion, setOrdersVersion] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const fetchTables = useCallback(
    async (silent = false) => {
      if (!company) {
        setError("Company data not found");
        setLoading(false);
        return;
      }
      silent ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const res = await TableService.getTables(
          company.company_id,
          company.franchise_id,
        );
        if (res.status === "success" && res.data) {
          const mapped: RestaurantTable[] = res.data.map((t) => {
            const isParcel =
              t.table_no.toLowerCase().startsWith("p") ||
              t.table_no.toLowerCase().includes("parcel");
            return {
              id: t.table_id,
              name: t.table_no,
              capacity: t.table_Capacity || 0,
              status: statusMap[t.table_status] || "Free",
              type: isParcel ? "parcel" : "dine",
              raw: t,
            } as RestaurantTable;
          });
          setTables(mapped);
        } else {
          toast.error(res.message || "Failed to fetch tables");
          setError(res.message || "Failed to fetch tables");
        }
      } catch (err) {
        console.error("Error fetching tables:", err);
        toast.error("Could not load tables");
        setError("Could not load tables");
      } finally {
        setLoading(false);
        setRefreshing(false);
        setOrdersVersion((v) => v + 1);
      }
    },
    [company],
  );

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  useEffect(() => {
    const bump = () => setOrdersVersion((v) => v + 1);
    const onVisible = () => document.visibilityState === "visible" && bump();
    window.addEventListener(ORDERS_EVENT, bump);
    window.addEventListener("storage", bump);
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", onVisible);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.removeEventListener(ORDERS_EVENT, bump);
      window.removeEventListener("storage", bump);
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(tick);
    };
  }, []);

  const occupancy = useMemo(
    () => buildOccupancy(tables),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tables, ordersVersion],
  );

  // Effective status: a running order or held bill makes the table Booked
  const effective = useMemo(
    () =>
      tables.map((t) => {
        const occ = occupancy.get(String(t.id)) ?? null;
        let state: CardState;
        let status: TableStatus = t.status;
        if (t.status === "Out of Service") state = "oos";
        else if (occ?.running) {
          state = "running";
          status = "Booked";
        } else if (occ && occ.holds.length) {
          state = "hold";
          status = "Booked";
        } else if (t.status === "Booked") state = "booked";
        else if (t.status === "Packed") state = "packed";
        else state = "free";
        return { ...t, status, state, occ };
      }),
    [tables, occupancy],
  );

  const counts = useMemo(() => {
    const free = effective.filter((t) => t.status === "Free").length;
    const booked = effective.filter((t) => t.status === "Booked").length;
    const oos = effective.filter(
      (t) => t.status === "Packed" || t.status === "Out of Service",
    ).length;
    const running = effective.filter((t) => t.state === "running").length;
    const hold = effective.filter((t) => t.state === "hold").length;
    const liveAmount = effective.reduce((s, t) => s + (t.occ?.amount ?? 0), 0);
    const usable = effective.filter(
      (t) => t.status !== "Out of Service",
    ).length;
    return {
      total: effective.length,
      free,
      booked,
      oos,
      running,
      hold,
      liveAmount,
      occupancyPct: usable ? Math.round((booked / usable) * 100) : 0,
    };
  }, [effective]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return effective.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q)) return false;
      if (filter === "free") return t.status === "Free";
      if (filter === "booked") return t.status === "Booked";
      if (filter === "oos")
        return t.status === "Out of Service" || t.status === "Packed";
      return true;
    });
  }, [effective, filter, search]);

  const dine = visible.filter((t) => t.type === "dine");
  const parcel = visible.filter((t) => t.type === "parcel");

  const openTable = (t: RestaurantTable) => {
    // Same navigation as before — pass the original table object (API status)
    const original = tables.find((x) => x.id === t.id) ?? t;
    navigate(`/restaurant-billing/${t.id}`, { state: { table: original } });
  };

  /* ============================================================
     RENDER PIECES
     ============================================================ */

  const renderCard = (t: (typeof effective)[number]) => {
    const st = CARD_STYLES[t.state];
    const Icon = t.type === "parcel" ? Package : UtensilsCrossed;
    const occ: TableOccupancy | null = t.occ;
    const busy = t.state === "running" || t.state === "hold";

    return (
      <button
        key={t.id}
        type="button"
        onClick={() => openTable(t)}
        className={cn(
          "group relative flex flex-col overflow-hidden rounded-2xl border-2 bg-card p-3 text-left shadow-sm outline-none transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98] md:p-4",
          st.border,
          t.state === "oos" && "opacity-70",
        )}
      >
        {/* Layered glow */}
        <span
          className={cn(
            "pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl transition-transform duration-500 group-hover:scale-150",
            st.glow,
          )}
        />

        <div className="relative flex items-start justify-between gap-2">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg transition-transform duration-300 group-hover:rotate-[-6deg] group-hover:scale-105",
              st.tile,
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              st.pill,
            )}
          >
            <span className="relative flex h-1.5 w-1.5">
              {t.state === "running" && (
                <span
                  className={cn(
                    "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                    st.dot,
                  )}
                />
              )}
              <span
                className={cn(
                  "relative inline-flex h-1.5 w-1.5 rounded-full",
                  st.dot,
                )}
              />
            </span>
            {st.label}
          </span>
        </div>

        <p className="relative mt-3 truncate font-display text-lg font-bold leading-tight">
          {t.name}
        </p>
        <p className="relative mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          {t.type === "parcel" ? (
            <>
              <ShoppingBag className="h-3 w-3" /> Takeaway counter
            </>
          ) : (
            <>
              <Users className="h-3 w-3" /> {t.capacity} seats
            </>
          )}
        </p>

        {/* Footer */}
        <div className="relative mt-3 border-t border-border/70 pt-2.5">
          {busy && occ ? (
            <div className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-base font-bold text-foreground">
                  ₹{fmt(occ.amount)}
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">
                  {occ.items} {occ.items === 1 ? "item" : "items"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {elapsed(occ.since, now)}
                </span>
                {occ.holds.length > 0 && (
                  <span className="flex items-center gap-1 font-semibold text-warning">
                    <PauseCircle className="h-3 w-3" />
                    {occ.holds.length} held
                  </span>
                )}
              </div>
            </div>
          ) : (
            <span className="flex items-center justify-between text-[11px] font-medium text-muted-foreground transition-colors group-hover:text-primary">
              {t.state === "oos"
                ? "Not available"
                : t.state === "free"
                  ? "Tap to start order"
                  : "Tap to open"}
              <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
            </span>
          )}
        </div>
      </button>
    );
  };

  const section = (
    title: string,
    icon: typeof UtensilsCrossed,
    tone: string,
    list: typeof effective,
    unit: string,
  ) => {
    const Icon = icon;
    if (!list.length) return null;
    const busy = list.filter((t) => t.status === "Booked").length;
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-base font-bold tracking-tight">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-md",
                tone,
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            {title}
          </h2>
          <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {busy}/{list.length} {unit} busy
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:gap-3 lg:grid-cols-4 xl:grid-cols-5">
          {list.map(renderCard)}
        </div>
      </section>
    );
  };

  /* ---------- States ---------- */
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:gap-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 py-14 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive/70" />
        <p className="mt-3 text-sm font-medium text-destructive">{error}</p>
        <button
          onClick={() => fetchTables()}
          className="mt-4 flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <LayoutGrid className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <p className="mt-3 text-sm font-medium">No tables found</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Please add tables from the Tables page.
        </p>
      </div>
    );
  }

  const kpis = [
    {
      label: "Free",
      value: counts.free,
      icon: CheckCircle2,
      tone: "from-emerald-500 to-teal-500",
      key: "free" as FilterKey,
    },
    {
      label: "Booked",
      value: counts.booked,
      sub:
        counts.running || counts.hold
          ? `${counts.running} running · ${counts.hold} hold`
          : undefined,
      icon: Flame,
      tone: "from-rose-500 to-orange-500",
      key: "booked" as FilterKey,
    },
    {
      label: "Packed / OOS",
      value: counts.oos,
      icon: Ban,
      tone: "from-slate-400 to-slate-600",
      key: "oos" as FilterKey,
    },
    {
      label: "Live Orders",
      value: `₹${fmt(Math.round(counts.liveAmount))}`,
      icon: ShoppingBag,
      tone: "from-violet-500 to-indigo-500",
      key: "all" as FilterKey,
    },
  ];

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.total },
    { key: "free", label: "Free", count: counts.free },
    { key: "booked", label: "Booked", count: counts.booked },
    { key: "oos", label: "OOS", count: counts.oos },
  ];

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Hero / occupancy */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-primary p-4 text-primary-foreground shadow-xl shadow-primary/20 md:p-5">
        <span className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <span className="pointer-events-none absolute -bottom-16 right-24 h-32 w-32 rounded-full bg-white/10" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs opacity-85">Floor overview</p>
            <p className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              {counts.occupancyPct}% occupied
            </p>
            <p className="mt-0.5 text-[11px] opacity-85">
              {counts.booked} of {counts.total - counts.oos} tables busy · tap a
              table to start or continue
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchTables(true)}
            disabled={refreshing}
            aria-label="Refresh"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur transition-colors hover:bg-white/25 active:scale-95"
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
            />
          </button>
        </div>
        <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white transition-all duration-700 ease-out"
            style={{ width: `${counts.occupancyPct}%` }}
          />
        </div>
      </div>

      {/* KPIs — tap to filter */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
        {kpis.map(({ label, value, sub, icon: Icon, tone, key }) => (
          <button
            key={label}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "relative flex items-center gap-2.5 overflow-hidden rounded-2xl border bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
              filter === key && key !== "all"
                ? "border-primary/40 ring-1 ring-primary/20"
                : "border-border",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
                tone,
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="truncate font-display text-lg font-bold">{value}</p>
              {sub && (
                <p className="truncate text-[10px] text-muted-foreground">
                  {sub}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm sm:flex-row sm:items-center">
        <div className="relative sm:w-60">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search table…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-xl pl-9 pr-8"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted/60 p-1 sm:ml-auto sm:flex">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex h-8 items-center justify-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-all",
                filter === f.key
                  ? "bg-card text-primary shadow-sm ring-1 ring-primary/20"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px]",
                  filter === f.key ? "bg-primary/10" : "bg-muted",
                )}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tables */}
      {dine.length === 0 && parcel.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-14 text-center">
          <LayoutGrid className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No tables match</p>
          <button
            onClick={() => {
              setFilter("all");
              setSearch("");
            }}
            className="mt-2 text-xs font-semibold text-primary hover:underline"
          >
            Show all tables
          </button>
        </div>
      ) : (
        <>
          {section(
            "Dine-In Tables",
            UtensilsCrossed,
            "from-violet-500 to-indigo-500",
            dine,
            "tables",
          )}
          {section(
            "Parcel / Takeaway",
            ShoppingBag,
            "from-amber-500 to-orange-500",
            parcel,
            "counters",
          )}
        </>
      )}
    </div>
  );
};

export default RestaurantTables;
