import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  LayoutGrid,
  ListChecks,
  Package,
  PauseCircle,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  Timer,
  Users,
  UtensilsCrossed,
  X,
  Flame,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TableService, Table } from "@/services/table.service";
import { ProductImage } from "@/components/shared/ProductImage";
import {
  ORDERS_EVENT,
  buildOccupancy,
  getActiveOrder,
  notifyOrdersChanged,
  saveActiveOrder,
  type TableOccupancy,
} from "@/lib/restaurantOrders.ts";
import {
  firstOrderedAt,
  formatSpan,
  formatTimer,
  lastServedAt,
  minutesSince,
  oldestPendingAt,
  serveProgress,
  sortForServing,
  toggleUnitServed,
  unitFlags,
  waitTone,
  type ServeLine,
  type ServeProgress,
  type WaitTone,
} from "@/lib/serveStatus";

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

/** Serving info for a table that has a running order */
interface ServeInfo {
  lines: ServeLine[];
  progress: ServeProgress;
  /** Oldest unserved item → wait timer starts here */
  pendingSince: string | null;
  /** First item of this visit */
  startedAt: string | null;
  /** Last item served (only when complete) */
  servedAt: string | null;
  /** Serve priority — 1 = longest waiting. 0 = nothing pending */
  rank: number;
}

/** One line's selected change in the checklist */
interface DraftChange {
  line: ServeLine;
  served: number;
  unserved: number;
}

/** Changes of one table inside the confirmation */
interface ConfirmGroup {
  id: string;
  name: string;
  changes: DraftChange[];
}

/** Selected checklist changes waiting for "Are you sure?" */
interface PendingConfirm {
  serve: boolean;
  title: string;
  subtitle: string;
  groups: ConfirmGroup[];
  run: () => void;
}

type LineDraft = Record<number, boolean[]>;

/** Selected flags of a line — falls back to saved flags when nothing is selected */
const flagsFrom = (draft: LineDraft, l: ServeLine) => {
  const base = unitFlags(l);
  const f = draft[l.id];
  return f && f.length === base.length ? f : base;
};

/** What a selection would change compared to the saved order */
const diffLines = (lines: ServeLine[], draft: LineDraft): DraftChange[] =>
  lines
    .map((l) => {
      const base = unitFlags(l);
      let served = 0;
      let unserved = 0;
      flagsFrom(draft, l).forEach((v, i) => {
        if (v !== base[i]) v ? served++ : unserved++;
      });
      return { line: l, served, unserved };
    })
    .filter((c) => c.served || c.unserved);

/** Apply wanted unit flags to order lines */
const applyWanted = (ls: ServeLine[], wanted: LineDraft) => {
  let next = ls;
  for (const l of ls) {
    const want = wanted[l.id];
    const cur = unitFlags(l);
    if (!want || want.length !== cur.length) continue;
    cur.forEach((v, i) => {
      if (want[i] !== v) next = toggleUnitServed(next, l.id, i);
    });
  }
  return next;
};

const pendingUnitsOf = (l: ServeLine) => unitFlags(l).filter((v) => !v).length;

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

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const elapsed = (iso: string | null, now: number) => {
  if (!iso) return "";
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
};

const MOBILE_QUERY = "(max-width: 767px)";
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
};

/** Ticking clock — only components that show a live timer re-render every second */
const useNow = (ms: number) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
};

/** Visual state of a card — "running" / "served" / "hold" are local orders on top of API status */
type CardState =
  | "free"
  | "running"
  | "served"
  | "hold"
  | "booked"
  | "packed"
  | "oos";

/* Light, calm palette — soft tints only, colour carries the status */
const CARD_STYLES: Record<
  CardState,
  { label: string; pill: string; dot: string; tile: string; border: string }
> = {
  free: {
    label: "Free",
    pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    dot: "bg-emerald-500",
    tile: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    border:
      "border-border hover:border-emerald-300 dark:hover:border-emerald-500/40",
  },
  running: {
    label: "Running",
    pill: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
    dot: "bg-rose-500",
    tile: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
    border: "border-rose-200 hover:border-rose-300 dark:border-rose-500/30",
  },
  served: {
    label: "Served",
    pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    dot: "bg-emerald-500",
    tile: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    border:
      "border-emerald-200 hover:border-emerald-300 dark:border-emerald-500/30",
  },
  hold: {
    label: "On Hold",
    pill: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    dot: "bg-amber-500",
    tile: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    border: "border-amber-200 hover:border-amber-300 dark:border-amber-500/30",
  },
  booked: {
    label: "Booked",
    pill: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
    dot: "bg-rose-500",
    tile: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
    border: "border-rose-200 hover:border-rose-300 dark:border-rose-500/30",
  },
  packed: {
    label: "Packed",
    pill: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    dot: "bg-amber-500",
    tile: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    border: "border-amber-200 hover:border-amber-300 dark:border-amber-500/30",
  },
  oos: {
    label: "Out of Service",
    pill: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
    tile: "bg-muted text-muted-foreground",
    border: "border-dashed border-border",
  },
};

const TONE_TEXT: Record<WaitTone, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  late: "text-rose-600 dark:text-rose-400",
};

/* ============================================================
   SMALL COMPONENTS
   ============================================================ */

/** Live mm:ss wait timer — green < 10 min, amber < 20 min, red after */
const LiveTimer = ({
  since,
  className,
  large = false,
}: {
  since: string | null;
  className?: string;
  large?: boolean;
}) => {
  const now = useNow(1000);
  const tone = waitTone(minutesSince(since, now));
  return (
    <span
      title="Waiting since the oldest pending item was ordered"
      className={cn(
        "inline-flex items-center gap-1 font-display font-semibold tabular-nums",
        large ? "text-2xl" : "text-xs",
        TONE_TEXT[tone],
        className,
      )}
    >
      <Timer
        className={cn(
          large ? "h-5 w-5" : "h-3.5 w-3.5",
          tone === "late" && "animate-pulse",
        )}
      />
      {formatTimer(since, now)}
    </span>
  );
};

/**
 * One item in the checklist — one small tick box per unit (qty 3 → 3 boxes).
 * Ticks are only a selection; nothing is saved until "Confirm served".
 * lockServed → already served units can't be un-ticked (pending view).
 */
const ServeItem = ({
  line,
  flags,
  base,
  onUnit,
  onAll,
  lockServed = false,
}: {
  line: ServeLine;
  /** Selected (draft) flags */
  flags: boolean[];
  /** Saved flags */
  base: boolean[];
  onUnit: (index: number) => void;
  onAll: (served: boolean) => void;
  lockServed?: boolean;
}) => {
  const sq = flags.filter(Boolean).length;
  const done = flags.length > 0 && sq === flags.length;
  const edited = flags.some((v, i) => v !== base[i]);
  const pendingCount = base.filter((v) => !v).length;

  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <ProductImage
          src={line.image ?? ""}
          alt={line.name}
          className={cn(
            "h-9 w-9 shrink-0 rounded-lg transition-opacity",
            done && "opacity-50",
          )}
        />
        <div className="min-w-0 flex-1 leading-tight">
          <p
            className={cn(
              "truncate text-sm font-medium",
              done && "text-muted-foreground",
            )}
          >
            {line.name}
          </p>
          <p
            className={cn(
              "mt-0.5 text-[11px]",
              done
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground",
            )}
          >
            {done
              ? "All served"
              : lockServed
                ? `${pendingCount} pending · ${sq} of ${line.qty} served`
                : `${sq} of ${line.qty} served`}
            {edited && <span className="text-primary"> · selected</span>}
          </p>
        </div>
        {(lockServed ? pendingCount > 1 : line.qty > 1) && (
          <button
            type="button"
            onClick={() => onAll(!done)}
            className="shrink-0 text-[11px] font-medium text-primary hover:underline"
          >
            {done ? "Clear" : "Select all"}
          </button>
        )}
      </div>

      {/* Unit tick boxes */}
      <div className="mt-2 flex flex-wrap gap-1.5 pl-12">
        {flags.map((on, idx) => {
          const locked = lockServed && base[idx];
          return (
            <button
              key={idx}
              type="button"
              role="checkbox"
              aria-checked={on}
              disabled={locked}
              aria-label={`${line.name} — unit ${idx + 1} ${on ? "served" : "pending"}`}
              onClick={() => onUnit(idx)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg border text-[11px] font-medium transition-colors active:scale-95 md:h-8 md:w-8",
                on
                  ? "border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary",
                on !== base[idx] &&
                  "ring-2 ring-primary/25 ring-offset-1 ring-offset-card",
                locked && "cursor-not-allowed opacity-50 active:scale-100",
              )}
            >
              {on ? <Check className="h-4 w-4" strokeWidth={2.5} /> : idx + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ============================================================
   PAGE
   ============================================================ */

const RestaurantTables = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
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

  // Table whose serve checklist is open
  const [serveId, setServeId] = useState<string | null>(null);
  // Ticks selected in the checklist (lineId → unit flags), saved on "Confirm served"
  const [draft, setDraft] = useState<LineDraft>({});
  // "Are you sure?" before the selection is saved
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  // 👁 All pending orders view
  const [pendingOpen, setPendingOpen] = useState(false);
  // tableId → lineId → unit flags
  const [pendingDraft, setPendingDraft] = useState<Record<string, LineDraft>>(
    {},
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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

  // Item-level serving info per table + priority rank (oldest wait first)
  const serveMap = useMemo(() => {
    const map = new Map<string, ServeInfo>();
    for (const t of tables) {
      const id = String(t.id);
      let order: any = null;
      try {
        order = getActiveOrder(id);
      } catch {
        order = null;
      }
      const lines: ServeLine[] = Array.isArray(order?.items) ? order.items : [];
      if (!lines.length) continue;
      // Orders saved before this update have no addedAt → use order start time
      const fallback = occupancy.get(id)?.since ?? null;
      const progress = serveProgress(lines);
      map.set(id, {
        lines,
        progress,
        pendingSince: progress.complete
          ? null
          : oldestPendingAt(lines, fallback),
        startedAt: firstOrderedAt(lines, fallback),
        servedAt: progress.complete ? lastServedAt(lines) : null,
        rank: 0,
      });
    }
    [...map.values()]
      .filter((s) => s.pendingSince)
      .sort((a, b) => Date.parse(a.pendingSince!) - Date.parse(b.pendingSince!))
      .forEach((s, i) => {
        s.rank = i + 1;
      });
    return map;
  }, [tables, occupancy]);

  // Effective status: a running order or held bill makes the table Booked
  const effective = useMemo(
    () =>
      tables.map((t) => {
        const id = String(t.id);
        const occ = occupancy.get(id) ?? null;
        const serve = serveMap.get(id) ?? null;
        let state: CardState;
        let status: TableStatus = t.status;
        if (t.status === "Out of Service") state = "oos";
        else if (occ?.running) {
          state = serve?.progress.complete ? "served" : "running";
          status = "Booked";
        } else if (occ && occ.holds.length) {
          state = "hold";
          status = "Booked";
        } else if (t.status === "Booked") state = "booked";
        else if (t.status === "Packed") state = "packed";
        else state = "free";
        return { ...t, status, state, occ, serve };
      }),
    [tables, occupancy, serveMap],
  );
  type EffTable = (typeof effective)[number];

  /* ---------- 👁 Pending orders across all tables ---------- */
  const pendingGroups = useMemo(
    () =>
      effective
        .filter(
          (t) => t.state === "running" && t.serve && !t.serve.progress.complete,
        )
        .sort((a, b) => (a.serve!.rank || 999) - (b.serve!.rank || 999))
        .map((t) => {
          const lines = sortForServing(
            t.serve!.lines.filter((l) => pendingUnitsOf(l) > 0),
          );
          return {
            id: String(t.id),
            table: t,
            serve: t.serve!,
            lines,
            pendingUnits: lines.reduce((s, l) => s + pendingUnitsOf(l), 0),
          };
        })
        .filter((g) => g.lines.length > 0),
    [effective],
  );
  type PendingGroup = (typeof pendingGroups)[number];

  const pendingTotal = pendingGroups.reduce((s, g) => s + g.pendingUnits, 0);

  const counts = useMemo(() => {
    const free = effective.filter((t) => t.status === "Free").length;
    const booked = effective.filter((t) => t.status === "Booked").length;
    const oos = effective.filter(
      (t) => t.status === "Packed" || t.status === "Out of Service",
    ).length;
    const running = effective.filter((t) => t.state === "running").length;
    const served = effective.filter((t) => t.state === "served").length;
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
      served,
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

  const serveTarget = serveId
    ? (effective.find((t) => String(t.id) === serveId && t.serve) ?? null)
    : null;

  // Close the checklist if the order got billed / cleared meanwhile
  useEffect(() => {
    if (serveId && !serveTarget) {
      setServeId(null);
      setConfirm(null);
    }
  }, [serveId, serveTarget]);

  const openTable = (t: RestaurantTable) => {
    // Same navigation as before — pass the original table object (API status)
    const original = tables.find((x) => x.id === t.id) ?? t;
    navigate(`/restaurant-billing/${t.id}`, { state: { table: original } });
  };

  /** Write served flags back into the table's running order */
  const updateServe = (
    t: RestaurantTable,
    change: (lines: ServeLine[]) => ServeLine[],
  ) => {
    const id = String(t.id);
    const order: any = getActiveOrder(id);
    if (!order?.items?.length) {
      toast.error(`Running order not found for ${t.name}`);
      return false;
    }
    const wasComplete = serveProgress(order.items).complete;
    const items = change(order.items);
    saveActiveOrder({ ...order, items });
    notifyOrdersChanged();
    setOrdersVersion((v) => v + 1);
    if (!wasComplete && serveProgress(items).complete) {
      toast.success(`${t.name} — order complete`, {
        description: "All items have been served",
      });
    }
    return true;
  };

  /* ---------- Checklist selection (draft) ---------- */
  // New checklist opened → start with a clean selection
  useEffect(() => {
    setDraft({});
  }, [serveId]);

  const toggleDraftUnit = (l: ServeLine, idx: number) =>
    setDraft((d) => {
      const f = [...flagsFrom(d, l)];
      f[idx] = !f[idx];
      return { ...d, [l.id]: f };
    });

  const setDraftLine = (l: ServeLine, on: boolean) =>
    setDraft((d) => ({
      ...d,
      [l.id]: unitFlags(l).map(() => on),
    }));

  const setDraftAll = (lines: ServeLine[], on: boolean) =>
    setDraft((d) => {
      const next = { ...d };
      lines.forEach((l) => {
        next[l.id] = unitFlags(l).map(() => on);
      });
      return next;
    });

  const draftChanges = diffLines(serveTarget?.serve?.lines ?? [], draft);
  const draftServed = draftChanges.reduce((s, c) => s + c.served, 0);
  const draftUnserved = draftChanges.reduce((s, c) => s + c.unserved, 0);

  /** "Confirm served" → one confirmation for the whole selection */
  const askSaveDraft = () => {
    if (!serveTarget || !draftChanges.length) return;
    const t = serveTarget;
    const wanted: LineDraft = {};
    draftChanges.forEach((c) => {
      wanted[c.line.id] = flagsFrom(draft, c.line);
    });
    const units = draftServed + draftUnserved;
    setConfirm({
      serve: draftUnserved === 0,
      title:
        draftUnserved === 0
          ? `Mark ${plural(units, "item")} as served?`
          : draftServed === 0
            ? `Mark ${plural(units, "item")} as not served?`
            : "Save serve changes?",
      subtitle: `${t.name} · please check before saving`,
      groups: [{ id: String(t.id), name: t.name, changes: draftChanges }],
      run: () => {
        updateServe(t, (ls) => applyWanted(ls, wanted));
        setDraft({});
      },
    });
  };

  /* ---------- 👁 Pending view selection ---------- */
  // Opened → clean selection, everything expanded
  useEffect(() => {
    if (pendingOpen) {
      setPendingDraft({});
      setCollapsed({});
    }
  }, [pendingOpen]);

  const togglePendingUnit = (tid: string, l: ServeLine, idx: number) =>
    setPendingDraft((d) => {
      if (unitFlags(l)[idx]) return d; // already served → locked
      const td = d[tid] ?? {};
      const f = [...flagsFrom(td, l)];
      f[idx] = !f[idx];
      return { ...d, [tid]: { ...td, [l.id]: f } };
    });

  const setPendingLine = (tid: string, l: ServeLine, on: boolean) =>
    setPendingDraft((d) => ({
      ...d,
      [tid]: { ...(d[tid] ?? {}), [l.id]: unitFlags(l).map((b) => b || on) },
    }));

  const setPendingTable = (g: PendingGroup, on: boolean) =>
    setPendingDraft((d) => {
      const td = { ...(d[g.id] ?? {}) };
      g.lines.forEach((l) => {
        td[l.id] = unitFlags(l).map((b) => b || on);
      });
      return { ...d, [g.id]: td };
    });

  const setPendingEverything = (on: boolean) =>
    setPendingDraft(() => {
      if (!on) return {};
      const next: Record<string, LineDraft> = {};
      pendingGroups.forEach((g) => {
        const td: LineDraft = {};
        g.lines.forEach((l) => {
          td[l.id] = unitFlags(l).map(() => true);
        });
        next[g.id] = td;
      });
      return next;
    });

  const isGroupAllSelected = (g: PendingGroup) =>
    g.lines.every((l) => flagsFrom(pendingDraft[g.id] ?? {}, l).every(Boolean));

  const pendingChanges: ConfirmGroup[] = pendingGroups
    .map((g) => ({
      id: g.id,
      name: g.table.name,
      changes: diffLines(g.lines, pendingDraft[g.id] ?? {}),
    }))
    .filter((g) => g.changes.length > 0);

  const pendingSelected = pendingChanges.reduce(
    (s, g) => s + g.changes.reduce((x, c) => x + c.served, 0),
    0,
  );
  const allPendingSelected =
    pendingGroups.length > 0 && pendingGroups.every(isGroupAllSelected);

  /** Submit → confirmation → mark selected pending units as served */
  const askSubmitPending = () => {
    if (!pendingChanges.length) return;
    const groups = pendingChanges;
    const wanted: Record<string, LineDraft> = {};
    groups.forEach((g) => {
      const td: LineDraft = {};
      g.changes.forEach((c) => {
        td[c.line.id] = flagsFrom(pendingDraft[g.id] ?? {}, c.line);
      });
      wanted[g.id] = td;
    });
    const units = pendingSelected;
    setConfirm({
      serve: true,
      title: `Mark ${plural(units, "item")} as served?`,
      subtitle: `${plural(groups.length, "table")} · please check before saving`,
      groups,
      run: () => {
        let saved = 0;
        groups.forEach((g) => {
          const t = tables.find((x) => String(x.id) === g.id);
          if (!t) return;
          if (updateServe(t, (ls) => applyWanted(ls, wanted[g.id]))) saved++;
        });
        setPendingDraft({});
        if (saved) {
          toast.success(`${plural(units, "item")} marked as served`, {
            description: `Updated ${plural(saved, "table")}`,
          });
        }
      },
    });
  };

  /* ============================================================
     RENDER PIECES
     ============================================================ */

  const renderCard = (t: EffTable) => {
    const st = CARD_STYLES[t.state];
    const Icon = t.type === "parcel" ? Package : UtensilsCrossed;
    const occ: TableOccupancy | null = t.occ;
    const serve = t.serve;
    const busy =
      t.state === "running" || t.state === "served" || t.state === "hold";
    const live = (t.state === "running" || t.state === "served") && !!serve;
    const complete = t.state === "served";

    return (
      <div
        key={t.id}
        role="button"
        tabIndex={0}
        onClick={() => openTable(t)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openTable(t);
          }
        }}
        className={cn(
          "group flex h-full cursor-pointer flex-col rounded-2xl border bg-card p-3 text-left shadow-sm outline-none transition-all duration-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]",
          st.border,
          t.state === "oos" && "opacity-70",
        )}
      >
        {/* Row 1 — icon + status (status no longer squeezes the name) */}
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              st.tile,
            )}
          >
            {complete ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Icon className="h-4 w-4" />
            )}
          </span>
          <div className="flex min-w-0 items-center gap-1">
            {serve && serve.rank > 0 && t.state === "running" && (
              <span
                title="Serve priority — longest waiting table first"
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  serve.rank === 1
                    ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                    : "bg-muted text-muted-foreground",
                )}
              >
                #{serve.rank}
              </span>
            )}
            <span
              className={cn(
                "flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                st.pill,
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  st.dot,
                  t.state === "running" && "animate-pulse",
                )}
              />
              <span className="truncate">{st.label}</span>
            </span>
          </div>
        </div>

        {/* Row 2 — full width table name */}
        <p
          title={t.name}
          className="mt-2.5 truncate font-display text-base font-semibold leading-tight"
        >
          {t.name}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          {t.type === "parcel" ? (
            <>
              <ShoppingBag className="h-3 w-3" /> Takeaway
            </>
          ) : (
            <>
              <Users className="h-3 w-3" /> {t.capacity} seats
            </>
          )}
        </p>

        {/* Live — timer / complete + checklist icon on the right */}
        {live && serve && (
          <div className="mt-3 flex items-center gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center justify-between gap-1.5">
                {complete ? (
                  <span className="flex min-w-0 items-center gap-1 truncate text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Complete</span>
                  </span>
                ) : (
                  <LiveTimer since={serve.pendingSince} />
                )}
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {complete && serve.startedAt && serve.servedAt
                    ? formatSpan(serve.startedAt, serve.servedAt)
                    : `${serve.progress.servedQty}/${serve.progress.qty}`}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    complete ? "bg-emerald-500" : "bg-primary/70",
                  )}
                  style={{ width: `${serve.progress.pct}%` }}
                />
              </div>
            </div>

            {/* Serve checklist — icon button */}
            <button
              type="button"
              aria-label={`Open serve checklist for ${t.name}`}
              title="Serve checklist"
              onClick={(e) => {
                e.stopPropagation();
                setServeId(String(t.id));
              }}
              onKeyDown={(e) => e.stopPropagation()}
              className={cn(
                "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-sm active:scale-90",
                complete
                  ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"
                  : "border-primary/20 bg-primary/5 text-primary hover:bg-primary/10",
              )}
            >
              <ListChecks className="h-4 w-4" />
              {!complete && serve.progress.pendingLines > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground ring-2 ring-card">
                  {serve.progress.pendingLines}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Pushes the footer down → every card in a row has the same height */}
        <div className="min-h-3 flex-1" />

        {/* Footer */}
        <div className="border-t border-border/70 pt-2">
          {busy && occ ? (
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-sm font-semibold text-foreground">
                ₹{fmt(occ.amount)}
              </span>
              <span className="flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground">
                {occ.holds.length > 0 ? (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <PauseCircle className="h-3 w-3" />
                    {occ.holds.length} held
                  </span>
                ) : (
                  <>
                    <Clock className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      <span>
                        {elapsed(serve?.startedAt ?? occ.since, now)} ·{" "}
                      </span>
                      {occ.items} {occ.items === 1 ? "item" : "items"}
                    </span>
                  </>
                )}
              </span>
            </div>
          ) : (
            <span className="flex items-center justify-between text-[11px] text-muted-foreground transition-colors group-hover:text-primary">
              {t.state === "oos"
                ? "Not available"
                : t.state === "free"
                  ? "Tap to start order"
                  : "Tap to open"}
              <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
          )}
        </div>
      </div>
    );
  };

  const section = (
    title: string,
    icon: typeof UtensilsCrossed,
    tone: string,
    list: EffTable[],
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
        <div className="grid grid-cols-1 items-stretch gap-2.5 sm:grid-cols-3 md:gap-3 lg:grid-cols-4 xl:grid-cols-5">
          {list.map(renderCard)}
        </div>
      </section>
    );
  };

  /** One table block inside the pending sheet */
  const renderPendingGroup = (g: PendingGroup) => {
    const td = pendingDraft[g.id] ?? {};
    const isCollapsed = !!collapsed[g.id];
    const selected = diffLines(g.lines, td).reduce((s, c) => s + c.served, 0);
    const allSel = isGroupAllSelected(g);
    const Icon = g.table.type === "parcel" ? Package : UtensilsCrossed;

    return (
      <div
        key={g.id}
        className={cn(
          "overflow-hidden rounded-2xl border bg-card shadow-sm transition-colors",
          selected > 0 ? "border-primary/30" : "border-border",
        )}
      >
        {/* Table header — tap to collapse */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
          aria-expanded={!isCollapsed}
          className="flex w-full items-center gap-2.5 bg-muted/30 px-3 py-2.5 text-left active:bg-muted/60"
        >
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              CARD_STYLES.running.tile,
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="flex items-center gap-1.5 font-display text-sm font-semibold">
              <span className="truncate">{g.table.name}</span>
              {g.serve.rank > 0 && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    g.serve.rank === 1
                      ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  #{g.serve.rank}
                </span>
              )}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {plural(g.pendingUnits, "item")} pending
              {selected > 0 && (
                <span className="font-medium text-primary">
                  {" "}
                  · {selected} selected
                </span>
              )}
            </p>
          </div>
          <LiveTimer since={g.serve.pendingSince} />
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
              isCollapsed && "-rotate-90",
            )}
          />
        </button>

        {!isCollapsed && (
          <div className="px-3 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center justify-between border-b border-border py-2">
              <button
                type="button"
                onClick={() => {
                  setPendingOpen(false);
                  openTable(g.table);
                }}
                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <Receipt className="h-3.5 w-3.5" />
                Open bill
              </button>
              <button
                type="button"
                onClick={() => setPendingTable(g, !allSel)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                {allSel ? "Clear table" : "Select table"}
              </button>
            </div>
            <div className="divide-y divide-border">
              {g.lines.map((l) => (
                <ServeItem
                  key={l.id}
                  line={l}
                  lockServed
                  flags={flagsFrom(td, l)}
                  base={unitFlags(l)}
                  onUnit={(idx) => togglePendingUnit(g.id, l, idx)}
                  onAll={(on) => setPendingLine(g.id, l, on)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
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
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 md:gap-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
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
        counts.running || counts.served || counts.hold
          ? `${counts.running} waiting · ${counts.served} served · ${counts.hold} hold`
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

  const sheetServe = serveTarget?.serve ?? null;
  const sheetLines = sheetServe ? sortForServing(sheetServe.lines) : [];
  const sheetOrdered = sheetServe ? elapsed(sheetServe.startedAt, now) : "";
  const allSelected =
    sheetLines.length > 0 &&
    sheetLines.every((l) => flagsFrom(draft, l).every(Boolean));

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
          <div className="flex shrink-0 items-center gap-2">
            {/* 👁 Pending orders */}
            <button
              type="button"
              onClick={() => setPendingOpen(true)}
              aria-label={`View pending orders (${pendingTotal})`}
              title="View pending orders"
              className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur transition-colors hover:bg-white/25 active:scale-95"
            >
              <Eye className="h-4 w-4" />
              {pendingTotal > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-primary shadow-md">
                  {pendingTotal > 99 ? "99+" : pendingTotal}
                  <span className="absolute inset-0 animate-ping rounded-full bg-white/60 [animation-duration:2s]" />
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => fetchTables(true)}
              disabled={refreshing}
              aria-label="Refresh"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur transition-colors hover:bg-white/25 active:scale-95"
            >
              <RefreshCw
                className={cn("h-4 w-4", refreshing && "animate-spin")}
              />
            </button>
          </div>
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

      {/* Serve checklist — side menu (bottom sheet on mobile) */}
      <Sheet
        open={!!serveTarget}
        onOpenChange={(v) => {
          if (!v) {
            setServeId(null);
            setConfirm(null);
          }
        }}
      >
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "flex flex-col gap-0 overflow-hidden p-0",
            isMobile
              ? "max-h-[88dvh] rounded-t-3xl border-t-0"
              : "w-full sm:max-w-sm",
          )}
        >
          {isMobile && (
            <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-muted" />
          )}

          <SheetHeader className="space-y-0.5 px-5 pb-3 pr-12 pt-4 text-left">
            <SheetTitle className="truncate font-display text-base">
              {serveTarget?.name ?? "Table"} · Serve checklist
            </SheetTitle>
            <SheetDescription className="text-xs">
              {sheetServe
                ? sheetOrdered === "just now"
                  ? "Ordered just now"
                  : `Ordered ${sheetOrdered} ago`
                : ""}
            </SheetDescription>
          </SheetHeader>

          {serveTarget && sheetServe && (
            <>
              {/* Summary — light */}
              <div className="mx-5 mb-2 rounded-2xl border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  {sheetServe.progress.complete ? (
                    <div className="leading-tight">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                        Order complete
                      </p>
                      {sheetServe.startedAt && sheetServe.servedAt && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Served in{" "}
                          {formatSpan(
                            sheetServe.startedAt,
                            sheetServe.servedAt,
                          )}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="leading-tight">
                      <p className="text-[11px] text-muted-foreground">
                        Waiting time
                        {sheetServe.rank === 1 && " · serve first"}
                      </p>
                      <LiveTimer since={sheetServe.pendingSince} large />
                    </div>
                  )}
                  <div className="text-right leading-tight">
                    <p className="font-display text-lg font-semibold">
                      {sheetServe.progress.servedQty}
                      <span className="text-sm text-muted-foreground">
                        /{sheetServe.progress.qty}
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">served</p>
                  </div>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      sheetServe.progress.complete
                        ? "bg-emerald-500"
                        : "bg-primary/70",
                    )}
                    style={{ width: `${sheetServe.progress.pct}%` }}
                  />
                </div>
              </div>

              {/* Select ready items */}
              <div className="flex items-center justify-between px-5 pb-1 pt-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Select ready items
                </p>
                <button
                  type="button"
                  onClick={() => setDraftAll(sheetLines, !allSelected)}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  {allSelected ? "Clear all" : "Select all"}
                </button>
              </div>

              {/* Items — one tick per unit (selection only) */}
              <div className="flex-1 divide-y divide-border overflow-y-auto overscroll-contain px-5 pb-2">
                {sheetLines.map((l) => (
                  <ServeItem
                    key={l.id}
                    line={l}
                    flags={flagsFrom(draft, l)}
                    base={unitFlags(l)}
                    onUnit={(idx) => toggleDraftUnit(l, idx)}
                    onAll={(on) => setDraftLine(l, on)}
                  />
                ))}
              </div>

              <div className="space-y-2 border-t border-border px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                {draftChanges.length > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground animate-in fade-in">
                    <span>
                      {draftServed + draftUnserved}{" "}
                      {draftServed + draftUnserved === 1 ? "change" : "changes"}{" "}
                      selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setDraft({})}
                      className="flex items-center gap-1 font-medium text-foreground hover:underline"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-[auto_1fr] gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setServeId(null);
                      openTable(serveTarget);
                    }}
                    className="h-10 gap-1.5"
                  >
                    <Receipt className="h-4 w-4" />
                    Open bill
                  </Button>
                  <Button
                    size="sm"
                    disabled={!draftChanges.length}
                    onClick={askSaveDraft}
                    className="h-10 gap-1.5"
                  >
                    <ListChecks className="h-4 w-4" />
                    {draftUnserved && !draftServed
                      ? "Confirm changes"
                      : "Confirm served"}
                    {draftChanges.length > 0 && (
                      <span className="rounded-full bg-white/20 px-1.5 text-[11px]">
                        {draftServed + draftUnserved}
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 👁 Pending orders — all tables (bottom sheet on mobile) */}
      <Sheet
        open={pendingOpen}
        onOpenChange={(v) => {
          setPendingOpen(v);
          if (!v) setConfirm(null);
        }}
      >
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "flex flex-col gap-0 overflow-hidden p-0",
            isMobile
              ? "h-[92dvh] max-h-[92dvh] rounded-t-3xl border-t-0"
              : "w-full sm:max-w-md",
          )}
        >
          {isMobile && (
            <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-muted" />
          )}

          <SheetHeader className="space-y-0.5 px-5 pb-3 pr-12 pt-4 text-left">
            <SheetTitle className="flex items-center gap-2 font-display text-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Eye className="h-4 w-4" />
              </span>
              Pending orders
            </SheetTitle>
            <SheetDescription className="text-xs">
              Longest waiting table first · tick ready items and submit
            </SheetDescription>
          </SheetHeader>

          {pendingGroups.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <p className="mt-3 font-display text-base font-semibold">
                All caught up!
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                No table has a pending item right now.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 h-10"
                onClick={() => setPendingOpen(false)}
              >
                Close
              </Button>
            </div>
          ) : (
            <>
              {/* Summary chips */}
              <div className="mx-5 mb-2 grid grid-cols-3 gap-2">
                {[
                  { label: "Tables", value: pendingGroups.length },
                  { label: "Pending", value: pendingTotal },
                  { label: "Selected", value: pendingSelected },
                ].map((s) => (
                  <div
                    key={s.label}
                    className={cn(
                      "rounded-2xl border bg-muted/30 px-3 py-2 leading-tight",
                      s.label === "Selected" && s.value > 0
                        ? "border-primary/30 bg-primary/5"
                        : "border-border",
                    )}
                  >
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {s.label}
                    </p>
                    <p
                      className={cn(
                        "font-display text-lg font-bold tabular-nums",
                        s.label === "Selected" && s.value > 0 && "text-primary",
                      )}
                    >
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between px-5 pb-2 pt-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Select ready items
                </p>
                <button
                  type="button"
                  onClick={() => setPendingEverything(!allPendingSelected)}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  {allPendingSelected ? "Clear all" : "Select all"}
                </button>
              </div>

              {/* Table groups */}
              <div className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-5 pb-3">
                {pendingGroups.map(renderPendingGroup)}
              </div>

              {/* Sticky footer */}
              <div className="space-y-2 border-t border-border bg-card px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                {pendingSelected > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground animate-in fade-in">
                    <span>
                      {plural(pendingSelected, "item")} from{" "}
                      {plural(pendingChanges.length, "table")} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingDraft({})}
                      className="flex items-center gap-1 font-medium text-foreground hover:underline"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset
                    </button>
                  </div>
                )}
                <Button
                  disabled={!pendingSelected}
                  onClick={askSubmitPending}
                  className="h-12 w-full gap-2 rounded-xl text-sm font-semibold md:h-11"
                >
                  <ListChecks className="h-4 w-4" />
                  Submit
                  {pendingSelected > 0 && (
                    <span className="rounded-full bg-white/20 px-2 text-[11px]">
                      {pendingSelected}
                    </span>
                  )}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Are you sure? */}
      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] gap-0 rounded-2xl p-5 sm:max-w-sm">
          <DialogHeader className="items-center space-y-2 text-center sm:text-center">
            <span
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full",
                confirm?.serve
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                  : "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
              )}
            >
              {confirm?.serve ? (
                <Check className="h-5 w-5" strokeWidth={2.5} />
              ) : (
                <RotateCcw className="h-5 w-5" />
              )}
            </span>
            <DialogTitle className="font-display text-base">
              {confirm?.title}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {confirm?.subtitle}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {confirm?.groups.map((g) => (
              <div key={g.id}>
                {confirm.groups.length > 1 && (
                  <p className="sticky top-0 z-10 bg-muted/90 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                    {g.name}
                  </p>
                )}
                <div className="divide-y divide-border">
                  {g.changes.map((c) => (
                    <div
                      key={c.line.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate">{c.line.name}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs font-medium">
                        {c.served > 0 && (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +{c.served} served
                          </span>
                        )}
                        {c.unserved > 0 && (
                          <span className="text-amber-600 dark:text-amber-400">
                            {c.unserved} undo
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirm(null)}
              className="h-10"
            >
              Cancel
            </Button>
            <Button
              autoFocus
              onClick={() => {
                confirm?.run();
                setConfirm(null);
              }}
              className={cn(
                "h-10",
                confirm?.serve &&
                  "bg-emerald-600 text-white hover:bg-emerald-600/90",
              )}
            >
              {confirm?.serve ? "Yes, served" : "Yes, save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RestaurantTables;
