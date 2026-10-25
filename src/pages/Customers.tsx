import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FilterX,
  IndianRupee,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Trash2,
  User,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CustomerService,
  type CustomerPayload,
  type CustomerRow,
  type StateRow,
} from "@/services/customer.service";
import { SellService } from "@/services/sell.service";

/* ============================================================
   TYPES & HELPERS
   ============================================================ */

interface Customer {
  id: number;
  name: string;
  mobile: string;
  email: string;
  stateId: string;
  state: string;
  city: string;
  address: string;
  pincode: string;
  wallet: number;
  orders: number;
  outstanding: number;
  deleted: boolean;
  createdAt: string;
}

interface CustomerForm {
  name: string;
  mobile: string;
  email: string;
  stateId: string;
  city: string;
  address: string;
  pincode: string;
  wallet: string;
}

type Tab = "active" | "deleted";
type SortKey = "recent" | "name" | "orders" | "outstanding";

const PAGE_SIZE = 10;

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Newest first",
  name: "Name A–Z",
  orders: "Most orders",
  outstanding: "Highest dues",
};
const MOBILE_QUERY = "(max-width: 767px)";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emptyForm = (): CustomerForm => ({
  name: "",
  mobile: "",
  email: "",
  stateId: "",
  city: "",
  address: "",
  pincode: "",
  wallet: "",
});

const getUserProfile = () =>
  JSON.parse(localStorage.getItem("company_data") || "{}");

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

const fmtDate = (s: string) => {
  if (!s) return "—";
  const d = new Date(s.replace(" ", "T"));
  return isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

const AVATAR_COLORS = [
  "from-violet-500 to-fuchsia-500",
  "from-sky-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-cyan-500 to-blue-500",
];
const avatarColor = (id: number) => AVATAR_COLORS[id % AVATAR_COLORS.length];

const locationOf = (c: Customer) =>
  [c.city, c.state, c.pincode].filter(Boolean).join(", ");

const mapRow = (
  r: CustomerRow,
  stats: Map<number, { orders: number; outstanding: number }>,
): Customer => {
  const id = Number(r.customer_id);
  const s = stats.get(id);
  const stateId =
    r.customer_state_id && String(r.customer_state_id) !== "0"
      ? String(r.customer_state_id)
      : "";
  return {
    id,
    name: r.customer_name || "Walk-in",
    mobile: r.customer_mobile || "",
    email: r.customer_email || "",
    stateId,
    state: r.state_name || "",
    city: r.customer_city || "",
    address: r.customer_address || "",
    pincode: r.customer_pincode || "",
    wallet: Number(r.customer_wallet_balance) || 0,
    orders: s?.orders ?? 0,
    outstanding: Math.round((s?.outstanding ?? 0) * 100) / 100,
    deleted: String(r.is_deleted) === "0",
    createdAt: r.c_date,
  };
};

/* ============================================================
   SHARED UI
   ============================================================ */

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

const Avatar = ({ c, size = "h-10 w-10" }: { c: Customer; size?: string }) => (
  <span
    className={cn(
      "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br font-display text-sm font-bold text-white shadow-md",
      size,
      avatarColor(c.id),
      c.deleted && "grayscale",
    )}
  >
    {initials(c.name)}
  </span>
);

const OutstandingBadge = ({ v }: { v: number }) =>
  v > 0 ? (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-destructive/10 px-2 py-0.5 font-display text-xs font-semibold text-destructive">
      ₹{fmt(v)}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 font-display text-xs font-semibold text-success">
      Clear
    </span>
  );

const Grabber = () => (
  <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted" />
);

/**
 * Mobile → bottom sheet (slides up).
 * Desktop → centred dialog, or a right-side panel when desktopSide="right".
 */
const ResponsivePanel = ({
  open,
  onOpenChange,
  isMobile,
  desktopSide = "center",
  title,
  description,
  icon,
  iconTone = "bg-primary/10 text-primary",
  children,
  footer,
  preventClose = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMobile: boolean;
  desktopSide?: "center" | "right";
  title: string;
  description?: string;
  icon?: ReactNode;
  iconTone?: string;
  children?: ReactNode;
  footer?: ReactNode;
  preventClose?: boolean;
}) => {
  const handleChange = (v: boolean) => {
    if (!v && preventClose) return;
    onOpenChange(v);
  };

  const iconBox = icon && (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
        iconTone,
      )}
    >
      {icon}
    </span>
  );

  if (isMobile || desktopSide === "right") {
    return (
      <Sheet open={open} onOpenChange={handleChange}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "flex flex-col gap-0 p-0 ease-out data-[state=closed]:duration-300 data-[state=open]:duration-300",
            isMobile
              ? "max-h-[92dvh] rounded-t-3xl border-t-0"
              : "w-full sm:max-w-md",
          )}
        >
          {isMobile && <Grabber />}
          <SheetHeader
            className={cn(
              "flex-row items-center gap-3 space-y-0 px-5 pr-12 text-left",
              isMobile ? "pb-3 pt-3" : "border-b border-border pb-4 pt-5",
            )}
          >
            {iconBox}
            <div className="min-w-0">
              <SheetTitle className="font-display text-base">
                {title}
              </SheetTitle>
              {description && (
                <SheetDescription className="text-xs">
                  {description}
                </SheetDescription>
              )}
            </div>
          </SheetHeader>
          {children && (
            <div
              className={cn(
                "flex-1 overflow-y-auto overscroll-contain px-5 pb-4",
                !isMobile && "pt-4",
              )}
            >
              {children}
            </div>
          )}
          {footer && (
            <div className="border-t border-border bg-card px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              {footer}
            </div>
          )}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-sm">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 px-6 pb-4 pt-6 text-left">
          {iconBox}
          <div className="min-w-0">
            <DialogTitle className="font-display text-base">
              {title}
            </DialogTitle>
            {description && (
              <DialogDescription className="text-xs">
                {description}
              </DialogDescription>
            )}
          </div>
        </DialogHeader>
        {children && (
          <div className="flex-1 overflow-y-auto px-6 pb-5">{children}</div>
        )}
        {footer && (
          <div className="border-t border-border bg-muted/30 px-6 py-4">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/** State dropdown — Select on desktop, searchable bottom sheet on mobile */
const StatePicker = ({
  value,
  onChange,
  states,
  isMobile,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  states: StateRow[];
  isMobile: boolean;
  loading: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = states.find((s) => String(s.state_id) === String(value));
  const placeholder = loading ? "Loading states…" : "Select state";

  if (!isMobile) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1 h-10">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {states.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {loading ? "Loading states…" : "No states found"}
            </div>
          ) : (
            states.map((s) => (
              <SelectItem key={s.state_id} value={String(s.state_id)}>
                {s.state_name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    );
  }

  const list = states.filter((s) =>
    s.state_name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm"
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected?.state_name ?? placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>
      <Sheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setQuery("");
        }}
      >
        <SheetContent
          side="bottom"
          className="flex h-[75dvh] flex-col gap-0 rounded-t-3xl border-t-0 p-0"
        >
          <Grabber />
          <SheetHeader className="px-5 pb-2 pt-3 text-left">
            <SheetTitle className="font-display text-base">
              Select State
            </SheetTitle>
          </SheetHeader>
          <div className="px-5 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search state"
                className="h-11 rounded-xl pl-9"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {list.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {loading ? "Loading states…" : "No state found"}
              </p>
            ) : (
              list.map((s) => {
                const active = String(s.state_id) === String(value);
                return (
                  <button
                    key={s.state_id}
                    type="button"
                    onClick={() => {
                      onChange(String(s.state_id));
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm active:bg-muted",
                      active && "bg-primary/10 font-semibold text-primary",
                    )}
                  >
                    {s.state_name}
                    {active && <Check className="h-4 w-4" />}
                  </button>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

/** Searchable customer dropdown — floating list on desktop, bottom sheet on mobile */
const CustomerPicker = ({
  customers,
  value,
  onChange,
  isMobile,
}: {
  customers: Customer[];
  value: number | null;
  onChange: (id: number | null) => void;
  isMobile: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const selected = customers.find((c) => c.id === value);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? customers.filter(
          (c) => c.name.toLowerCase().includes(q) || c.mobile.includes(q),
        )
      : customers;
    return [...rows].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 100);
  }, [customers, query]);

  // Close the desktop dropdown on outside click
  useEffect(() => {
    if (!open || isMobile) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, isMobile]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const pick = (id: number | null) => {
    onChange(id);
    close();
  };

  const options = (
    <>
      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No customer found
        </p>
      ) : (
        list.map((c) => {
          const active = c.id === value;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted active:bg-muted",
                active && "bg-primary/10",
              )}
            >
              <Avatar c={c} size="h-8 w-8 text-xs" />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate text-sm font-medium",
                    active && "text-primary",
                  )}
                >
                  {c.name}
                </p>
                <p className="font-display text-[11px] text-muted-foreground">
                  {c.mobile}
                </p>
              </div>
              {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          );
        })
      )}
    </>
  );

  const searchBox = (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        autoFocus={!isMobile}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or mobile"
        className={cn("rounded-xl pl-9", isMobile ? "h-11" : "h-9 text-sm")}
      />
    </div>
  );

  const trigger = (
    <div
      className={cn(
        "flex h-10 w-full items-center rounded-xl border bg-background text-sm transition-colors",
        selected ? "border-primary/40 bg-primary/[0.04]" : "border-input",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-0 flex-1 items-center gap-2 pl-3 pr-1 text-left"
      >
        <User
          className={cn(
            "h-4 w-4 shrink-0",
            selected ? "text-primary" : "text-muted-foreground",
          )}
        />
        <span
          className={cn(
            "truncate",
            selected ? "font-medium" : "text-muted-foreground",
          )}
        >
          {selected ? selected.name : "All customers"}
        </span>
      </button>
      {selected ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Clear customer"
          className="flex h-full w-8 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <ChevronDown className="mr-3 h-4 w-4 shrink-0 opacity-50" />
      )}
    </div>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
          <SheetContent
            side="bottom"
            className="flex h-[75dvh] flex-col gap-0 rounded-t-3xl border-t-0 p-0"
          >
            <Grabber />
            <SheetHeader className="px-5 pb-2 pt-3 text-left">
              <SheetTitle className="font-display text-base">
                Select Customer
              </SheetTitle>
              <SheetDescription className="text-xs">
                {customers.length} customers
              </SheetDescription>
            </SheetHeader>
            <div className="px-5 pb-3">{searchBox}</div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {options}
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      {trigger}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-2xl border border-border bg-popover shadow-xl animate-in fade-in slide-in-from-top-1">
          <div className="border-b border-border p-2">{searchBox}</div>
          <div className="max-h-72 overflow-y-auto p-1.5">{options}</div>
        </div>
      )}
    </div>
  );
};

/* ============================================================
   PAGE
   ============================================================ */

const Customers = () => {
  const profile = useMemo(getUserProfile, []);
  const isMobile = useIsMobile();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  // ----- Filters -----
  const [search, setSearch] = useState("");
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [duesOnly, setDuesOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [page, setPage] = useState(1);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // ----- Delete -----
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // ----- Add / Edit form -----
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [states, setStates] = useState<StateRow[]>([]);
  const [statesLoading, setStatesLoading] = useState(false);

  /* ---------- Load customers + order stats ---------- */
  const fetchAll = async (silent = false) => {
    if (!profile?.company_id) {
      setLoadError("Company data missing. Please sign in again.");
      setLoading(false);
      return;
    }
    silent ? setRefreshing(true) : setLoading(true);
    setLoadError("");

    const companyId = String(profile.company_id);
    const franchiseId = String(profile.franchise_id ?? "");

    const [custRes, salesRes] = await Promise.allSettled([
      CustomerService.getCustomers(companyId, franchiseId),
      SellService.getSales(companyId, franchiseId),
    ]);

    // Orders count + outstanding per customer, from active bills
    const stats = new Map<number, { orders: number; outstanding: number }>();
    if (
      salesRes.status === "fulfilled" &&
      salesRes.value.status === "success"
    ) {
      for (const s of salesRes.value.data ?? []) {
        if (String(s.is_deleted) !== "1") continue;
        const cid = Number(s.sell_customer_id);
        if (!cid) continue;
        const cur = stats.get(cid) ?? { orders: 0, outstanding: 0 };
        cur.orders += 1;
        cur.outstanding += Number(s.sales_total_remainng_amount) || 0;
        stats.set(cid, cur);
      }
    } else {
      console.warn("Sales fetch failed — orders / outstanding shown as 0");
    }

    if (custRes.status === "fulfilled" && custRes.value.status === "success") {
      setCustomers((custRes.value.data ?? []).map((r) => mapRow(r, stats)));
    } else {
      const msg =
        custRes.status === "fulfilled"
          ? custRes.value.message
          : "Failed to load customers";
      setLoadError(msg || "Failed to load customers");
      if (silent) toast.error(msg || "Failed to load customers");
    }

    setLoading(false);
    setRefreshing(false);
  };

  const fetchStates = async () => {
    if (states.length || statesLoading) return;
    setStatesLoading(true);
    try {
      const res = await CustomerService.getStates(String(profile.company_id));
      const rows: any[] = Array.isArray(res.data) ? res.data : [];
      setStates(
        rows
          .filter((r) => r && r.state_id != null && r.state_name)
          .map((r) => ({
            state_id: String(r.state_id),
            state_name: String(r.state_name),
            state_active_inactive: String(r.state_active_inactive ?? "1"),
          })),
      );
    } catch (error) {
      console.error("Error fetching states:", error);
      toast.error("Failed to load states");
    } finally {
      setStatesLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Derived ---------- */
  const activeList = useMemo(
    () => customers.filter((c) => !c.deleted),
    [customers],
  );
  const deletedCount = customers.length - activeList.length;
  const tabList =
    tab === "active" ? activeList : customers.filter((c) => c.deleted);

  const summary = useMemo(
    () => ({
      total: activeList.length,
      orders: activeList.reduce((s, c) => s + c.orders, 0),
      outstanding: activeList.reduce((s, c) => s + c.outstanding, 0),
      withDues: activeList.filter((c) => c.outstanding > 0).length,
      wallet: activeList.reduce((s, c) => s + c.wallet, 0),
    }),
    [activeList],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = customers.filter((c) => {
      if (tab === "active" ? c.deleted : !c.deleted) return false;
      if (pickedId !== null && c.id !== pickedId) return false;
      if (duesOnly && c.outstanding <= 0) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.mobile.includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q)
      );
    });
    const sorted = [...list];
    switch (sortKey) {
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "orders":
        sorted.sort((a, b) => b.orders - a.orders);
        break;
      case "outstanding":
        sorted.sort((a, b) => b.outstanding - a.outstanding);
        break;
      default:
        sorted.sort((a, b) => b.id - a.id);
    }
    return sorted;
  }, [customers, search, pickedId, tab, duesOnly, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const filtersActive =
    search !== "" ||
    pickedId !== null ||
    duesOnly ||
    sortKey !== "recent" ||
    tab !== "active";

  // Filters that live inside the mobile filter sheet
  const sheetFilterCount =
    (tab !== "active" ? 1 : 0) +
    (duesOnly ? 1 : 0) +
    (sortKey !== "recent" ? 1 : 0);

  const clearFilters = () => {
    setSearch("");
    setPickedId(null);
    setDuesOnly(false);
    setSortKey("recent");
    setTab("active");
    setPage(1);
  };

  useEffect(() => setPage(1), [search, pickedId, tab, duesOnly, sortKey]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  // Picked customer belongs to the other tab → drop it
  useEffect(() => {
    if (pickedId !== null && !tabList.some((c) => c.id === pickedId))
      setPickedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  /* ---------- Delete / restore ---------- */
  const handleDelete = async () => {
    const c = confirmDelete;
    if (!c) return;
    setBusyId(c.id);
    try {
      const res = await CustomerService.deleteCustomer(
        c.id,
        String(profile.company_id),
      );
      if (res.status !== "success")
        throw new Error(res.message || "Failed to delete");
      setCustomers((list) =>
        list.map((x) => (x.id === c.id ? { ...x, deleted: true } : x)),
      );
      if (pickedId === c.id) setPickedId(null);
      toast.success(`${c.name} deleted`);
      setConfirmDelete(null);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete customer");
    } finally {
      setBusyId(null);
    }
  };

  const handleRestore = async (c: Customer) => {
    setBusyId(c.id);
    try {
      const res = await CustomerService.restoreCustomer(
        c.id,
        String(profile.company_id),
      );
      if (res.status !== "success")
        throw new Error(res.message || "Failed to restore");
      setCustomers((list) =>
        list.map((x) => (x.id === c.id ? { ...x, deleted: false } : x)),
      );
      toast.success(`${c.name} restored`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to restore customer");
    } finally {
      setBusyId(null);
    }
  };

  /* ---------- Add / Edit ---------- */
  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
    fetchStates();
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name: c.name === "Walk-in" ? "" : c.name,
      mobile: c.mobile,
      email: c.email,
      stateId: c.stateId,
      city: c.city,
      address: c.address,
      pincode: c.pincode,
      wallet: c.wallet ? String(c.wallet) : "",
    });
    setFormOpen(true);
    fetchStates();
  };

  const setField = (key: keyof CustomerForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const saveForm = async () => {
    const f = form;
    if (!f.name.trim()) return toast.error("Enter customer name");
    if (f.mobile.length !== 10)
      return toast.error("Enter a valid 10 digit mobile number");
    if (f.email && !EMAIL_REGEX.test(f.email.trim()))
      return toast.error("Enter a valid email address");
    if (f.pincode && f.pincode.length !== 6)
      return toast.error("Pincode must be 6 digits");

    const payload: CustomerPayload = {
      company_id: String(profile.company_id),
      franchise_id: String(profile.franchise_id ?? ""),
      customer_name: f.name.trim(),
      customer_mobile: f.mobile,
      customer_email: f.email.trim(),
      customer_state_id: f.stateId,
      customer_city: f.city.trim(),
      customer_address: f.address.trim(),
      customer_pincode: f.pincode,
      customer_wallet_balance: Number(f.wallet) || 0,
    };

    setSaving(true);
    try {
      const res = editing
        ? await CustomerService.updateCustomer(editing.id, payload)
        : await CustomerService.createCustomer(payload);

      if (res.status !== "success")
        throw new Error(res.message || "Failed to save customer");

      if (res.skipped_fields?.length)
        toast.warning(
          `Not saved (column missing): ${res.skipped_fields
            .map((x) => x.replace("customer_", "").replace("_id", ""))
            .join(", ")}`,
        );

      const stateName =
        states.find((s) => String(s.state_id) === f.stateId)?.state_name ?? "";
      const patch = {
        name: payload.customer_name,
        mobile: payload.customer_mobile,
        email: payload.customer_email ?? "",
        stateId: f.stateId,
        state: stateName,
        city: payload.customer_city ?? "",
        address: payload.customer_address ?? "",
        pincode: payload.customer_pincode ?? "",
        wallet: payload.customer_wallet_balance ?? 0,
      };

      if (editing) {
        setCustomers((list) =>
          list.map((x) => (x.id === editing.id ? { ...x, ...patch } : x)),
        );
        toast.success("Customer updated");
      } else {
        setCustomers((list) => [
          {
            id: Number(res.customer_id),
            orders: 0,
            outstanding: 0,
            deleted: false,
            createdAt: new Date().toISOString(),
            ...patch,
          },
          ...list,
        ]);
        toast.success("Customer added");
      }
      setFormOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save customer");
    } finally {
      setSaving(false);
    }
  };

  /* ============================================================
     RENDER PIECES
     ============================================================ */

  const rowActions = (c: Customer, compact = false) =>
    c.deleted ? (
      <Button
        variant="outline"
        size="sm"
        disabled={busyId === c.id}
        onClick={() => handleRestore(c)}
        className={cn("gap-1.5", compact ? "h-9 flex-1" : "h-8")}
      >
        {busyId === c.id ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RotateCcw className="h-3.5 w-3.5" />
        )}
        Restore
      </Button>
    ) : (
      <div className={cn("flex gap-1.5", compact && "flex-1")}>
        <Button
          variant="outline"
          size={compact ? "sm" : "icon"}
          onClick={() => openEdit(c)}
          aria-label={`Edit ${c.name}`}
          className={cn(compact ? "h-9 flex-1 gap-1.5" : "h-8 w-8")}
        >
          <Pencil className="h-3.5 w-3.5" />
          {compact && "Edit"}
        </Button>
        <Button
          variant="outline"
          size={compact ? "sm" : "icon"}
          onClick={() => setConfirmDelete(c)}
          aria-label={`Delete ${c.name}`}
          className={cn(
            "text-destructive hover:bg-destructive/10 hover:text-destructive",
            compact ? "h-9 flex-1 gap-1.5" : "h-8 w-8",
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {compact && "Delete"}
        </Button>
      </div>
    );

  const statCards = [
    {
      label: "Customers",
      value: fmt(summary.total),
      icon: Users,
      tone: "from-violet-500 to-indigo-500",
    },
    {
      label: "Total Orders",
      value: fmt(summary.orders),
      icon: ShoppingBag,
      tone: "from-sky-500 to-cyan-500",
    },
    {
      label: "Outstanding",
      value: `₹${fmt(Math.round(summary.outstanding))}`,
      sub: `${summary.withDues} with dues`,
      icon: IndianRupee,
      tone: "from-rose-500 to-orange-500",
    },
    {
      label: "Wallet",
      value: `₹${fmt(Math.round(summary.wallet))}`,
      icon: Wallet,
      tone: "from-emerald-500 to-teal-500",
    },
  ];

  const skeleton = (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse items-center gap-3 rounded-2xl border border-border bg-card p-4"
        >
          <div className="h-10 w-10 rounded-xl bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-muted" />
            <div className="h-3 w-1/4 rounded bg-muted" />
          </div>
          <div className="h-6 w-16 rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );

  const emptyState = (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Users className="h-8 w-8 text-muted-foreground/50" />
      </div>
      <p className="mt-3 text-sm font-medium">
        {filtersActive && tab === "active"
          ? "No customers match your filters"
          : tab === "deleted"
            ? "No deleted customers"
            : "No customers yet"}
      </p>
      {filtersActive ? (
        <Button
          variant="outline"
          size="sm"
          onClick={clearFilters}
          className="mt-4 gap-1.5"
        >
          <FilterX className="h-3.5 w-3.5" />
          Clear filters
        </Button>
      ) : (
        <Button
          onClick={openAdd}
          className="mt-4 gap-1.5 bg-gradient-primary hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Add Customer
        </Button>
      )}
    </div>
  );

  /* ---------- Desktop table ---------- */
  const desktopTable = (
    <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Mobile</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3 text-right">Wallet</th>
              <th className="px-4 py-3 text-center">Orders</th>
              <th className="px-4 py-3 text-right">Outstanding</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pageRows.map((c) => (
              <tr
                key={c.id}
                className={cn(
                  "transition-colors hover:bg-primary/[0.03]",
                  c.deleted && "opacity-70",
                  editing?.id === c.id && formOpen && "bg-primary/[0.05]",
                )}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar c={c} size="h-9 w-9" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Since {fmtDate(c.createdAt)}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`tel:${c.mobile}`}
                    className="font-display text-xs hover:text-primary"
                  >
                    {c.mobile || "—"}
                  </a>
                </td>
                <td className="max-w-[200px] truncate px-4 py-3 text-xs text-muted-foreground">
                  {c.email || "—"}
                </td>
                <td className="max-w-[180px] truncate px-4 py-3 text-xs text-muted-foreground">
                  {locationOf(c) || "—"}
                </td>
                <td className="px-4 py-3 text-right font-display text-xs">
                  {c.wallet > 0 ? `₹${fmt(c.wallet)}` : "—"}
                </td>
                <td className="px-4 py-3 text-center font-display font-semibold">
                  {c.orders}
                </td>
                <td className="px-4 py-3 text-right">
                  <OutstandingBadge v={c.outstanding} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">{rowActions(c)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  /* ---------- Mobile cards ---------- */
  const mobileCards = (
    <div className="space-y-2.5 md:hidden">
      {pageRows.map((c) => (
        <div
          key={c.id}
          className={cn(
            "overflow-hidden rounded-2xl border border-border bg-card shadow-sm animate-in fade-in slide-in-from-bottom-1",
            c.deleted && "opacity-75",
          )}
        >
          <div className="flex items-start gap-3 p-3.5">
            <Avatar c={c} size="h-11 w-11" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate font-display text-sm font-semibold">
                  {c.name}
                </p>
                <OutstandingBadge v={c.outstanding} />
              </div>
              <a
                href={`tel:${c.mobile}`}
                className="mt-0.5 flex items-center gap-1 font-display text-xs text-muted-foreground active:text-primary"
              >
                <Phone className="h-3 w-3" />
                {c.mobile || "—"}
              </a>
              {c.email && (
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{c.email}</span>
                </p>
              )}
              {locationOf(c) && (
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{locationOf(c)}</span>
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border border-t border-border bg-muted/30 text-center">
            <div className="py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Orders
              </p>
              <p className="font-display text-sm font-bold">{c.orders}</p>
            </div>
            <div className="py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Wallet
              </p>
              <p className="font-display text-sm font-bold">₹{fmt(c.wallet)}</p>
            </div>
            <div className="py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Since
              </p>
              <p className="font-display text-xs font-semibold leading-5">
                {fmtDate(c.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex gap-2 border-t border-border p-2.5">
            {rowActions(c, true)}
          </div>
        </div>
      ))}
    </div>
  );

  const pagination = filtered.length > PAGE_SIZE && (
    <div className="flex items-center justify-between gap-3 pt-1">
      <p className="text-xs text-muted-foreground">
        {(page - 1) * PAGE_SIZE + 1}–
        {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
          className="h-9 w-9 rounded-xl"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[3.5rem] text-center font-display text-xs font-semibold">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          disabled={page === totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="h-9 w-9 rounded-xl"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  /* ---------- Add / Edit form body ---------- */
  const formBody = (
    <div className="space-y-3">
      {editing && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-3">
          <Avatar c={editing} size="h-10 w-10" />
          <div className="min-w-0 flex-1 text-xs text-muted-foreground">
            <p className="truncate text-sm font-semibold text-foreground">
              {editing.name}
            </p>
            {editing.orders} orders · Since {fmtDate(editing.createdAt)}
          </div>
          <OutstandingBadge v={editing.outstanding} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <Label className="text-xs text-muted-foreground">
            Mobile No <span className="text-destructive">*</span>
          </Label>
          <div className="relative mt-1">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="10 digit mobile"
              value={form.mobile}
              onChange={(e) =>
                setField(
                  "mobile",
                  e.target.value.replace(/\D/g, "").slice(0, 10),
                )
              }
              className="h-10 pl-9 font-display"
            />
          </div>
        </div>
        <div className="min-w-0">
          <Label className="text-xs text-muted-foreground">
            Customer Name <span className="text-destructive">*</span>
          </Label>
          <div className="relative mt-1">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              className="h-10 pl-9"
            />
          </div>
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Email Address</Label>
        <div className="relative mt-1">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="email"
            inputMode="email"
            placeholder="customer@email.com"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            className="h-10 pl-9"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <Label className="text-xs text-muted-foreground">State</Label>
          <StatePicker
            value={form.stateId}
            onChange={(v) => setField("stateId", v)}
            states={states}
            isMobile={isMobile}
            loading={statesLoading}
          />
        </div>
        <div className="min-w-0">
          <Label className="text-xs text-muted-foreground">City</Label>
          <Input
            placeholder="City name"
            value={form.city}
            onChange={(e) => setField("city", e.target.value)}
            className="mt-1 h-10"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Address</Label>
        <Textarea
          rows={2}
          placeholder="House no, street, area"
          value={form.address}
          onChange={(e) => setField("address", e.target.value)}
          className="mt-1 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <Label className="text-xs text-muted-foreground">Pincode</Label>
          <Input
            inputMode="numeric"
            maxLength={6}
            placeholder="6 digits"
            value={form.pincode}
            onChange={(e) =>
              setField("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            className="mt-1 h-10 font-display"
          />
        </div>
        <div className="min-w-0">
          <Label className="text-xs text-muted-foreground">
            Wallet Balance
          </Label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              ₹
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0"
              value={form.wallet}
              onChange={(e) => setField("wallet", e.target.value)}
              className="h-10 pl-7 font-display"
            />
          </div>
        </div>
      </div>
    </div>
  );

  /* ============================================================
     PAGE
     ============================================================ */

  return (
    <div className="space-y-2.5 pb-32 md:space-y-4 md:pb-6">
      {/* Header — desktop only (the app bar already shows "Customers" on mobile) */}
      <div className="hidden items-center justify-between gap-3 md:flex">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold tracking-tight md:text-2xl">
            Customers
          </h1>
          <p className="text-xs text-muted-foreground">
            Manage your customers, dues & wallet balances
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => fetchAll(true)}
            disabled={loading || refreshing}
            aria-label="Refresh"
            className="h-10 w-10 rounded-xl"
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
            />
          </Button>
          <Button
            onClick={openAdd}
            className="hidden h-10 gap-1.5 rounded-xl bg-gradient-primary shadow-lg shadow-primary/25 hover:opacity-90 md:flex"
          >
            <Plus className="h-4 w-4" />
            Add Customer
          </Button>
        </div>
      </div>

      {/* KPIs — compact horizontal strip on mobile, full cards on desktop */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:gap-3 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        {statCards.map(({ label, value, sub, icon: Icon, tone }) => (
          <div
            key={label}
            className="relative flex min-w-[118px] shrink-0 items-center gap-2 overflow-hidden rounded-xl border border-border bg-card p-2 shadow-sm md:block md:min-w-0 md:rounded-2xl md:p-4"
          >
            <div
              className={cn(
                "absolute -right-5 -top-5 hidden h-20 w-20 rounded-full bg-gradient-to-br opacity-15 blur-sm md:block",
                tone,
              )}
            />
            <span
              className={cn(
                "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-md md:h-9 md:w-9 md:rounded-xl",
                tone,
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="relative min-w-0 leading-tight md:mt-2.5">
              <p className="text-[10px] text-muted-foreground md:text-[11px]">
                {label}
              </p>
              {loading ? (
                <div className="mt-1 h-5 w-14 animate-pulse rounded bg-muted md:h-6 md:w-16" />
              ) : (
                <p className="truncate font-display text-sm font-bold md:text-xl">
                  {value}
                </p>
              )}
              {sub && !loading && (
                <p className="hidden text-[10px] text-muted-foreground md:block">
                  {sub}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="rounded-2xl border border-border bg-card p-2 shadow-sm md:flex md:flex-wrap md:items-center md:gap-2.5 md:p-3">
        <div className="flex gap-2 md:gap-2.5">
          {/* Compact search */}
          <div className="relative min-w-0 flex-1 md:w-56 md:flex-none">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 rounded-xl pl-9 pr-8 text-sm"
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
          {/* Searchable customer dropdown */}
          <div className="min-w-0 flex-1 md:w-56 md:flex-none">
            <CustomerPicker
              customers={tabList}
              value={pickedId}
              onChange={setPickedId}
              isMobile={isMobile}
            />
          </div>
          {/* Mobile: all other filters in a bottom sheet */}
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            aria-label="Filters"
            className={cn(
              "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors active:scale-95 md:hidden",
              sheetFilterCount > 0
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-input text-muted-foreground",
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {sheetFilterCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {sheetFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Mobile: active filter chips (only when something is applied) */}
        {filtersActive && (
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
            {tab === "deleted" && (
              <button
                onClick={() => setTab("active")}
                className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 text-[11px] font-semibold text-primary"
              >
                Deleted <X className="h-3 w-3" />
              </button>
            )}
            {duesOnly && (
              <button
                onClick={() => setDuesOnly(false)}
                className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2.5 text-[11px] font-semibold text-destructive"
              >
                With dues <X className="h-3 w-3" />
              </button>
            )}
            {sortKey !== "recent" && (
              <button
                onClick={() => setSortKey("recent")}
                className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 text-[11px] font-semibold"
              >
                {SORT_LABELS[sortKey]} <X className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={clearFilters}
              className="ml-auto flex h-7 shrink-0 items-center gap-1 px-1.5 text-[11px] font-semibold text-primary"
            >
              <FilterX className="h-3.5 w-3.5" />
              Clear all
            </button>
          </div>
        )}

        {/* Desktop: inline filters */}
        <div className="hidden items-center gap-2 md:flex md:flex-1">
          <div className="flex shrink-0 rounded-xl bg-muted/60 p-1">
            {(
              [
                ["active", "Active", activeList.length],
                ["deleted", "Deleted", deletedCount],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all",
                  tab === key
                    ? "bg-card text-primary shadow-sm ring-1 ring-primary/20"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px]",
                    tab === key ? "bg-primary/10" : "bg-muted",
                  )}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setDuesOnly((v) => !v)}
            className={cn(
              "flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all",
              duesOnly
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <IndianRupee className="h-3.5 w-3.5" />
            With dues
          </button>

          <Select
            value={sortKey}
            onValueChange={(v) => setSortKey(v as SortKey)}
          >
            <SelectTrigger className="h-10 w-[140px] shrink-0 rounded-xl text-xs">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Newest first</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
              <SelectItem value="orders">Most orders</SelectItem>
              <SelectItem value="outstanding">Highest dues</SelectItem>
            </SelectContent>
          </Select>

          {filtersActive && (
            <button
              onClick={clearFilters}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-primary transition-colors animate-in fade-in zoom-in-95 hover:bg-primary/10 md:ml-auto"
            >
              <FilterX className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        skeleton
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 py-14 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive/70" />
          <p className="mt-3 text-sm font-medium">{loadError}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAll()}
            className="mt-4 gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        emptyState
      ) : (
        <>
          {desktopTable}
          {mobileCards}
          {pagination}
        </>
      )}

      {/* Mobile floating add button — sits above the app's bottom nav */}
      <button
        onClick={openAdd}
        aria-label="Add customer"
        className="fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-xl shadow-primary/30 transition-transform active:scale-90 md:hidden"
      >
        <Plus className="h-5 w-5" />
      </button>

      {/* Mobile filter sheet */}
      {isMobile && (
        <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
          <SheetContent
            side="bottom"
            className="flex max-h-[85dvh] flex-col gap-0 rounded-t-3xl border-t-0 p-0 ease-out data-[state=closed]:duration-300 data-[state=open]:duration-300"
          >
            <Grabber />
            <SheetHeader className="flex-row items-center gap-3 space-y-0 px-5 pb-3 pr-12 pt-3 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <SlidersHorizontal className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <SheetTitle className="font-display text-base">
                  Filters
                </SheetTitle>
                <SheetDescription className="text-xs">
                  {filtered.length} customers match
                </SheetDescription>
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-4">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </p>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1">
                  {(
                    [
                      ["active", "Active", activeList.length],
                      ["deleted", "Deleted", deletedCount],
                    ] as const
                  ).map(([key, label, count]) => (
                    <button
                      key={key}
                      onClick={() => setTab(key)}
                      className={cn(
                        "flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-all",
                        tab === key
                          ? "bg-card text-primary shadow-sm ring-1 ring-primary/20"
                          : "text-muted-foreground",
                      )}
                    >
                      {label}
                      <span className="rounded-full bg-muted px-1.5 text-[10px]">
                        {count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setDuesOnly((v) => !v)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                  duesOnly
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border",
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                  <IndianRupee className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">With dues only</p>
                  <p className="text-[11px] text-muted-foreground">
                    {summary.withDues} customers have pending amount
                  </p>
                </div>
                <span
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                    duesOnly ? "bg-destructive" : "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                      duesOnly ? "left-[22px]" : "left-0.5",
                    )}
                  />
                </span>
              </button>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Sort by
                </p>
                <div className="overflow-hidden rounded-xl border border-border">
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => setSortKey(key)}
                      className={cn(
                        "flex w-full items-center justify-between border-b border-border px-3 py-3 text-left text-sm last:border-b-0 active:bg-muted",
                        sortKey === key &&
                          "bg-primary/5 font-semibold text-primary",
                      )}
                    >
                      {SORT_LABELS[key]}
                      {sortKey === key && <Check className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => {
                  setFilterSheetOpen(false);
                  fetchAll(true);
                }}
                disabled={refreshing}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium text-muted-foreground active:bg-muted"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
                />
                Refresh data
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-border bg-card px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <Button
                variant="outline"
                onClick={clearFilters}
                disabled={!filtersActive}
                className="h-11 gap-1.5"
              >
                <FilterX className="h-4 w-4" />
                Clear all
              </Button>
              <Button
                onClick={() => setFilterSheetOpen(false)}
                className="h-11 bg-gradient-primary hover:opacity-90"
              >
                Show {filtered.length} results
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Add / Edit — right panel on desktop, bottom sheet on mobile */}
      <ResponsivePanel
        open={formOpen}
        onOpenChange={setFormOpen}
        isMobile={isMobile}
        desktopSide="right"
        preventClose={saving}
        title={editing ? "Edit Customer" : "New Customer"}
        description={
          editing
            ? "Update contact & address details"
            : "Add a customer manually"
        }
        icon={
          editing ? (
            <Pencil className="h-5 w-5" />
          ) : (
            <UserPlus className="h-5 w-5" />
          )
        }
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={saving}
              className="h-11"
            >
              Cancel
            </Button>
            <Button
              onClick={saveForm}
              disabled={saving}
              className="h-11 gap-1.5 bg-gradient-primary hover:opacity-90"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {editing ? "Update" : "Save"}
            </Button>
          </div>
        }
      >
        {formBody}
      </ResponsivePanel>

      {/* Delete confirm — dialog on desktop, bottom sheet on mobile */}
      <ResponsivePanel
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        isMobile={isMobile}
        preventClose={busyId !== null}
        title="Delete customer?"
        description="It moves to the Deleted tab — you can restore it anytime"
        icon={<Trash2 className="h-5 w-5" />}
        iconTone="bg-destructive/10 text-destructive"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(null)}
              disabled={busyId !== null}
              className="h-11"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={busyId !== null}
              className="h-11 gap-1.5"
            >
              {busyId !== null && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </div>
        }
      >
        {confirmDelete && (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-3">
            <Avatar c={confirmDelete} size="h-10 w-10" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {confirmDelete.name}
              </p>
              <p className="font-display text-xs text-muted-foreground">
                {confirmDelete.mobile} · {confirmDelete.orders} orders
              </p>
            </div>
            <OutstandingBadge v={confirmDelete.outstanding} />
          </div>
        )}
        {confirmDelete && confirmDelete.outstanding > 0 && (
          <p className="mt-3 rounded-lg bg-warning/10 px-2.5 py-2 text-xs font-medium text-warning">
            This customer still has ₹{fmt(confirmDelete.outstanding)} due. Old
            bills stay as they are.
          </p>
        )}
      </ResponsivePanel>
    </div>
  );
};

export default Customers;
