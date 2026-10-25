import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DatePicker } from "./Datepicker";
import {
  TimePicker,
  formatTime12,
  formatHour,
  hourToValue,
  valueToHour,
  AM_HOURS,
  PM_HOURS,
} from "../components/ui/Timepicker";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Inbox,
  MessageCircle,
  Package,
  Phone,
  PieChart as PieChartIcon,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Store,
  TrendingDown,
  TrendingUp,
  Trophy,
  Truck,
  Users,
  Wallet,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/* ============================================================
 * CONFIG
 * ============================================================ */
// Same API base URL the POS page uses
const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  "https://sunshineproduct.in/POS/v1_api/";
const AUTO_REFRESH_MS = 60_000; // auto refresh every minute while the range includes today

/** The POS saves the logged-in profile in `company_data`; read the ids from there. */
const getUserProfile = (): {
  company_id?: string | number;
  franchise_id?: string | number;
} => {
  try {
    return JSON.parse(localStorage.getItem("company_data") || "{}") ?? {};
  } catch {
    return {};
  }
};

/* Outlet: defaults to the profile franchise_id; the user's choice is saved in "dashboard_outlet" ("0" = all outlets) */
const OUTLET_KEY = "dashboard_outlet";
const readOutlet = (): string => {
  try {
    const saved = localStorage.getItem(OUTLET_KEY);
    if (saved !== null && /^\d+$/.test(saved)) return saved;
  } catch {
    /* ignore */
  }
  return String(getUserProfile().franchise_id ?? "").trim();
};
const saveOutlet = (v: string) => {
  try {
    localStorage.setItem(OUTLET_KEY, v);
  } catch {
    /* ignore */
  }
};

async function apiGet<T>(
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const companyId = String(getUserProfile().company_id ?? "").trim();
  const franchiseId = readOutlet();
  if (!companyId)
    throw new Error(
      "Login data (company_data) not found. Please log out and log in again.",
    );

  const qs = new URLSearchParams({ ...params, company_id: companyId });
  if (franchiseId) qs.set("franchise_id", franchiseId);

  const url = `${API_URL.replace(/\/+$/, "")}/dashboard.php?${qs.toString()}`;
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error(
      "Could not reach the server. Check your internet connection or the API URL.",
    );
  }

  const text = await res.text();
  let json: { success?: boolean; message?: string; data?: unknown } | null =
    null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!json) {
    throw new Error(
      res.status === 404
        ? "dashboard.php not found (404). Upload it to the v1_api/ folder."
        : `The server returned an invalid response (HTTP ${res.status}). Check the PHP error log.`,
    );
  }
  if (!res.ok || json.success === false)
    throw new Error(json.message || `Request failed (${res.status})`);
  return json.data as T;
}

/* ============================================================
 * TYPES
 * ============================================================ */
type Granularity = "daily" | "monthly" | "yearly";
type Tone =
  | "primary"
  | "success"
  | "info"
  | "warning"
  | "destructive"
  | "accent";

interface Filter {
  fromDate: string; // yyyy-MM-dd
  fromTime: string; // HH:00
  toDate: string;
  toTime: string; // HH:59
}

interface Kpi {
  value: number;
  prev: number;
}
interface OutRow {
  id: number;
  name: string;
  mobile: string;
  amount: number;
  last: string | null;
}
interface ProductRow {
  name: string;
  qty: number;
  revenue: number;
}
interface OrderRow {
  id: number;
  invoice_no: string;
  customer: string;
  amount: number;
  paid: number;
  payment_mode: string;
  status: "Paid" | "Partial" | "Pending";
  created_at: string;
}
interface HourRow {
  hour: number;
  sales: number;
  orders: number;
}
interface Outlet {
  id: number;
  name: string;
  code: string;
  type: "Shop" | "Restaurant";
  bills: number;
}

interface Summary {
  period: { from: string; to: string; prev_from: string; prev_to: string };
  kpis: {
    sales: Kpi;
    orders: Kpi;
    customers: Kpi;
    purchases: Kpi;
    other_income: Kpi;
    other_expense: Kpi;
    collection: Kpi;
  };
  low_stock: number;
  collections: {
    today: number;
    month: number;
    fy: number;
    by_mode: { mode: string; amount: number }[];
  };
  outstanding: {
    customers_total: number;
    vendors_total: number;
    customers: OutRow[];
    vendors: OutRow[];
  };
  top_products: { by_revenue: ProductRow[]; by_qty: ProductRow[] };
  expense_by_category: { name: string; value: number }[];
  recent_orders: OrderRow[];
  hourly?: HourRow[];
  meta: {
    min_year: number;
    server_time: string;
    low_stock_limit: number;
    company_id?: number;
    franchise_id?: number;
    franchises?: Outlet[];
  };
}

interface TrendResp {
  granularity: Granularity;
  series: { label: string; a: number; b: number }[];
  totals: { a: number; b: number };
}

/* ============================================================
 * HELPERS
 * ============================================================ */
const CURRENT_YEAR = new Date().getFullYear();
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDate = (s: string) =>
  new Date(
    s.includes(" ") ? s.replace(" ", "T") : s.length === 10 ? `${s}T00:00` : s,
  );

const inr = (n: number) =>
  `${n < 0 ? "-" : ""}₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;
const num = (n: number) => Math.round(n).toLocaleString("en-IN");
const compactInr = (n: number) => {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1)}K`;
  return `${s}₹${Math.round(a)}`;
};
const pct = (cur: number, prev: number): number | null => {
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / Math.abs(prev)) * 100;
};
const timeAgo = (s: string) => {
  const d = toDate(s);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 0)
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};
const shortDate = (s: string) =>
  toDate(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
const longDate = (s: string) =>
  toDate(s).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const weekdayDate = (s: string) =>
  toDate(s).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";
const tap = () => {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* haptic not supported */
  }
};
const waLink = (mobile: string, name: string, amount: number) => {
  let d = mobile.replace(/\D/g, "");
  if (d.length === 10) d = `91${d}`;
  const msg = encodeURIComponent(
    `Hello ${name}, your payment of ${inr(amount)} is pending. Kindly clear it at the earliest. Thank you!`,
  );
  return `https://wa.me/${d}?text=${msg}`;
};
const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

const todayStr = () => ymd(new Date());
const defaultFilter = (): Filter => {
  const t = todayStr();
  return { fromDate: t, fromTime: "00:00", toDate: t, toTime: "23:59" };
};
const periodText = (f: Filter) =>
  f.fromDate === f.toDate
    ? `${shortDate(f.fromDate)}, ${formatTime12(f.fromTime)} – ${formatTime12(f.toTime)}`
    : `${shortDate(f.fromDate)}, ${formatTime12(f.fromTime)} → ${shortDate(f.toDate)}, ${formatTime12(f.toTime)}`;
const validateFilter = (f: Filter): string | null => {
  if (!f.fromDate || !f.toDate || !f.fromTime || !f.toTime)
    return "Please select start and end date-time";
  if (`${f.fromDate} ${f.fromTime}` > `${f.toDate} ${f.toTime}`)
    return "Start must be before End";
  return null;
};
const sameFilter = (a: Filter, b: Filter) =>
  a.fromDate === b.fromDate &&
  a.fromTime === b.fromTime &&
  a.toDate === b.toDate &&
  a.toTime === b.toTime;
/** When Start moves past End, push End forward so the range stays valid */
const fixEnd = (f: Filter): Filter => {
  let { toDate, toTime } = f;
  if (f.fromDate > toDate) toDate = f.fromDate;
  if (f.fromDate === toDate && f.fromTime > toTime)
    toTime = `${f.fromTime.slice(0, 2)}:59`;
  return { ...f, toDate, toTime };
};

const TONE: Record<Tone, { soft: string; text: string; bar: string }> = {
  primary: { soft: "bg-primary/10", text: "text-primary", bar: "bg-primary" },
  success: { soft: "bg-success/10", text: "text-success", bar: "bg-success" },
  info: { soft: "bg-info/10", text: "text-info", bar: "bg-info" },
  warning: { soft: "bg-warning/15", text: "text-warning", bar: "bg-warning" },
  destructive: {
    soft: "bg-destructive/10",
    text: "text-destructive",
    bar: "bg-destructive",
  },
  accent: { soft: "bg-accent/10", text: "text-accent", bar: "bg-accent" },
};

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--info))",
  "hsl(var(--accent))",
  "hsl(var(--destructive))",
];

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "14px",
  fontSize: "12px",
  color: "hsl(var(--foreground))",
  boxShadow: "0 16px 40px -16px rgba(15,23,42,.35)",
  padding: "8px 12px",
};

const DASH_CSS = `
.no-scrollbar{scrollbar-width:none;-ms-overflow-style:none}
.no-scrollbar::-webkit-scrollbar{display:none}
.dash-num{font-variant-numeric:tabular-nums}
@keyframes dashRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.dash-rise{animation:dashRise .6s cubic-bezier(.2,.8,.2,1) both}
.dash-press{transition:transform .16s ease, box-shadow .2s ease, background-color .2s ease}
.dash-press:active{transform:scale(.97)}
.dash-tap{-webkit-tap-highlight-color:transparent}
@keyframes dashPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.85)}}
.dash-live{animation:dashPulse 1.8s ease-in-out infinite}
.dash-card{box-shadow:0 1px 2px rgba(16,24,40,.04),0 12px 32px -18px rgba(16,24,40,.14)}
.dash-card-hover{transition:box-shadow .25s ease, transform .25s ease}
@media (hover:hover){.dash-card-hover:hover{transform:translateY(-2px);box-shadow:0 1px 2px rgba(16,24,40,.04),0 22px 44px -22px rgba(16,24,40,.28)}}
.dash-grid{background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:32px 32px;-webkit-mask-image:radial-gradient(ellipse at 80% 0%,#000 25%,transparent 70%);mask-image:radial-gradient(ellipse at 80% 0%,#000 25%,transparent 70%)}
@media (prefers-reduced-motion:reduce){.dash-rise,.dash-live{animation:none}}
`;

/* ============================================================
 * HOOKS
 * ============================================================ */
const useIsMobile = (breakpoint = 768) => {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
};

const useCountUp = (target: number, duration = 750) => {
  const [value, setValue] = useState(target);
  const fromRef = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const start = fromRef.current;
    if (reduce || start === target) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(start + (target - start) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = target;
    };
  }, [target, duration]);
  return value;
};

const useSummary = (filter: Filter, outlet: string) => {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const hasData = useRef(false);

  useEffect(() => {
    const ctrl = new AbortController();
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    setError(null);

    apiGet<Summary>(
      {
        action: "summary",
        from_date: filter.fromDate,
        to_date: filter.toDate,
        from_time: filter.fromTime,
        to_time: filter.toTime,
      },
      ctrl.signal,
    )
      .then((d) => {
        setData(d);
        hasData.current = true;
        setUpdatedAt(new Date());
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError")
          setError(e.message || "Something went wrong");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => ctrl.abort();
  }, [
    filter.fromDate,
    filter.toDate,
    filter.fromTime,
    filter.toTime,
    outlet,
    tick,
  ]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, refreshing, error, updatedAt, refresh };
};

/* ============================================================
 * UI PRIMITIVES
 * ============================================================ */
const AnimatedNumber = ({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) => {
  const v = useCountUp(value);
  return <>{format(v)}</>;
};

const Sk = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded-2xl bg-muted/70 ${className}`} />
);

const EmptyState = ({
  text = "No data for this period",
  icon: Icon = Inbox,
}: {
  text?: string;
  icon?: LucideIcon;
}) => (
  <div className="flex flex-col items-center justify-center py-10 text-center">
    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/70">
      <Icon className="h-6 w-6 text-muted-foreground/70" />
    </div>
    <p className="text-[13px] font-medium text-muted-foreground">{text}</p>
  </div>
);

const IconTile = ({
  icon: Icon,
  tone = "primary",
  size = "md",
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
}) => {
  const box =
    size === "lg"
      ? "h-11 w-11 rounded-2xl"
      : size === "sm"
        ? "h-8 w-8 rounded-xl"
        : "h-10 w-10 rounded-xl";
  const ic = size === "lg" ? "h-5 w-5" : "h-[18px] w-[18px]";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${box} ${TONE[tone].soft} ${TONE[tone].text}`}
    >
      <Icon className={ic} strokeWidth={2.2} />
    </span>
  );
};

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex shrink-0 rounded-full bg-muted/80 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => {
            tap();
            onChange(o.value);
          }}
          className={`dash-tap rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${
            value === o.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const ChangePill = ({
  cur,
  prev,
  invert = false,
  onDark = false,
}: {
  cur: number;
  prev: number;
  invert?: boolean;
  onDark?: boolean;
}) => {
  const p = pct(cur, prev);
  if (p === null) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${onDark ? "bg-white/15 text-white" : "bg-info/10 text-info"}`}
      >
        New
      </span>
    );
  }
  if (Math.abs(p) < 0.05) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold dash-num ${onDark ? "bg-white/10 text-white/70" : "bg-muted text-muted-foreground"}`}
      >
        0%
      </span>
    );
  }
  const up = p >= 0;
  const good = invert ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  const cls = onDark
    ? good
      ? "bg-emerald-400/15 text-emerald-300"
      : "bg-rose-400/15 text-rose-300"
    : good
      ? "bg-success/10 text-success"
      : "bg-destructive/10 text-destructive";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold dash-num ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(p).toFixed(1)}%
    </span>
  );
};

const Panel = ({
  title,
  subtitle,
  icon,
  tone = "primary",
  action,
  children,
  className = "",
  bodyClass = "",
  delay = 0,
}: {
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  tone?: Tone;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  delay?: number;
}) => (
  <section
    className={`dash-rise dash-card rounded-[22px] border border-border/60 bg-card ${className}`}
    style={{ animationDelay: `${delay}ms` }}
  >
    {title && (
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="flex min-w-0 items-center gap-3">
          {icon && <IconTile icon={icon} tone={tone} size="sm" />}
          <div className="min-w-0">
            <h3 className="truncate font-display text-[15px] font-semibold tracking-tight">
              {title}
            </h3>
            {subtitle && (
              <p className="truncate text-[11px] text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action}
      </header>
    )}
    <div className={`p-4 sm:p-5 ${bodyClass}`}>{children}</div>
  </section>
);

/* ============================================================
 * BOTTOM SHEET (mobile) — swipe down to close
 * ============================================================ */
const BottomSheet = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) => {
  const [drag, setDrag] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const dragHandlers = {
    onTouchStart: (e: TouchEvent) => {
      startRef.current = e.touches[0].clientY;
    },
    onTouchMove: (e: TouchEvent) => {
      if (startRef.current !== null)
        setDrag(Math.max(0, e.touches[0].clientY - startRef.current));
    },
    onTouchEnd: () => {
      if (drag > 90) onClose();
      setDrag(0);
      startRef.current = null;
    },
  };

  return (
    <div
      className={`fixed inset-0 z-[60] ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
      // fully hide after the close animation so it never shows on long pages
      style={{
        visibility: open ? "visible" : "hidden",
        transition: open ? "visibility 0s" : "visibility 0s linear 320ms",
      }}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-slate-950/55 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-[30px] bg-card shadow-[0_-20px_60px_-20px_rgba(15,23,42,.45)] transition-transform duration-300 ease-[cubic-bezier(.2,.9,.25,1)]"
        style={{
          transform: open ? `translateY(${drag}px)` : "translateY(105%)",
          transition: drag ? "none" : undefined,
        }}
      >
        <div {...dragHandlers} className="touch-none">
          <div className="flex justify-center pb-1 pt-3">
            <div className="h-1.5 w-11 rounded-full bg-muted-foreground/25" />
          </div>
          <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-1">
            <div className="min-w-0">
              <h3 className="font-display text-[17px] font-bold tracking-tight">
                {title}
              </h3>
              {subtitle && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="dash-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          {children}
        </div>
        {footer && (
          <div className="border-t border-border/70 bg-card px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================
 * MOBILE DATE SHEET (custom calendar, swipe to change month)
 * ============================================================ */
const WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const MonthCalendar = ({
  value,
  onChange,
  min,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
}) => {
  // Show the month of the opening value (the component remounts on every open)
  const [view, setView] = useState(() => {
    const d = value ? toDate(value) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const swipeX = useRef<number | null>(null);

  const move = (delta: number) => {
    tap();
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  };

  const firstDay = view.getDay();
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const today = todayStr();

  return (
    <div
      onTouchStart={(e) => {
        swipeX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (swipeX.current === null) return;
        const dx = e.changedTouches[0].clientX - swipeX.current;
        if (Math.abs(dx) > 50) move(dx < 0 ? 1 : -1);
        swipeX.current = null;
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="Previous month"
          className="dash-press flex h-10 w-10 items-center justify-center rounded-full border border-border/70"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="font-display text-[15px] font-semibold">
          {view.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        </p>
        <button
          type="button"
          onClick={() => move(1)}
          aria-label="Next month"
          className="dash-press flex h-10 w-10 items-center justify-center rounded-full border border-border/70"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK.map((w) => (
          <span
            key={w}
            className="pb-1 text-[11px] font-semibold uppercase text-muted-foreground"
          >
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} />;
          const v = `${view.getFullYear()}-${pad(view.getMonth() + 1)}-${pad(d)}`;
          const selected = v === value;
          const isToday = v === today;
          const disabled = !!min && v < min;
          return (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => {
                tap();
                onChange(v);
              }}
              className={`dash-tap relative mx-auto flex h-11 w-11 items-center justify-center rounded-2xl text-[14px] font-semibold dash-num transition-all ${
                selected
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                  : disabled
                    ? "text-muted-foreground/30"
                    : "text-foreground active:bg-muted"
              }`}
            >
              {d}
              {isToday && !selected && (
                <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const QuickChip = ({
  children,
  onClick,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
}) => (
  <button
    type="button"
    onClick={() => {
      tap();
      onClick();
    }}
    className={`dash-press dash-tap shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${
      active
        ? "border-primary bg-primary/10 text-primary"
        : "border-border/70 bg-card text-muted-foreground"
    }`}
  >
    {children}
  </button>
);

const MobileDateSheet = ({
  open,
  title,
  value,
  min,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  value: string;
  min?: string;
  onClose: () => void;
  onConfirm: (v: string) => void;
}) => {
  const [temp, setTemp] = useState(value);
  const [calKey, setCalKey] = useState(0);
  useEffect(() => {
    if (open) {
      setTemp(value);
      setCalKey((k) => k + 1); // reopen → jump the calendar to the selected month
    }
  }, [open, value]);

  const now = new Date();
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  const quick = [
    { label: "Today", v: ymd(now) },
    { label: "Yesterday", v: ymd(yest) },
    {
      label: "1st of month",
      v: ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
    },
  ].filter((q) => !min || q.v >= min);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={temp ? weekdayDate(temp) : "Select a date"}
      footer={
        <Button
          onClick={() => {
            tap();
            onConfirm(temp);
          }}
          disabled={!temp}
          className="h-12 w-full gap-2 rounded-2xl bg-gradient-primary font-display text-[15px] hover:opacity-90"
        >
          <Check className="h-4 w-4" /> Set {temp ? longDate(temp) : "date"}
        </Button>
      }
    >
      <MonthCalendar key={calKey} value={temp} onChange={setTemp} min={min} />
      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto">
        {quick.map((q) => (
          <QuickChip
            key={q.label}
            active={temp === q.v}
            onClick={() => {
              setTemp(q.v);
              setCalKey((k) => k + 1);
            }}
          >
            {q.label}
          </QuickChip>
        ))}
      </div>
    </BottomSheet>
  );
};

/* ============================================================
 * MOBILE HOUR SHEET
 * ============================================================ */
const HourGroup = ({
  label,
  hours,
  icon: Icon,
  selected,
  onSelect,
}: {
  label: string;
  hours: number[];
  icon: LucideIcon;
  selected: number | null;
  onSelect: (h: number) => void;
}) => (
  <div>
    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {label}
    </p>
    <div className="grid grid-cols-4 gap-2">
      {hours.map((h) => {
        const active = selected === h;
        return (
          <button
            key={h}
            type="button"
            onClick={() => {
              tap();
              onSelect(h);
            }}
            className={`dash-tap flex h-14 flex-col items-center justify-center rounded-2xl border transition-all ${
              active
                ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                : "border-border/70 bg-card text-foreground active:bg-muted"
            }`}
          >
            <span className="font-display text-[17px] font-bold leading-none dash-num">
              {h % 12 || 12}
            </span>
            <span
              className={`mt-1 text-[10px] font-semibold ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}
            >
              {h < 12 ? "AM" : "PM"}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

const MobileHourSheet = ({
  open,
  title,
  value,
  boundary,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  value: string;
  boundary: "start" | "end";
  onClose: () => void;
  onConfirm: (v: string) => void;
}) => {
  const [hour, setHour] = useState<number | null>(valueToHour(value));
  useEffect(() => {
    if (open) setHour(valueToHour(value));
  }, [open, value]);

  const preview =
    hour !== null ? formatTime12(hourToValue(hour, boundary)) : "--:--";

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={
        boundary === "end"
          ? "Includes the whole selected hour"
          : "From the start of the selected hour"
      }
      footer={
        <Button
          onClick={() => {
            if (hour === null) return;
            tap();
            onConfirm(hourToValue(hour, boundary));
          }}
          disabled={hour === null}
          className="h-12 w-full gap-2 rounded-2xl bg-gradient-primary font-display text-[15px] hover:opacity-90"
        >
          <Check className="h-4 w-4" /> Set {preview}
        </Button>
      }
    >
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-muted/50 px-4 py-3">
        <span className="text-xs font-medium text-muted-foreground">
          {boundary === "end" ? "Till" : "From"}
        </span>
        <span className="font-display text-2xl font-bold tracking-tight dash-num">
          {preview}
        </span>
      </div>
      <div className="space-y-4">
        <HourGroup
          label="AM · Morning"
          hours={AM_HOURS}
          icon={Clock}
          selected={hour}
          onSelect={setHour}
        />
        <HourGroup
          label="PM · Afternoon & Night"
          hours={PM_HOURS}
          icon={Flame}
          selected={hour}
          onSelect={setHour}
        />
      </div>
      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto">
        <QuickChip onClick={() => setHour(new Date().getHours())}>
          Now
        </QuickChip>
        <QuickChip active={hour === 0} onClick={() => setHour(0)}>
          Start of day
        </QuickChip>
        <QuickChip active={hour === 23} onClick={() => setHour(23)}>
          End of day
        </QuickChip>
      </div>
    </BottomSheet>
  );
};

/* ============================================================
 * FILTERS
 * ============================================================ */
type PickerTarget = { field: "from" | "to"; kind: "date" | "time" } | null;

const PickerTile = ({
  label,
  value,
  icon: Icon,
  onClick,
  invalid,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  onClick: () => void;
  invalid?: boolean;
}) => (
  <button
    type="button"
    onClick={() => {
      tap();
      onClick();
    }}
    className={`dash-press dash-tap flex min-w-0 items-center gap-2.5 rounded-2xl border bg-background/60 px-3 py-2.5 text-left ${
      invalid ? "border-destructive/60" : "border-border/70"
    }`}
  >
    <Icon className="h-4 w-4 shrink-0 text-primary" />
    <span className="min-w-0">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="block truncate text-[13px] font-semibold dash-num">
        {value}
      </span>
    </span>
  </button>
);

const RangeLabel = ({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "destructive";
}) => (
  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
    <span
      className={`h-1.5 w-1.5 rounded-full ${tone === "success" ? "bg-success" : "bg-destructive"}`}
    />
    {label}
  </p>
);

const MobileFilterSheet = ({
  open,
  draft,
  error,
  dirty,
  refreshing,
  onClose,
  onPick,
  onToday,
  onApply,
}: {
  open: boolean;
  draft: Filter;
  error: string | null;
  dirty: boolean;
  refreshing: boolean;
  onClose: () => void;
  onPick: (t: PickerTarget) => void;
  onToday: () => void;
  onApply: () => void;
}) => (
  <BottomSheet
    open={open}
    onClose={onClose}
    title="Filter by date & time"
    subtitle={periodText(draft)}
    footer={
      <div className="space-y-2">
        {error && (
          <p className="text-center text-xs font-medium text-destructive">
            {error}
          </p>
        )}
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button
            variant="outline"
            className="h-12 gap-1.5 rounded-2xl px-4"
            onClick={onToday}
          >
            <RotateCcw className="h-4 w-4" /> Today
          </Button>
          <Button
            onClick={onApply}
            disabled={!!error}
            className="h-12 gap-2 rounded-2xl bg-gradient-primary font-display text-[15px] hover:opacity-90"
          >
            {dirty ? (
              <Check className="h-4 w-4" />
            ) : (
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
            )}
            {dirty ? "Apply filter" : "Refresh"}
          </Button>
        </div>
      </div>
    }
  >
    <div className="space-y-4 pb-1">
      <div>
        <RangeLabel label="From" tone="success" />
        <div className="grid grid-cols-[1.25fr_1fr] gap-2">
          <PickerTile
            label="Date"
            icon={CalendarDays}
            value={longDate(draft.fromDate)}
            onClick={() => onPick({ field: "from", kind: "date" })}
          />
          <PickerTile
            label="Time"
            icon={Clock}
            value={formatTime12(draft.fromTime)}
            onClick={() => onPick({ field: "from", kind: "time" })}
          />
        </div>
      </div>
      <div>
        <RangeLabel label="To" tone="destructive" />
        <div className="grid grid-cols-[1.25fr_1fr] gap-2">
          <PickerTile
            label="Date"
            icon={CalendarDays}
            value={longDate(draft.toDate)}
            invalid={!!error}
            onClick={() => onPick({ field: "to", kind: "date" })}
          />
          <PickerTile
            label="Time"
            icon={Clock}
            value={formatTime12(draft.toTime)}
            invalid={!!error}
            onClick={() => onPick({ field: "to", kind: "time" })}
          />
        </div>
      </div>
    </div>
  </BottomSheet>
);

const DesktopFilterBar = ({
  draft,
  setDraft,
  error,
  dirty,
  refreshing,
  onToday,
  onApply,
}: {
  draft: Filter;
  setDraft: (f: Filter) => void;
  error: string | null;
  dirty: boolean;
  refreshing: boolean;
  onToday: () => void;
  onApply: () => void;
}) => (
  <Panel delay={40} bodyClass="!p-4">
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="min-w-0">
        <RangeLabel label="From" tone="success" />
        <div className="flex gap-2">
          <DatePicker
            value={draft.fromDate}
            onChange={(v) => setDraft(fixEnd({ ...draft, fromDate: v }))}
            className="h-11 w-[170px] rounded-xl"
          />
          <TimePicker
            value={draft.fromTime}
            boundary="start"
            onChange={(v) => setDraft(fixEnd({ ...draft, fromTime: v }))}
            className="h-11 w-[140px] rounded-xl"
          />
        </div>
      </div>
      <div className="hidden h-11 items-center lg:flex">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </span>
      </div>
      <div className="min-w-0">
        <RangeLabel label="To" tone="destructive" />
        <div className="flex gap-2">
          <DatePicker
            value={draft.toDate}
            onChange={(v) => setDraft({ ...draft, toDate: v })}
            invalid={!!error}
            className="h-11 w-[170px] rounded-xl"
          />
          <TimePicker
            value={draft.toTime}
            boundary="end"
            onChange={(v) => setDraft({ ...draft, toTime: v })}
            invalid={!!error}
            className="h-11 w-[140px] rounded-xl"
          />
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          className="h-11 gap-1.5 rounded-xl"
          onClick={onToday}
        >
          <RotateCcw className="h-4 w-4" /> Today
        </Button>
        <Button
          onClick={onApply}
          disabled={!!error}
          className="h-11 min-w-[124px] gap-2 rounded-xl bg-gradient-primary px-5 font-display hover:opacity-90"
        >
          {dirty ? (
            <Check className="h-4 w-4" />
          ) : (
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
          )}
          {dirty ? "Apply" : "Refresh"}
        </Button>
      </div>
    </div>
    {error && (
      <p className="mt-3 text-xs font-medium text-destructive">{error}</p>
    )}
  </Panel>
);

/* ============================================================
 * OUTLET SELECT
 * ============================================================ */
const outletLabel = (o: Outlet) =>
  `${o.name}${o.code ? ` · ${o.code}` : ""} (${o.type})`;

const OutletSelect = ({
  value,
  outlets,
  onChange,
}: {
  value: string;
  outlets: Outlet[];
  onChange: (v: string) => void;
}) => {
  if (outlets.length < 2) return null;
  const known = value === "0" || outlets.some((o) => String(o.id) === value);
  return (
    <label className="dash-card inline-flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border/70 bg-card py-1 pl-3 pr-1.5 sm:flex-none">
      <Store className="h-4 w-4 shrink-0 text-primary" />
      <select
        value={known ? value : "0"}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 truncate bg-transparent py-1 pr-1 text-xs font-semibold text-foreground focus:outline-none sm:w-auto sm:max-w-[230px]"
        aria-label="Outlet"
      >
        <option value="0">All outlets</option>
        {outlets.map((o) => (
          <option key={o.id} value={String(o.id)}>
            {outletLabel(o)}
          </option>
        ))}
      </select>
    </label>
  );
};

/* ============================================================
 * HERO (navy premium card)
 * ============================================================ */
const HeroStat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) => (
  <div className="min-w-0 px-3 py-3 sm:px-4">
    <p className="truncate text-[10px] font-medium uppercase tracking-wider text-white/55">
      {label}
    </p>
    <p
      className={`mt-1 truncate font-display text-[15px] font-bold dash-num sm:text-lg ${
        tone === "up"
          ? "text-emerald-300"
          : tone === "down"
            ? "text-rose-300"
            : "text-white"
      }`}
    >
      {value}
    </p>
  </div>
);

const HeroCard = ({
  k,
  hourly,
  period,
}: {
  k: Summary["kpis"];
  hourly: HourRow[];
  period: string;
}) => {
  const avg = k.orders.value ? k.sales.value / k.orders.value : 0;
  const net =
    k.sales.value +
    k.other_income.value -
    k.purchases.value -
    k.other_expense.value;
  const peak = hourly.reduce<HourRow | null>(
    (m, h) => (h.sales > 0 && (!m || h.sales > m.sales) ? h : m),
    null,
  );
  const chart = hourly.map((h) => ({
    label: formatHour(h.hour),
    v: h.sales,
    n: h.orders,
  }));

  return (
    <section className="dash-rise relative overflow-hidden rounded-[26px] bg-[linear-gradient(140deg,#0A1430_0%,#0F2147_48%,#173A7E_100%)] p-5 text-white shadow-[0_28px_60px_-28px_rgba(10,20,48,.75)] sm:p-7">
      <div className="dash-grid pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-primary/45 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-6 h-64 w-64 rounded-full bg-sky-400/15 blur-3xl" />

      <div className="relative grid gap-6 lg:grid-cols-[1fr_1.15fr] lg:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/85 ring-1 ring-white/15">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Total Sales
            </span>
            <ChangePill cur={k.sales.value} prev={k.sales.prev} onDark />
          </div>
          <p className="mt-4 font-display text-[40px] font-bold leading-none tracking-tight dash-num sm:text-[52px]">
            <AnimatedNumber value={k.sales.value} format={inr} />
          </p>
          <p className="mt-2.5 text-xs text-white/55">
            {period} <span className="mx-1 text-white/25">•</span> Prev period{" "}
            {inr(k.sales.prev)}
          </p>
          <div className="mt-6 grid grid-cols-3 divide-x divide-white/10 rounded-2xl bg-white/[0.06] ring-1 ring-white/10 backdrop-blur-sm">
            <HeroStat label="Orders" value={num(k.orders.value)} />
            <HeroStat label="Avg bill" value={inr(avg)} />
            <HeroStat
              label="Net P/L"
              value={compactInr(net)}
              tone={net >= 0 ? "up" : "down"}
            />
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between text-[11px] font-medium text-white/60">
            <span>Sales by hour</span>
            {peak && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-300/10 px-2 py-0.5 text-amber-300">
                <Flame className="h-3 w-3" /> Peak {formatHour(peak.hour)} ·{" "}
                {compactInr(peak.sales)}
              </span>
            )}
          </div>
          <div className="-mx-1 mt-2 h-28 sm:h-40">
            {peak ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chart}
                  margin={{ top: 8, right: 4, left: 4, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="#7DD3FC"
                        stopOpacity={0.45}
                      />
                      <stop offset="100%" stopColor="#7DD3FC" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" hide />
                  <Tooltip
                    cursor={{
                      stroke: "rgba(255,255,255,.25)",
                      strokeDasharray: "3 3",
                    }}
                    contentStyle={{
                      background: "#0B1633",
                      border: "1px solid rgba(255,255,255,.12)",
                      borderRadius: 12,
                      fontSize: 12,
                      color: "#fff",
                      padding: "6px 10px",
                    }}
                    labelStyle={{ color: "rgba(255,255,255,.6)" }}
                    formatter={(v, _n, item) => [
                      `${inr(Number(v))} · ${(item?.payload as { n?: number } | undefined)?.n ?? 0} bills`,
                      "Sales",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="#7DD3FC"
                    strokeWidth={2.4}
                    fill="url(#heroFill)"
                    activeDot={{
                      r: 4,
                      fill: "#fff",
                      stroke: "#7DD3FC",
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/15 text-xs text-white/45">
                No sales in this period yet
              </div>
            )}
          </div>
          <div className="mt-1 flex justify-between px-1 text-[10px] text-white/35">
            <span>12 AM</span>
            <span>6 AM</span>
            <span>12 PM</span>
            <span>6 PM</span>
            <span>11 PM</span>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ============================================================
 * COLLECTIONS
 * ============================================================ */
const CollectionsCard = ({ c }: { c: Summary["collections"] }) => {
  const now = new Date();
  const fyYear =
    now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const rows: {
    label: string;
    sub: string;
    value: number;
    icon: LucideIcon;
    tone: Tone;
  }[] = [
    {
      label: "Today",
      sub: now.toLocaleDateString("en-IN", { weekday: "long" }),
      value: c.today,
      icon: Wallet,
      tone: "primary",
    },
    {
      label: "This month",
      sub: now.toLocaleDateString("en-IN", { month: "long" }),
      value: c.month,
      icon: CalendarDays,
      tone: "success",
    },
    {
      label: "Financial year",
      sub: `FY ${fyYear}-${String(fyYear + 1).slice(2)}`,
      value: c.fy,
      icon: CalendarRange,
      tone: "info",
    },
  ];
  const modeTotal = c.by_mode.reduce((s, m) => s + m.amount, 0);

  return (
    <Panel
      title="Collections"
      subtitle="Payment received"
      icon={Wallet}
      tone="success"
      delay={80}
    >
      <div className="divide-y divide-border/60">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center gap-3 py-3 first:pt-0"
          >
            <IconTile icon={r.icon} tone={r.tone} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{r.label}</p>
              <p className="text-[11px] text-muted-foreground">{r.sub}</p>
            </div>
            <p className="font-display text-lg font-bold tracking-tight dash-num">
              <AnimatedNumber value={r.value} format={inr} />
            </p>
          </div>
        ))}
      </div>

      <div className="mt-2 rounded-2xl bg-muted/40 p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Selected period · by mode
          </span>
          <span className="font-display text-sm font-bold dash-num">
            {inr(modeTotal)}
          </span>
        </div>
        {modeTotal > 0 ? (
          <>
            <div className="mt-2.5 flex h-2 gap-0.5 overflow-hidden rounded-full">
              {c.by_mode.map((m, i) => (
                <div
                  key={m.mode}
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(m.amount / modeTotal) * 100}%`,
                    background: PIE_COLORS[i % PIE_COLORS.length],
                  }}
                />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {c.by_mode.map((m, i) => (
                <div
                  key={m.mode}
                  className="flex min-w-0 items-center gap-1.5 text-[11px]"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="truncate text-muted-foreground">
                    {m.mode}
                  </span>
                  <span className="ml-auto font-semibold dash-num">
                    {compactInr(m.amount)}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            No collection in this period
          </p>
        )}
      </div>
    </Panel>
  );
};

/* ============================================================
 * KPI CARDS
 * ============================================================ */
interface KpiDef {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: Tone;
  value: number;
  prev?: number;
  invert?: boolean;
  money?: boolean;
  alert?: boolean;
  hint?: string;
}

const KpiCard = ({ k, index }: { k: KpiDef; index: number }) => (
  <div
    className="dash-rise dash-card dash-card-hover relative overflow-hidden rounded-[20px] border border-border/60 bg-card p-4"
    style={{ animationDelay: `${120 + index * 50}ms` }}
  >
    <div className="flex items-start justify-between gap-2">
      <IconTile icon={k.icon} tone={k.tone} />
      {k.alert ? (
        k.value > 0 ? (
          <span className="dash-live rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">
            Alert
          </span>
        ) : (
          <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
            OK
          </span>
        )
      ) : (
        k.prev !== undefined && (
          <ChangePill cur={k.value} prev={k.prev} invert={k.invert} />
        )
      )}
    </div>
    <p className="mt-4 truncate font-display text-[22px] font-bold leading-tight tracking-tight dash-num">
      <AnimatedNumber value={k.value} format={k.money ? inr : num} />
    </p>
    <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
      {k.label}
    </p>
    <p className="mt-2.5 truncate border-t border-dashed border-border/70 pt-2 text-[10px] text-muted-foreground/90 dash-num">
      {k.hint ??
        (k.prev !== undefined
          ? `Prev: ${k.money ? inr(k.prev) : num(k.prev)}`
          : " ")}
    </p>
    <span
      className={`absolute left-0 top-5 h-8 w-1 rounded-r-full ${TONE[k.tone].bar}`}
    />
  </div>
);

/* ============================================================
 * TREND CHART
 * ============================================================ */
const LegendDot = ({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) => (
  <div className="min-w-0">
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
    <p className="font-display text-lg font-bold tracking-tight dash-num">
      {compactInr(value)}
    </p>
  </div>
);

const selectCls =
  "h-9 rounded-full border border-border/70 bg-card px-3 text-xs font-semibold dash-num focus:outline-none focus:ring-2 focus:ring-primary/30";

const TrendChart = ({
  title,
  subtitle,
  icon,
  tone,
  metric,
  aLabel,
  bLabel,
  kind,
  minYear,
  refreshKey,
  delay = 0,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tone: Tone;
  metric: "sales_purchase" | "income_expense";
  aLabel: string;
  bLabel: string;
  kind: "bar" | "area";
  minYear: number;
  refreshKey: string;
  delay?: number;
}) => {
  const now = new Date();
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}`,
  );
  const [year, setYear] = useState(CURRENT_YEAR);
  const [fromYear, setFromYear] = useState(Math.max(minYear, CURRENT_YEAR - 4));
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    data: TrendResp | null;
  }>({
    loading: true,
    error: null,
    data: null,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    const params: Record<string, string> = {
      action: "trend",
      metric,
      granularity,
    };
    if (granularity === "daily") params.month = month;
    else if (granularity === "monthly") params.year = String(year);
    else params.year = String(Math.max(fromYear, minYear));

    apiGet<TrendResp>(params, ctrl.signal)
      .then((d) => setState({ loading: false, error: null, data: d }))
      .catch((e: Error) => {
        if (e.name !== "AbortError")
          setState({ loading: false, error: e.message, data: null });
      });
    return () => ctrl.abort();
  }, [metric, granularity, month, year, fromYear, minYear, tick, refreshKey]);

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = CURRENT_YEAR; y >= Math.min(minYear, CURRENT_YEAR); y--)
      arr.push(y);
    return arr;
  }, [minYear]);

  const colorA = kind === "bar" ? "hsl(var(--primary))" : "hsl(var(--success))";
  const colorB =
    kind === "bar" ? "hsl(var(--warning))" : "hsl(var(--destructive))";
  const gid = `trend-${metric}`;
  const series = state.data?.series ?? [];
  const allZero = series.every((s) => s.a === 0 && s.b === 0);

  const picker =
    granularity === "daily" ? (
      <input
        type="month"
        value={month}
        max={`${CURRENT_YEAR}-${pad(now.getMonth() + 1)}`}
        onChange={(e) => e.target.value && setMonth(e.target.value)}
        className={selectCls}
      />
    ) : granularity === "monthly" ? (
      <select
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        className={selectCls}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    ) : (
      <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        From
        <select
          value={fromYear}
          onChange={(e) => setFromYear(Number(e.target.value))}
          className={selectCls}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
    );

  const axisProps = {
    tick: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
    stroke: "transparent",
    tickLine: false,
    axisLine: false,
  };

  return (
    <Panel
      title={title}
      subtitle={subtitle}
      icon={icon}
      tone={tone}
      delay={delay}
      action={
        <Segmented
          value={granularity}
          onChange={setGranularity as any}
          options={[
            { value: "daily", label: "Day" },
            { value: "monthly", label: "Month" },
            { value: "yearly", label: "Year" },
          ]}
        />
      }
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-6">
          <LegendDot
            color={colorA}
            label={aLabel}
            value={state.data?.totals.a ?? 0}
          />
          <LegendDot
            color={colorB}
            label={bLabel}
            value={state.data?.totals.b ?? 0}
          />
        </div>
        {picker}
      </div>

      {state.loading && !state.data ? (
        <Sk className="h-56 sm:h-64" />
      ) : state.error ? (
        <div className="flex h-56 flex-col items-center justify-center gap-2 text-center sm:h-64">
          <WifiOff className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">{state.error}</p>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => setTick((t) => t + 1)}
          >
            Retry
          </Button>
        </div>
      ) : allZero ? (
        <div className="flex h-56 items-center justify-center sm:h-64">
          <EmptyState icon={BarChart3} />
        </div>
      ) : (
        <div
          className={`-ml-2 h-56 transition-opacity sm:h-64 ${state.loading ? "opacity-50" : ""}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            {kind === "bar" ? (
              <BarChart data={series} barGap={3}>
                <defs>
                  <linearGradient id={`${gid}-a`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colorA} stopOpacity={1} />
                    <stop offset="100%" stopColor={colorA} stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id={`${gid}-b`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colorB} stopOpacity={1} />
                    <stop offset="100%" stopColor={colorB} stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="4 4"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis dataKey="label" {...axisProps} minTickGap={6} />
                <YAxis
                  {...axisProps}
                  width={50}
                  tickFormatter={(v) => compactInr(Number(v))}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                  formatter={(v) => inr(Number(v))}
                />
                <Bar
                  dataKey="a"
                  name={aLabel}
                  fill={`url(#${gid}-a)`}
                  radius={[8, 8, 2, 2]}
                  maxBarSize={22}
                />
                <Bar
                  dataKey="b"
                  name={bLabel}
                  fill={`url(#${gid}-b)`}
                  radius={[8, 8, 2, 2]}
                  maxBarSize={22}
                />
              </BarChart>
            ) : (
              <AreaChart data={series}>
                <defs>
                  <linearGradient id={`${gid}-a`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colorA} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={colorA} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={`${gid}-b`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colorB} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={colorB} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="4 4"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis dataKey="label" {...axisProps} minTickGap={6} />
                <YAxis
                  {...axisProps}
                  width={50}
                  tickFormatter={(v) => compactInr(Number(v))}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v) => inr(Number(v))}
                />
                <Area
                  type="monotone"
                  dataKey="a"
                  name={aLabel}
                  stroke={colorA}
                  strokeWidth={2.5}
                  fill={`url(#${gid}-a)`}
                  activeDot={{
                    r: 4,
                    strokeWidth: 2,
                    stroke: "hsl(var(--card))",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="b"
                  name={bLabel}
                  stroke={colorB}
                  strokeWidth={2.5}
                  fill={`url(#${gid}-b)`}
                  activeDot={{
                    r: 4,
                    strokeWidth: 2,
                    stroke: "hsl(var(--card))",
                  }}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
};

/* ============================================================
 * TOP PRODUCTS
 * ============================================================ */
const TopProducts = ({ data }: { data: Summary["top_products"] }) => {
  const [by, setBy] = useState<"revenue" | "qty">("revenue");
  const rows = (by === "revenue" ? data.by_revenue : data.by_qty).slice(0, 6);
  const max = Math.max(
    1,
    ...rows.map((r) => (by === "revenue" ? r.revenue : r.qty)),
  );
  const medal = [
    "bg-amber-400 text-amber-950",
    "bg-slate-300 text-slate-800",
    "bg-orange-300 text-orange-950",
  ];

  return (
    <Panel
      title="Top selling products"
      subtitle="Selected period"
      icon={Trophy}
      tone="warning"
      delay={160}
      action={
        <Segmented
          value={by}
          onChange={setBy as any}
          options={[
            { value: "revenue", label: "Revenue" },
            { value: "qty", label: "Qty" },
          ]}
        />
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={ShoppingBag} />
      ) : (
        <div className="space-y-4">
          {rows.map((r, i) => {
            const v = by === "revenue" ? r.revenue : r.qty;
            return (
              <div key={`${r.name}-${i}`} className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-display text-xs font-bold ${
                    i < 3 ? medal[i] : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13px] font-semibold">
                      {r.name}
                    </p>
                    <p className="shrink-0 font-display text-[13px] font-bold dash-num">
                      {by === "revenue" ? inr(r.revenue) : `${num(r.qty)} qty`}
                    </p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-primary transition-[width] duration-700 ease-out"
                        style={{ width: `${(v / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-[10px] text-muted-foreground dash-num">
                      {by === "revenue"
                        ? `${num(r.qty)} sold`
                        : compactInr(r.revenue)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
};

/* ============================================================
 * EXPENSE DONUT
 * ============================================================ */
const ExpenseDonut = ({ rows }: { rows: Summary["expense_by_category"] }) => {
  const data = useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.value - a.value);
    if (sorted.length <= 6) return sorted;
    const rest = sorted.slice(5).reduce((s, r) => s + r.value, 0);
    return [...sorted.slice(0, 5), { name: "Others", value: rest }];
  }, [rows]);
  const total = data.reduce((s, r) => s + r.value, 0);

  return (
    <Panel
      title="Expense by category"
      subtitle="Selected period"
      icon={PieChartIcon}
      tone="destructive"
      delay={200}
    >
      {total === 0 ? (
        <EmptyState text="No expenses in this period" icon={PieChartIcon} />
      ) : (
        <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
          <div className="relative mx-auto h-48 w-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="70%"
                  outerRadius="100%"
                  paddingAngle={3}
                  stroke="none"
                  cornerRadius={8}
                >
                  {data.map((e, i) => (
                    <Cell
                      key={e.name}
                      fill={PIE_COLORS[i % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v) => inr(Number(v))}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total
              </span>
              <span className="font-display text-xl font-bold dash-num">
                {compactInr(total)}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            {data.map((d, i) => (
              <div
                key={d.name}
                className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-muted/50"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  {d.name}
                </span>
                <span className="text-[11px] text-muted-foreground dash-num">
                  {((d.value / total) * 100).toFixed(0)}%
                </span>
                <span className="w-20 text-right text-[13px] font-semibold dash-num">
                  {inr(d.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
};

/* ============================================================
 * OUTSTANDING (tabs)
 * ============================================================ */
const OutstandingCard = ({ data }: { data: Summary["outstanding"] }) => {
  const [tab, setTab] = useState<"customer" | "vendor">("customer");
  const rows = tab === "customer" ? data.customers : data.vendors;
  const total = tab === "customer" ? data.customers_total : data.vendors_total;

  return (
    <Panel
      title="Outstanding"
      subtitle="As on today"
      icon={tab === "customer" ? Users : Truck}
      tone="warning"
      delay={240}
      action={
        <Segmented
          value={tab}
          onChange={setTab as any}
          options={[
            { value: "customer", label: "Customers" },
            { value: "vendor", label: "Vendors" },
          ]}
        />
      }
    >
      <div className="mb-2 flex items-center justify-between rounded-2xl bg-gradient-to-r from-warning/15 to-warning/5 px-4 py-3">
        <span className="text-xs font-semibold text-muted-foreground">
          {tab === "customer" ? "To receive" : "To pay"}
        </span>
        <span className="font-display text-lg font-bold text-warning dash-num">
          <AnimatedNumber value={total} format={inr} />
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyState text="All settled — nothing outstanding" icon={Check} />
      ) : (
        <div className="divide-y divide-border/60">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-warning/25 to-warning/10 font-display text-xs font-bold text-warning">
                {initials(r.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{r.name}</p>
                <p className="truncate text-[11px] text-muted-foreground dash-num">
                  {r.mobile || "—"}
                  {r.last ? ` · Last ${shortDate(r.last)}` : ""}
                </p>
              </div>
              <p className="shrink-0 font-display text-[13px] font-bold dash-num">
                {inr(r.amount)}
              </p>
              {r.mobile && (
                <a
                  href={`tel:${r.mobile.replace(/\s/g, "")}`}
                  aria-label={`Call ${r.name}`}
                  className="dash-press dash-tap flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                >
                  <Phone className="h-4 w-4" />
                </a>
              )}
              {tab === "customer" && r.mobile && (
                <a
                  href={waLink(r.mobile, r.name, r.amount)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`WhatsApp ${r.name}`}
                  className="dash-press dash-tap flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
};

/* ============================================================
 * RECENT ORDERS
 * ============================================================ */
const ORDER_STATUS: Record<string, string> = {
  Paid: "bg-success/10 text-success",
  Partial: "bg-info/10 text-info",
  Pending: "bg-warning/15 text-warning",
};

const RecentOrders = ({ rows: allRows }: { rows: OrderRow[] }) => {
  const navigate = useNavigate();
  const rows = allRows.slice(0, 5);
  return (
    <Panel
      title="Recent orders"
      subtitle="Latest 5 bills"
      icon={Receipt}
      tone="primary"
      delay={280}
      action={
        <button
          type="button"
          onClick={() => {
            tap();
            navigate("/sales");
          }}
          className="dash-press dash-tap inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/15"
        >
          View all <ChevronRight className="h-3.5 w-3.5" />
        </button>
      }
    >
      {rows.length === 0 ? (
        <EmptyState text="No orders in this period" icon={Receipt} />
      ) : (
        <div className="-mx-2 space-y-1">
          {rows.map((o) => {
            const d = toDate(o.created_at);
            return (
              <div
                key={o.id}
                className="dash-press flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-muted/50"
              >
                <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-muted/70">
                  <span className="font-display text-[13px] font-bold leading-none dash-num">
                    {d.getHours() % 12 || 12}
                  </span>
                  <span className="mt-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
                    {d.getHours() < 12 ? "AM" : "PM"}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">
                    {o.customer}
                  </p>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="shrink-0 dash-num">{o.invoice_no}</span>
                    <span className="text-muted-foreground/40">•</span>
                    <span className="shrink-0">{timeAgo(o.created_at)}</span>
                    {o.payment_mode && (
                      <>
                        <span className="text-muted-foreground/40">•</span>
                        <span className="truncate">{o.payment_mode}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-[14px] font-bold dash-num">
                    {inr(o.amount)}
                  </p>
                  <span
                    className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${ORDER_STATUS[o.status] ?? ""}`}
                  >
                    {o.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
};

/* ============================================================
 * SKELETON + ERROR
 * ============================================================ */
const DashboardSkeleton = () => (
  <div className="space-y-4 sm:space-y-5">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Sk key={i} className="h-36 rounded-[20px]" />
      ))}
    </div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
      <Sk className="h-72 rounded-[26px]" />
      <Sk className="h-72 rounded-[22px]" />
    </div>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Sk className="h-80 rounded-[22px]" />
      <Sk className="h-80 rounded-[22px]" />
    </div>
  </div>
);

const ErrorState = ({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry: () => void;
}) => (
  <Panel>
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-destructive/10 text-destructive">
        <WifiOff className="h-7 w-7" />
      </div>
      <div>
        <p className="font-display text-lg font-bold">
          Couldn't load the dashboard
        </p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {message ?? "Something went wrong"}
        </p>
      </div>
      <Button
        onClick={onRetry}
        className="gap-2 rounded-full bg-gradient-primary px-6 hover:opacity-90"
      >
        <RefreshCw className="h-4 w-4" /> Try again
      </Button>
    </div>
  </Panel>
);

/* ============================================================
 * PULL TO REFRESH helper
 * ============================================================ */
const getScrollParent = (el: HTMLElement | null): HTMLElement | null => {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if (
      (oy === "auto" || oy === "scroll") &&
      node.scrollHeight > node.clientHeight
    )
      return node;
    node = node.parentElement;
  }
  return null;
};

/* ============================================================
 * DASHBOARD
 * ============================================================ */
const Dashboard = () => {
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<Filter>(defaultFilter);
  const [draft, setDraft] = useState<Filter>(filter);
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [outlet, setOutlet] = useState<string>(readOutlet);
  const { data, loading, refreshing, error, updatedAt, refresh } = useSummary(
    filter,
    outlet,
  );

  useEffect(() => setDraft(filter), [filter]);

  const doRefresh = useCallback(() => {
    refresh();
    setRefreshKey((k) => k + 1);
  }, [refresh]);

  // Live auto-refresh while the selected range includes today
  const today = todayStr();
  const isLive = filter.fromDate <= today && filter.toDate >= today;
  useEffect(() => {
    if (!isLive) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [isLive, refresh]);

  // ---- Outlet ----
  const outlets = useMemo(() => data?.meta.franchises ?? [], [data]);
  const currentOutlet = outlets.find((o) => String(o.id) === outlet);
  const outletWithData =
    currentOutlet && currentOutlet.bills === 0
      ? outlets.find((o) => o.bills > 0)
      : undefined;
  const changeOutlet = (v: string) => {
    tap();
    saveOutlet(v);
    setOutlet(v);
  };
  useEffect(() => {
    if (outlet === "" || outlet === "0" || outlets.length === 0) return;
    if (!outlets.some((o) => String(o.id) === outlet)) setOutlet("0");
  }, [outlet, outlets]);

  // ---- Filter actions ----
  const draftError = validateFilter(draft);
  const isDirty = !sameFilter(draft, filter);
  const apply = () => {
    if (draftError) return;
    tap();
    if (isDirty) setFilter(draft);
    else doRefresh();
    setFilterOpen(false);
  };
  const openFilter = () => {
    tap();
    setDraft(filter);
    setFilterOpen(true);
  };
  const closeFilter = useCallback(() => setFilterOpen(false), []);
  const resetToToday = () => {
    tap();
    setDraft(defaultFilter());
  };
  const closePicker = useCallback(() => setPicker(null), []);
  const confirmPicker = (v: string) => {
    if (!picker) return;
    const key: keyof Filter =
      picker.field === "from"
        ? picker.kind === "date"
          ? "fromDate"
          : "fromTime"
        : picker.kind === "date"
          ? "toDate"
          : "toTime";
    const next = { ...draft, [key]: v };
    setDraft(picker.field === "from" ? fixEnd(next) : next);
    setPicker(null);
  };

  // ---- Pull to refresh (mobile) ----
  const rootRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const onTouchStart = (e: TouchEvent) => {
    if (!isMobile || picker || filterOpen) return;
    const sp = getScrollParent(rootRef.current);
    const top = sp ? sp.scrollTop : window.scrollY;
    startY.current = top <= 0 ? e.touches[0].clientY : null;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    setPull(dy > 0 ? Math.min(96, dy * 0.45) : 0);
  };
  const onTouchEnd = () => {
    if (pull > 64) {
      tap();
      doRefresh();
    }
    setPull(0);
    startY.current = null;
  };

  // ---- KPI list ----
  const kpis: KpiDef[] = data
    ? [
        {
          key: "purchases",
          label: "Purchases",
          icon: Package,
          tone: "info",
          value: data.kpis.purchases.value,
          prev: data.kpis.purchases.prev,
          invert: true,
          money: true,
        },
        {
          key: "collection",
          label: "Collection",
          icon: Wallet,
          tone: "success",
          value: data.kpis.collection.value,
          prev: data.kpis.collection.prev,
          money: true,
        },
        {
          key: "income",
          label: "Other income",
          icon: ArrowDownRight,
          tone: "primary",
          value: data.kpis.other_income.value,
          prev: data.kpis.other_income.prev,
          money: true,
        },
        {
          key: "expense",
          label: "Other expense",
          icon: ArrowUpRight,
          tone: "destructive",
          value: data.kpis.other_expense.value,
          prev: data.kpis.other_expense.prev,
          invert: true,
          money: true,
        },
        {
          key: "customers",
          label: "Customers",
          icon: Users,
          tone: "accent",
          value: data.kpis.customers.value,
          prev: data.kpis.customers.prev,
        },
        {
          key: "lowstock",
          label: "Low stock items",
          icon: AlertTriangle,
          tone: "warning",
          value: data.low_stock,
          alert: true,
          hint: `Stock ≤ ${data.meta.low_stock_limit ?? 5}`,
        },
      ]
    : [];

  const minYear = data?.meta.min_year ?? CURRENT_YEAR;
  const trendKey = `${refreshKey}-${outlet}`;
  const period = periodText(filter);

  return (
    <div
      ref={rootRef}
      className="mx-auto max-w-[1600px] space-y-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:space-y-5"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <style>{DASH_CSS}</style>

      {/* Pull-to-refresh indicator */}
      {isMobile && (
        <div
          className="flex justify-center overflow-hidden transition-[height] duration-200"
          style={{
            height: pull > 0 ? pull : refreshing ? 48 : 0,
            transition: pull > 0 ? "none" : undefined,
          }}
        >
          <div className="mt-2 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card shadow-md">
            <RefreshCw
              className={`h-4 w-4 text-primary ${refreshing ? "animate-spin" : ""}`}
              style={
                refreshing
                  ? undefined
                  : {
                      transform: `rotate(${pull * 4}deg)`,
                      opacity: Math.min(1, pull / 64),
                    }
              }
            />
          </div>
        </div>
      )}

      {/* ---------- Header ---------- */}
      <div className="dash-rise flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {greeting()}
          </p>
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-[28px]">
            Business overview
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
            <span className="dash-num">{period}</span>
            {updatedAt && (
              <span className="dash-num">
                · Updated{" "}
                {updatedAt.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </p>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <OutletSelect
            value={outlet}
            outlets={outlets}
            onChange={changeOutlet}
          />
          {isLive && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-3 py-2 text-[11px] font-bold text-success">
              <span className="dash-live h-1.5 w-1.5 rounded-full bg-success" />{" "}
              Live
            </span>
          )}
          {isMobile && (
            <button
              type="button"
              onClick={openFilter}
              aria-label="Filter by date & time"
              className="dash-press dash-tap dash-card relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-gradient-primary text-primary-foreground"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {!sameFilter(filter, defaultFilter()) && (
                <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-warning" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              tap();
              doRefresh();
            }}
            aria-label="Refresh"
            className="dash-press dash-tap dash-card flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin text-primary" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* ---------- Filter ---------- */}
      {!isMobile && (
        <DesktopFilterBar
          draft={draft}
          setDraft={setDraft}
          error={draftError}
          dirty={isDirty}
          refreshing={refreshing}
          onToday={resetToToday}
          onApply={apply}
        />
      )}

      {/* ---------- Banners ---------- */}
      {outletWithData && currentOutlet && (
        <div className="dash-rise flex flex-wrap items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3">
          <Store className="h-4 w-4 shrink-0 text-warning" />
          <p className="min-w-[200px] flex-1 text-xs">
            <b>{outletLabel(currentOutlet)}</b> has no bills yet. Your data is
            in <b>{outletLabel(outletWithData)}</b>.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => changeOutlet("0")}
            >
              All outlets
            </Button>
            <Button
              size="sm"
              className="rounded-full bg-gradient-primary hover:opacity-90"
              onClick={() => changeOutlet(String(outletWithData.id))}
            >
              Show {outletWithData.code || outletWithData.name}
            </Button>
          </div>
        </div>
      )}

      {error && data && (
        <div className="dash-rise flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          <WifiOff className="h-4 w-4 shrink-0 text-destructive" />
          <p className="flex-1 text-xs text-destructive">{error}</p>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={doRefresh}
          >
            Retry
          </Button>
        </div>
      )}

      {/* ---------- Content ---------- */}
      {loading && !data ? (
        <DashboardSkeleton />
      ) : !data ? (
        <ErrorState message={error} onRetry={doRefresh} />
      ) : (
        <div
          className={`space-y-4 transition-opacity sm:space-y-5 ${refreshing ? "opacity-75" : ""}`}
        >
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
            {kpis.map((k, i) => (
              <KpiCard key={k.key} k={k} index={i} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-[1.6fr_1fr]">
            <HeroCard
              k={data.kpis}
              hourly={data.hourly ?? []}
              period={period}
            />
            <CollectionsCard c={data.collections} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-2">
            <TopProducts data={data.top_products} />
            <ExpenseDonut rows={data.expense_by_category} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-2">
            <RecentOrders rows={data.recent_orders} />
            <OutstandingCard data={data.outstanding} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-2">
            <TrendChart
              title="Sales vs Purchase"
              subtitle="Trend"
              icon={BarChart3}
              tone="primary"
              metric="sales_purchase"
              aLabel="Sales"
              bLabel="Purchase"
              kind="bar"
              minYear={minYear}
              refreshKey={trendKey}
              delay={120}
            />
            <TrendChart
              title="Income vs Expense"
              subtitle="Sales + other income vs purchase + expense"
              icon={TrendingUp}
              tone="success"
              metric="income_expense"
              aLabel="Income"
              bLabel="Expense"
              kind="area"
              minYear={minYear}
              refreshKey={trendKey}
              delay={160}
            />
          </div>

          {updatedAt && (
            <p className="pt-1 text-center text-[10px] text-muted-foreground dash-num">
              Last updated{" "}
              {updatedAt.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
              {isMobile && " · Pull down to refresh"}
            </p>
          )}
        </div>
      )}

      {/* ---------- Mobile picker sheets ---------- */}
      {isMobile && (
        <>
          <MobileFilterSheet
            open={filterOpen}
            draft={draft}
            error={draftError}
            dirty={isDirty}
            refreshing={refreshing}
            onClose={closeFilter}
            onPick={setPicker}
            onToday={resetToToday}
            onApply={apply}
          />
          <MobileDateSheet
            open={picker?.kind === "date"}
            title={picker?.field === "to" ? "End date" : "Start date"}
            value={picker?.field === "to" ? draft.toDate : draft.fromDate}
            min={picker?.field === "to" ? draft.fromDate : undefined}
            onClose={closePicker}
            onConfirm={confirmPicker}
          />
          <MobileHourSheet
            open={picker?.kind === "time"}
            title={picker?.field === "to" ? "End time" : "Start time"}
            value={picker?.field === "to" ? draft.toTime : draft.fromTime}
            boundary={picker?.field === "to" ? "end" : "start"}
            onClose={closePicker}
            onConfirm={confirmPicker}
          />
        </>
      )}
    </div>
  );
};

export default Dashboard;
