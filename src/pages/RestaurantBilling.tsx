import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ArrowLeft,
  Banknote,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Landmark,
  ListOrdered,
  Loader2,
  Minus,
  Pause,
  Phone,
  Plus,
  Printer,
  QrCode,
  Receipt,
  Search,
  ShoppingCart,
  Smartphone,
  User,
  UserCheck,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { loadStore, saveStore } from "@/lib/store";
import { ProductService } from "@/services/product.service";
import { SellService } from "@/services/sell.service";
import { CustomerService } from "@/services/customer.service";
import { AccountService, type Account } from "@/services/account.service";
import { apiClient } from "@/services/api.config";
import { cn } from "@/lib/utils";
import { ProductImage, resolveImage } from "@/components/shared/ProductImage";
import {
  HOLD_KEY,
  clearActiveOrder,
  getActiveOrder,
  notifyOrdersChanged,
  saveActiveOrder,
} from "@/lib/restaurantOrders.ts";

/* ============================================================
   TYPES
   ============================================================ */

interface Product {
  id: number;
  name: string;
  image: string;
  final_amount: number;
  category_name: string;
  cgst: number;
  sgst: number;
  stock: number;
}
interface CartItem extends Product {
  qty: number;
}

interface HeldBill {
  id: number;
  tableId?: string;
  tableName: string;
  customerName: string;
  customerMobile: string;
  customerId?: number | null;
  heldAt: string;
  amount: number;
  items: CartItem[];
  discountType: "%" | "₹";
  discountValue: number;
}

type CustomerStatus = "idle" | "loading" | "found" | "new";

/** How an account behaves at the counter — change is only returned from cash */
type PayKind = "cash" | "bank" | "upi" | "other";

/** One selectable payment option = one Account (or a fallback mode) */
interface PayOption {
  key: string;
  accountId: number | null;
  label: string;
  sub: string;
  kind: PayKind;
  /** UPI ID for the QR (taken from the account number when it looks like one) */
  upiId: string;
}

/* ============================================================
   CONSTANTS & HELPERS
   ============================================================ */

const UPI_STORAGE_KEY = "pos-upi-id";
const DEFAULT_UPI_ID = "9173271098@ibl";
const MOBILE_QUERY = "(max-width: 767px)";

const UPI_REGEX = /^[\w.\-]{2,}@[a-zA-Z][a-zA-Z0-9.]{1,}$/;

// tbl_account.account_type
const ACCOUNT_TYPE_LABELS: Record<number, string> = {
  1: "Bank",
  2: "Cash",
  3: "UPI / Wallet",
};

const kindFromType = (type: unknown): PayKind => {
  switch (Number(type)) {
    case 1:
      return "bank";
    case 2:
      return "cash";
    case 3:
      return "upi";
    default:
      return "other";
  }
};

const KIND_ICON: Record<PayKind, typeof Banknote> = {
  cash: Banknote,
  bank: Landmark,
  upi: Smartphone,
  other: Wallet,
};

// Value sent as payments[].mode — keeps sell.php's existing Cash/Card/UPI values
const LEGACY_MODE: Record<PayKind, "Cash" | "Card" | "UPI"> = {
  cash: "Cash",
  bank: "Card",
  upi: "UPI",
  other: "Card",
};

// Used only when the company has no accounts yet (no balance update then)
const FALLBACK_OPTIONS: PayOption[] = [
  {
    key: "Cash",
    accountId: null,
    label: "Cash",
    sub: "Cash",
    kind: "cash",
    upiId: "",
  },
  {
    key: "Card",
    accountId: null,
    label: "Card",
    sub: "Card",
    kind: "bank",
    upiId: "",
  },
  {
    key: "UPI",
    accountId: null,
    label: "UPI",
    sub: "UPI",
    kind: "upi",
    upiId: "",
  },
];

const toPayOption = (a: Account): PayOption => {
  const number = String((a as any).account_number ?? "").trim();
  return {
    key: `acc-${a.account_id}`,
    accountId: Number(a.account_id),
    label: String(a.account_name),
    sub: ACCOUNT_TYPE_LABELS[Number(a.account_type)] ?? "Account",
    kind: kindFromType(a.account_type),
    upiId: UPI_REGEX.test(number) ? number : "",
  };
};

/** account.php type 6 — adds the received amounts to each account's balance */
const creditAccounts = async (payload: {
  company_id: string;
  franchise_id: string;
  financial_year_id?: string | number;
  remark: string;
  log_transaction: boolean;
  entries: { account_id: number; amount: number }[];
}) => {
  try {
    const res = await apiClient.post("/account.php", { type: 6, ...payload });
    return res.data;
  } catch (error: any) {
    if (error?.response?.data && typeof error.response.data === "object")
      return error.response.data;
    throw error;
  }
};

const roundOff = (v: number) =>
  v - Math.floor(v) < 0.5 ? Math.floor(v) : Math.ceil(v);
const round2 = (v: number) => Math.round(v * 100) / 100;
const fmt = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

// Local date (toISOString is UTC → gives yesterday before 5:30 AM IST)
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const getUserProfile = () =>
  JSON.parse(localStorage.getItem("company_data") || "{}");

const errorMessage = (e: any) =>
  e?.response?.data?.message || e?.message || "Something went wrong";

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

/** Bottom sheet on mobile, centred dialog on desktop */
const ResponsiveModal = ({
  open,
  onOpenChange,
  isMobile,
  title,
  description,
  icon,
  children,
  footer,
  preventClose = false,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMobile: boolean;
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  preventClose?: boolean;
  wide?: boolean;
}) => {
  const handleChange = (v: boolean) => {
    if (!v && preventClose) return;
    onOpenChange(v);
  };
  const iconBox = icon && (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
      {icon}
    </span>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleChange}>
        <SheetContent
          side="bottom"
          className="flex max-h-[92dvh] flex-col gap-0 rounded-t-3xl border-t-0 p-0"
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted" />
          <SheetHeader className="flex-row items-center gap-3 space-y-0 px-5 pb-3 pr-12 pt-3 text-left">
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
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
            {children}
          </div>
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
      <DialogContent
        className={cn(
          "flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-2xl p-0",
          wide ? "sm:max-w-2xl" : "sm:max-w-md",
        )}
      >
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
        <div className="flex-1 overflow-y-auto px-6 pb-5">{children}</div>
        {footer && (
          <div className="border-t border-border bg-muted/30 px-6 py-4">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/* ============================================================
   PAGE
   ============================================================ */

const RestaurantBilling = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tableId } = useParams();
  const isMobile = useIsMobile();
  const profile = useMemo(getUserProfile, []);
  const table = (location.state as any)?.table || {
    name: tableId,
    status: "Free",
  };
  const tableKey = String(tableId ?? "");

  // Running order of this table (saved on every cart change) — restored on open
  const [savedOrder] = useState(() =>
    tableKey ? getActiveOrder(tableKey) : null,
  );

  // ----- Catalogue -----
  const [productData, setProductData] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");

  // ----- Order -----
  const [cart, setCart] = useState<CartItem[]>(
    () => (savedOrder?.items as CartItem[] | undefined) ?? [],
  );
  const [discountType, setDiscountType] = useState<"%" | "₹">(
    savedOrder?.discountType ?? "%",
  );
  const [discountValue, setDiscountValue] = useState(
    savedOrder?.discountValue ?? 0,
  );
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // ----- Customer -----
  const [customerMobile, setCustomerMobile] = useState(
    savedOrder?.customerMobile ?? "",
  );
  const [customerName, setCustomerName] = useState(
    savedOrder?.customerName ?? "",
  );
  const [customerId, setCustomerId] = useState<number | null>(
    savedOrder?.customerId ?? null,
  );
  const [customerStatus, setCustomerStatus] = useState<CustomerStatus>(() =>
    savedOrder?.customerId
      ? "found"
      : savedOrder?.customerMobile?.length === 10
        ? "new"
        : "idle",
  );
  const latestMobile = useRef(savedOrder?.customerMobile ?? "");

  // ----- Hold list -----
  const [holds, setHolds] = useState<HeldBill[]>(() =>
    loadStore<HeldBill>(HOLD_KEY, []),
  );
  const [holdListOpen, setHoldListOpen] = useState(false);
  const [resumedId, setResumedId] = useState<number | null>(
    savedOrder?.resumedId ?? null,
  );

  // ----- Payment -----
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // Selected payment options (keys) + amount typed for each
  const [selectedModes, setSelectedModes] = useState<string[]>([]);
  const [modeAmounts, setModeAmounts] = useState<Record<string, string>>({});
  const modeInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingStep, setSavingStep] = useState("");

  const upiId: string = useMemo(() => {
    let saved = "";
    try {
      saved = localStorage.getItem(UPI_STORAGE_KEY) || "";
    } catch {
      /* storage blocked */
    }
    return (
      profile.company_upi_id ||
      profile.upi_id ||
      import.meta.env.VITE_UPI_ID ||
      saved ||
      DEFAULT_UPI_ID
    );
  }, [profile]);

  /* ---------- Data loading ---------- */
  const fetchProducts = async () => {
    try {
      const res = await ProductService.getProductsForPOS(
        profile.company_id,
        profile.franchise_id,
      );
      if (res.status === "success") {
        setProductData(
          (res.data ?? []).map((item: any) => ({
            id: Number(item.product_id),
            name: item.product_name,
            image: resolveImage(item.product_image),
            category_name: item.category_name,
            final_amount: Number(item.product_mrp_with_gst) || 0,
            cgst: Number(item.product_cgst) || 0,
            sgst: Number(item.product_sgst) || 0,
            stock: Number(item.product_stock) || 0,
          })),
        );
      } else {
        toast.error(res.message || "Failed to fetch products");
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Failed to fetch products. Please try again.");
    }
  };

  // Payment options = the company's accounts (Cash, Axis, HDFC, UPI …)
  const fetchAccounts = async () => {
    setAccountsLoading(true);
    try {
      const res = await AccountService.getList(
        profile.company_id,
        profile.franchise_id,
      );
      if (res.status === "success" && Array.isArray(res.data)) {
        setAccounts(res.data);
      } else {
        console.warn("Accounts:", res.message);
      }
    } catch (error) {
      console.error("Error fetching accounts:", error);
    } finally {
      setAccountsLoading(false);
    }
  };

  // Products load once (earlier they re-fetched on every hold change)
  useEffect(() => {
    fetchProducts();
    fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveStore(HOLD_KEY, holds);
    notifyOrdersChanged();
  }, [holds]);

  useEffect(() => {
    if (savedOrder?.items?.length)
      toast.info(`Running order restored for ${table.name}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Catalogue derived ---------- */
  const categories = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set(productData.map((p) => p.category_name).filter(Boolean)),
      ),
    ],
    [productData],
  );

  const filtered = useMemo(
    () =>
      productData.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) &&
          (cat === "All" || p.category_name === cat),
      ),
    [search, cat, productData],
  );

  const cartQty = useMemo(
    () => new Map(cart.map((c) => [c.id, c.qty])),
    [cart],
  );

  /* ---------- Totals ---------- */
  const subtotal = cart.reduce((s, i) => s + i.final_amount * i.qty, 0);
  const discountAmount = useMemo(() => {
    const raw =
      discountType === "%" ? (subtotal * discountValue) / 100 : discountValue;
    return Math.min(Math.max(raw || 0, 0), subtotal);
  }, [discountType, discountValue, subtotal]);
  const total = roundOff(subtotal - discountAmount);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  // Close the mobile cart sheet automatically when the cart is emptied
  useEffect(() => {
    if (cart.length === 0) setMobileCartOpen(false);
  }, [cart.length]);

  // Keep the table's running order in storage → the table shows as Booked
  const orderDoneRef = useRef(false);
  useEffect(() => {
    if (!tableKey || orderDoneRef.current) return;
    if (cart.length) {
      saveActiveOrder({
        tableId: tableKey,
        tableName: String(table.name ?? tableKey),
        items: cart,
        customerName,
        customerMobile,
        customerId,
        discountType,
        discountValue,
        resumedId,
        amount: total,
      });
    } else {
      clearActiveOrder(tableKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cart,
    customerName,
    customerMobile,
    customerId,
    discountType,
    discountValue,
    resumedId,
    total,
  ]);

  /* ---------- Payment derived ---------- */
  const payOptions: PayOption[] = useMemo(
    () => (accounts.length ? accounts.map(toPayOption) : FALLBACK_OPTIONS),
    [accounts],
  );
  const selectedOptions = payOptions.filter((o) =>
    selectedModes.includes(o.key),
  );
  const modeAmount = (key: string) =>
    selectedModes.includes(key)
      ? round2(Math.max(Number(modeAmounts[key]) || 0, 0))
      : 0;
  const sumOf = (list: PayOption[]) =>
    round2(list.reduce((s, o) => s + modeAmount(o.key), 0));

  const cashIn = sumOf(selectedOptions.filter((o) => o.kind === "cash"));
  const nonCashIn = sumOf(selectedOptions.filter((o) => o.kind !== "cash"));
  const received = round2(cashIn + nonCashIn);
  const paidNow = Math.min(received, total);
  const dueNow = round2(total - paidNow);
  const changeToReturn = round2(Math.max(received - total, 0));
  const paymentError =
    nonCashIn > total
      ? "Bank / UPI amount is more than the bill total"
      : changeToReturn > cashIn
        ? "Amount received is more than the bill total"
        : "";

  // What actually stays in each account — change is handed back from cash
  let changeLeft = changeToReturn;
  const paymentLines = selectedOptions
    .map((o) => {
      let amount = modeAmount(o.key);
      if (o.kind === "cash" && changeLeft > 0) {
        const cut = Math.min(amount, changeLeft);
        amount = round2(amount - cut);
        changeLeft = round2(changeLeft - cut);
      }
      return {
        key: o.key,
        mode: o.label,
        legacyMode: LEGACY_MODE[o.kind],
        accountId: o.accountId,
        amount,
      };
    })
    .filter((p) => p.amount > 0);
  const paymentModeLabel = paymentLines.length
    ? paymentLines.map((p) => p.mode).join("+")
    : selectedOptions[0]?.label || "Cash";
  const remainingToEnter = round2(Math.max(total - received, 0));

  // UPI QR — for the first selected UPI-type account
  const upiOption = selectedOptions.find((o) => o.kind === "upi") ?? null;
  const upiAmount = upiOption ? modeAmount(upiOption.key) : 0;
  const upiPayee = upiOption?.upiId || upiId;
  const upiLink =
    upiOption && upiPayee
      ? `upi://pay?pa=${encodeURIComponent(upiPayee)}&pn=${encodeURIComponent(
          profile.company_name || "Store",
        )}&am=${upiAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(
          `Bill ${table.name ?? ""}`,
        )}`
      : "";

  /* ---------- Cart actions ---------- */
  const add = (p: Product) =>
    setCart((c) =>
      c.find((x) => x.id === p.id)
        ? c.map((x) => (x.id === p.id ? { ...x, qty: x.qty + 1 } : x))
        : [...c, { ...p, qty: 1 }],
    );
  const updateQty = (id: number, d: number) =>
    setCart((c) =>
      c
        .map((x) => (x.id === id ? { ...x, qty: Math.max(0, x.qty + d) } : x))
        .filter((x) => x.qty > 0),
    );
  const removeFromCart = (id: number) =>
    setCart((c) => c.filter((x) => x.id !== id));

  /* ---------- Fly-to-cart animation ---------- */
  const cartIconRef = useRef<HTMLButtonElement>(null);
  const flightsRef = useRef(0);
  const [cartBump, setCartBump] = useState(0);
  const [panelFlash, setPanelFlash] = useState(false);

  /** Product thumbnail flies on a curved path into the header cart icon */
  const flyToCart = (cardEl: HTMLElement | null) => {
    const bump = () => setCartBump((n) => n + 1);
    const target = cartIconRef.current;
    if (!cardEl || !target) return bump();

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const img = cardEl.querySelector("img") as HTMLImageElement | null;
    const s = (img ?? cardEl).getBoundingClientRect();
    const t = target.getBoundingClientRect();
    if (
      reduceMotion ||
      !t.width ||
      !s.width ||
      flightsRef.current >= 6 ||
      typeof document.body.animate !== "function"
    )
      return bump();

    const size = Math.max(40, Math.min(s.width, s.height, 112));
    const startX = s.left + s.width / 2 - size / 2;
    const startY = s.top + s.height / 2 - size / 2;
    const dx = t.left + t.width / 2 - (startX + size / 2);
    const dy = t.top + t.height / 2 - (startY + size / 2);

    // Outer moves horizontally, inner vertically with a different curve → arc
    const outer = document.createElement("div");
    outer.setAttribute("aria-hidden", "true");
    Object.assign(outer.style, {
      position: "fixed",
      left: `${startX}px`,
      top: `${startY}px`,
      width: `${size}px`,
      height: `${size}px`,
      zIndex: "9999",
      pointerEvents: "none",
      willChange: "transform",
    });
    const inner = document.createElement("div");
    Object.assign(inner.style, {
      width: "100%",
      height: "100%",
      overflow: "hidden",
      borderRadius: "16px",
      background: "hsl(var(--card))",
      boxShadow:
        "0 14px 32px -10px rgba(0,0,0,.45), 0 0 0 3px hsl(var(--primary) / .35)",
      willChange: "transform, opacity",
    });
    const src = img?.currentSrc || img?.src;
    if (src) {
      const clone = document.createElement("img");
      clone.src = src;
      clone.alt = "";
      Object.assign(clone.style, {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
      });
      inner.appendChild(clone);
    } else {
      Object.assign(inner.style, {
        background: "hsl(var(--primary))",
        color: "hsl(var(--primary-foreground))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: "700",
        fontSize: `${Math.round(size / 2.4)}px`,
      });
      inner.textContent = (cardEl.getAttribute("data-product-name") ||
        "+")[0].toUpperCase();
    }
    outer.appendChild(inner);
    document.body.appendChild(outer);
    flightsRef.current += 1;

    const duration = Math.round(
      Math.min(900, Math.max(560, Math.hypot(dx, dy) * 0.85)),
    );
    const lift = Math.min(70, Math.max(28, Math.abs(dy) * 0.12));

    outer.animate(
      [{ transform: "translateX(0)" }, { transform: `translateX(${dx}px)` }],
      {
        duration,
        easing: "cubic-bezier(.4,0,.55,1)",
        fill: "forwards",
      },
    );
    const flight = inner.animate(
      [
        {
          transform: "translateY(0) scale(1)",
          opacity: 1,
          borderRadius: "16px",
          easing: "cubic-bezier(.2,.7,.4,1)",
        },
        {
          transform: `translateY(${-lift}px) scale(.9)`,
          opacity: 1,
          borderRadius: "22px",
          offset: 0.22,
          easing: "cubic-bezier(.55,0,.9,.55)",
        },
        {
          transform: `translateY(${dy}px) scale(.16)`,
          opacity: 0.75,
          borderRadius: "50%",
        },
      ],
      { duration, fill: "forwards" },
    );

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      outer.remove();
      flightsRef.current = Math.max(0, flightsRef.current - 1);
      bump();
    };
    flight.onfinish = finish;
    flight.oncancel = finish;
    setTimeout(finish, duration + 400); // safety net
  };

  const addWithFly = (p: Product, cardEl: HTMLElement | null) => {
    add(p);
    flyToCart(cardEl);
  };

  const openCartFromHeader = () => {
    if (isMobile) {
      setMobileCartOpen(true);
    } else {
      setPanelFlash(true);
      setTimeout(() => setPanelFlash(false), 700);
    }
  };

  /* ---------- Customer ---------- */
  const lookupCustomer = async (mobile: string) => {
    setCustomerStatus("loading");
    try {
      const res = await CustomerService.findByMobile(
        mobile,
        String(profile.company_id),
        String(profile.franchise_id ?? ""),
      );
      // Number was edited while the request was in flight
      if (latestMobile.current !== mobile) return;

      if (res.status !== "success") {
        setCustomerStatus("idle");
        return;
      }
      const row: any = Array.isArray(res.data) ? res.data[0] : res.data;
      if (row) {
        const dbName =
          row.customer_name && row.customer_name !== "Walk-in"
            ? String(row.customer_name)
            : "";
        setCustomerName((prev) => dbName || prev);
        setCustomerId(Number(row.customer_id));
        setCustomerStatus("found");
      } else {
        setCustomerId(null);
        setCustomerStatus("new");
      }
    } catch (error) {
      console.error("Error fetching customer:", error);
      if (latestMobile.current === mobile) setCustomerStatus("idle");
    }
  };

  const handleMobileChange = (value: string) => {
    const mobile = value.replace(/\D/g, "").slice(0, 10);
    if (mobile === customerMobile) return;
    latestMobile.current = mobile;
    // Drop the name that was prefilled for the previous number
    if (customerId !== null) setCustomerName("");
    setCustomerId(null);
    setCustomerMobile(mobile);
    if (mobile.length === 10) lookupCustomer(mobile);
    else setCustomerStatus("idle");
  };

  const isMobileValid = () => {
    if (!customerMobile || customerMobile.length === 10) return true;
    toast.error("Enter a 10 digit mobile number");
    return false;
  };

  /** Returns customer id — registers the customer if the number is new */
  const ensureCustomer = async (): Promise<number | null> => {
    if (customerMobile.length !== 10) return null;
    if (customerId) return customerId;

    const res: any = await CustomerService.createCustomer({
      company_id: String(profile.company_id),
      franchise_id: String(profile.franchise_id ?? ""),
      customer_name: customerName.trim() || "Walk-in",
      customer_mobile: customerMobile,
      customer_email: "",
      customer_state_id: "",
      customer_city: "",
      customer_address: "",
      customer_pincode: "",
      customer_wallet_balance: 0,
    });
    // success → new id; 409 (already registered) → existing id
    if (res?.customer_id) {
      const id = Number(res.customer_id);
      setCustomerId(id);
      setCustomerStatus("found");
      return id;
    }
    throw new Error(res?.message || "Failed to save customer");
  };

  /* ---------- Hold / reset ---------- */
  const clearBill = () => {
    setCart([]);
    setCustomerName("");
    setCustomerMobile("");
    setCustomerId(null);
    setCustomerStatus("idle");
    latestMobile.current = "";
    setDiscountValue(0);
    setDiscountType("%");
    setResumedId(null);
  };

  const handleHold = () => {
    if (!cart.length) return toast.error("Nothing to hold");
    if (!isMobileValid()) return;
    const bill: HeldBill = {
      id: resumedId ?? Date.now(),
      tableId: tableKey,
      tableName: table.name,
      customerName: customerName || "Walk-in",
      customerMobile,
      customerId,
      heldAt: new Date().toISOString(),
      amount: total,
      items: cart,
      discountType,
      discountValue,
    };
    setHolds((h) => [bill, ...h.filter((x) => x.id !== bill.id)]);
    toast.success("Bill held");
    clearBill();
    setMobileCartOpen(false);
  };

  const resumeHold = (bill: HeldBill) => {
    setCart(bill.items);
    setCustomerName(bill.customerName === "Walk-in" ? "" : bill.customerName);
    setCustomerMobile(bill.customerMobile);
    setCustomerId(bill.customerId ?? null);
    setCustomerStatus(
      bill.customerId
        ? "found"
        : bill.customerMobile?.length === 10
          ? "new"
          : "idle",
    );
    latestMobile.current = bill.customerMobile;
    setDiscountType(bill.discountType);
    setDiscountValue(bill.discountValue);
    setResumedId(bill.id);
    setHolds((h) => h.filter((x) => x.id !== bill.id));
    setHoldListOpen(false);
    if (isMobile) setMobileCartOpen(true);
    toast.success(`Resumed bill — ${bill.tableName}`);
  };

  /* ---------- Payment ---------- */
  const handleCheckout = () => {
    if (!cart.length) return toast.error("Cart is empty");
    if (!isMobileValid()) return;
    // Restaurant default: full amount in the cash account, cashier edits if needed
    const def = payOptions.find((o) => o.kind === "cash") ?? payOptions[0];
    setSelectedModes(def ? [def.key] : []);
    setModeAmounts(def ? { [def.key]: String(total) } : {});
    setMobileCartOpen(false);
    setCheckoutOpen(true);
    if (!accounts.length && !accountsLoading) fetchAccounts();
  };

  const togglePaymentMode = (mode: string) => {
    if (selectedModes.includes(mode)) {
      if (selectedModes.length === 1) return; // keep at least one mode
      setSelectedModes((s) => s.filter((m) => m !== mode));
      setModeAmounts((a) => ({ ...a, [mode]: "" }));
    } else {
      setSelectedModes((s) => [...s, mode]);
      setTimeout(() => modeInputRefs.current[mode]?.focus(), 0);
    }
  };

  const fillRemaining = (mode: string) =>
    setModeAmounts((a) => ({
      ...a,
      [mode]: String(round2(modeAmount(mode) + remainingToEnter)),
    }));

  const handlePrint = async () => {
    const financialYearRaw = localStorage.getItem("financial_year");
    const financialYear = financialYearRaw
      ? JSON.parse(financialYearRaw)
      : null;

    if (!profile?.company_id || !profile?.franchise_id)
      return toast.error("Company data missing. Please sign in again.");
    if (!financialYear?.key)
      return toast.error("Financial year not set. Please sign in again.");
    if (!cart.length) return toast.error("Cart is empty");
    if (paymentError) return toast.error(paymentError);
    if (received <= 0 && total > 0) {
      const ok = window.confirm(
        "No amount received. Save the full amount as due?",
      );
      if (!ok) return;
    }

    // Bill-level discount spread across items proportionally
    const items = cart.map((i) => {
      const lineAmount = i.final_amount * i.qty;
      const lineShare = subtotal > 0 ? lineAmount / subtotal : 0;
      return {
        product_id: i.id,
        single_product_price: i.final_amount,
        qty: i.qty,
        cgst: i.cgst,
        sgst: i.sgst,
        available_stock: i.stock,
        discount_type: "₹" as const,
        discount: Number((discountAmount * lineShare).toFixed(2)),
      };
    });

    setSaving(true);
    try {
      // 1. Customer — register if the number is new
      setSavingStep("Saving customer…");
      await ensureCustomer();

      // 2. Bill
      setSavingStep("Saving bill…");
      const res = await SellService.createSell({
        company_id: profile.company_id,
        franchise_id: profile.franchise_id,
        sell_financial_year_id: financialYear.key,
        sell_date: today(),
        sell_table_id: tableId,
        sell_total_amount: total,
        sell_total_discount_amount: round2(discountAmount),
        sales_total_paid_amount: paidNow,
        sales_total_remainng_amount: dueNow,
        customer_mobile: customerMobile || undefined,
        customer_name: customerName.trim() || "Walk-in",
        payment_mode: paymentModeLabel,
        // mode keeps the old Cash/Card/UPI value; account_id says which account got it
        payments: paymentLines.map((p) => ({
          mode: p.legacyMode,
          amount: p.amount,
          account_id: p.accountId ?? undefined,
          account_name: p.mode,
        })),
        items,
      });

      if (res.status !== "success")
        throw new Error(res.message || "Failed to save bill");

      // 3. Add the received amount to each selected account's balance
      const credits = paymentLines.filter(
        (p): p is typeof p & { accountId: number } => !!p.accountId,
      );
      if (credits.length) {
        setSavingStep("Updating accounts…");
        try {
          const cr = await creditAccounts({
            company_id: String(profile.company_id),
            franchise_id: String(profile.franchise_id),
            financial_year_id: financialYear.key,
            remark:
              `POS Sale ${res.sell_bill_number ?? ""} (${table.name ?? tableKey})`.trim(),
            // sell.php already writes the payment rows in tbl_transaction
            log_transaction: false,
            entries: credits.map((p) => ({
              account_id: p.accountId,
              amount: p.amount,
            })),
          });
          if (cr?.status !== "success")
            throw new Error(cr?.message || "Account update failed");
        } catch (err) {
          console.error("Account credit failed:", err);
          toast.warning(
            `Bill saved, but account balance was not updated: ${errorMessage(err)}`,
          );
        }
      }

      // Bill done → table no longer has a running order
      orderDoneRef.current = true;
      clearActiveOrder(tableKey);

      toast.success(`Bill saved — ${res.sell_bill_number}`);
      setCheckoutOpen(false);
      setTimeout(() => navigate("/restaurant-tables"), 600);
    } catch (error) {
      console.error("Error saving bill:", error);
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
      setSavingStep("");
    }
  };

  /* ============================================================
     RENDER PIECES
     ============================================================ */

  const customerBadge =
    customerStatus === "found" ? (
      <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
        <UserCheck className="h-3 w-3" />
        Existing
      </span>
    ) : customerStatus === "new" ? (
      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
        <UserPlus className="h-3 w-3" />
        New customer
      </span>
    ) : null;

  const renderCustomer = () => (
    <div className="space-y-2 border-b border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Customer
        </h3>
        {customerBadge}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <Label className="text-[11px] text-muted-foreground">Mobile No</Label>
          <div className="relative mt-1">
            <Phone className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              placeholder="10 digit mobile"
              value={customerMobile}
              onChange={(e) => handleMobileChange(e.target.value)}
              className="h-10 pl-8 pr-8 font-display text-sm"
            />
            {customerStatus === "loading" && (
              <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
            {customerStatus === "found" && (
              <CheckCircle2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-success" />
            )}
          </div>
        </div>
        <div className="min-w-0">
          <Label className="text-[11px] text-muted-foreground">
            Customer Name
          </Label>
          <div className="relative mt-1">
            <User className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Walk-in customer"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="h-10 pl-8 text-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderCartItems = () =>
    cart.length === 0 ? (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Receipt className="h-8 w-8 opacity-40" />
        </div>
        <p className="mt-3 text-sm font-medium">No items yet</p>
        <p className="mt-0.5 text-xs">Tap an item to add it</p>
      </div>
    ) : (
      <div className="divide-y divide-border">
        {cart.map((i) => (
          <div key={i.id} className="flex gap-3 px-4 py-3">
            <ProductImage
              src={i.image}
              alt={i.name}
              className="h-11 w-11 shrink-0 rounded-lg"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{i.name}</p>
                  <p className="font-display text-xs text-muted-foreground">
                    ₹{fmt(i.final_amount)} × {i.qty}
                  </p>
                </div>
                <button
                  onClick={() => removeFromCart(i.id)}
                  aria-label={`Remove ${i.name}`}
                  className="-mr-1 p-1 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center rounded-lg border border-border">
                  <button
                    onClick={() => updateQty(i.id, -1)}
                    aria-label="Decrease quantity"
                    className="p-1.5 hover:bg-muted active:scale-90"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="min-w-[24px] px-1.5 text-center font-display text-xs font-semibold">
                    {i.qty}
                  </span>
                  <button
                    onClick={() => updateQty(i.id, 1)}
                    aria-label="Increase quantity"
                    className="p-1.5 hover:bg-muted active:scale-90"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <span className="font-display text-sm font-semibold">
                  ₹{fmt(round2(i.final_amount * i.qty))}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );

  const renderCart = (mobile: boolean) => (
    <div className="flex h-full w-full flex-col bg-card">
      {/* Cart header */}
      <div
        className={cn(
          "flex items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-primary/5 to-accent/5 py-3 pl-4",
          mobile ? "pr-12" : "pr-4",
        )}
      >
        <div className="min-w-0">
          <h2 className="truncate font-display text-sm font-bold tracking-tight">
            {resumedId ? "Resumed Bill" : "Current Order"} · {table.name}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {cartCount} {cartCount === 1 ? "item" : "items"}
          </p>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {renderCustomer()}
        <div className="px-4 pb-1 pt-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Items{cart.length > 0 && ` (${cart.length})`}
          </h3>
        </div>
        {renderCartItems()}

        {cart.length > 0 && (
          <div className="space-y-2 border-t border-border p-4">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs text-muted-foreground">
                Discount
              </span>
              <div className="inline-flex overflow-hidden rounded-md border border-border">
                {(["%", "₹"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDiscountType(t)}
                    className={cn(
                      "px-2.5 py-1 font-display text-[11px] font-semibold transition-colors",
                      discountType === t
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={discountValue || ""}
                onChange={(e) =>
                  setDiscountValue(Math.max(Number(e.target.value), 0))
                }
                placeholder="0"
                className="h-8 w-20 text-right font-display text-xs"
              />
            </div>
            <div className="flex justify-between pt-1 text-xs text-muted-foreground">
              <span>Subtotal</span>
              <span className="font-display">₹{fmt(round2(subtotal))}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Discount Amount</span>
              <span className="font-display text-success">
                -₹{fmt(round2(discountAmount))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Cart footer */}
      <div
        className={cn(
          "space-y-3 border-t border-border bg-muted/20 p-4",
          mobile && "pb-[max(1rem,env(safe-area-inset-bottom))]",
        )}
      >
        <div className="flex items-end justify-between">
          <span className="text-sm font-semibold text-muted-foreground">
            Final Payable
          </span>
          <span className="font-display text-2xl font-bold text-primary">
            ₹{fmt(total)}
          </span>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button
            variant="outline"
            onClick={handleHold}
            disabled={!cart.length}
            className="h-11 gap-1.5 px-4 font-display text-sm"
          >
            <Pause className="h-4 w-4" />
            Hold
          </Button>
          <Button
            onClick={handleCheckout}
            disabled={!cart.length}
            className="h-11 gap-1.5 bg-gradient-primary font-display text-sm shadow-lg shadow-primary/25 hover:opacity-90"
          >
            <Wallet className="h-4 w-4" />
            Pay ₹{fmt(total)}
          </Button>
        </div>
      </div>
    </div>
  );

  const renderStepper = (p: Product, qty: number, className: string) => (
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(
        "h-7 shrink-0 items-center justify-between rounded-lg bg-gradient-primary p-0.5 text-primary-foreground shadow-md shadow-primary/25 animate-in fade-in zoom-in-95 duration-200",
        className,
      )}
    >
      <button
        type="button"
        aria-label={`Remove one ${p.name}`}
        onClick={() => updateQty(p.id, -1)}
        className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-white/20 active:scale-90"
      >
        <Minus className="h-3 w-3" strokeWidth={2.5} />
      </button>
      <span className="min-w-[1.25rem] text-center font-display text-xs font-bold tabular-nums">
        {qty}
      </span>
      <button
        type="button"
        aria-label={`Add one ${p.name}`}
        onClick={(e) =>
          addWithFly(
            p,
            (e.currentTarget as HTMLElement).closest(
              "[data-product-card]",
            ) as HTMLElement | null,
          )
        }
        className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-white/20 active:scale-90"
      >
        <Plus className="h-3 w-3" strokeWidth={2.5} />
      </button>
    </div>
  );

  const renderProductGrid = () => (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:gap-3 lg:grid-cols-4 xl:grid-cols-5">
      {filtered.length === 0 ? (
        <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
          No products found
        </p>
      ) : (
        filtered.map((p) => {
          const qty = cartQty.get(p.id) ?? 0;
          const inCart = qty > 0;
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              data-product-card
              data-product-name={p.name}
              onClick={(e) => addWithFly(p, e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  addWithFly(p, e.currentTarget);
                }
              }}
              className={cn(
                "group relative cursor-pointer select-none rounded-xl border bg-card p-1.5 text-left outline-none transition-all duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary",
                inCart
                  ? "border-primary/50 bg-primary/[0.06] shadow-sm shadow-primary/10 ring-1 ring-primary/20"
                  : "border-border hover:border-primary/40 hover:shadow-md",
              )}
            >
              {inCart && (
                <button
                  type="button"
                  aria-label={`Remove all ${p.name} from cart`}
                  title="Remove from cart"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromCart(p.id);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white shadow-[0_2px_8px_rgba(0,0,0,0.25)] ring-1 ring-white/40 backdrop-blur-md duration-200 animate-in fade-in zoom-in-75 transition-all hover:rotate-90 hover:bg-black/70 active:scale-90"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              )}
              <ProductImage
                src={p.image}
                alt={p.name}
                className="aspect-square w-full rounded-lg"
              />
              <div className="px-1 pb-0.5 pt-1.5">
                <p className="line-clamp-2 min-h-[2rem] text-xs font-medium leading-4">
                  {p.name}
                </p>
                <div className="mt-0.5 flex min-h-6 items-center justify-between gap-1">
                  <p className="truncate font-display text-sm font-bold text-primary">
                    ₹{fmt(p.final_amount)}
                  </p>
                  {inCart && renderStepper(p, qty, "hidden xl:flex")}
                </div>
              </div>
              {inCart && renderStepper(p, qty, "mt-1 flex w-full xl:hidden")}
            </div>
          );
        })
      )}
    </div>
  );

  const holdList = (
    <div className="space-y-2">
      {holds.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          <ListOrdered className="mx-auto mb-2 h-8 w-8 opacity-30" />
          No held bills
        </div>
      ) : (
        holds.map((h) => (
          <button
            key={h.id}
            onClick={() => resumeHold(h)}
            className="w-full rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:border-primary active:bg-muted/50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-semibold">
                  {h.tableName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {h.customerName}
                  {h.customerMobile ? ` · ${h.customerMobile}` : ""}
                </p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(h.heldAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <span className="shrink-0 font-display text-sm font-bold text-primary">
                ₹{fmt(h.amount)}
              </span>
            </div>
          </button>
        ))
      )}
    </div>
  );

  /* ============================================================
     PAGE
     ============================================================ */

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      <style>{`
        @keyframes rb-cart-bump {
          0% { transform: scale(1) rotate(0); }
          30% { transform: scale(1.28) rotate(-10deg); }
          60% { transform: scale(.92) rotate(5deg); }
          100% { transform: scale(1) rotate(0); }
        }
        @keyframes rb-badge-pop {
          0% { transform: scale(.4); }
          60% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="rb-cart-bump"], [style*="rb-badge-pop"] { animation: none !important; }
        }
      `}</style>
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-3 md:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/restaurant-tables")}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold">
              {table.name}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Order in progress
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHoldListOpen(true)}
            className="relative h-8 gap-1.5 text-xs"
          >
            <ListOrdered className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Hold List</span>
            {holds.length > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {holds.length}
              </span>
            )}
          </Button>
          {/* Cart icon — fly-to-cart target on every device */}
          <button
            ref={cartIconRef}
            type="button"
            onClick={openCartFromHeader}
            aria-label={`Cart, ${cartCount} items`}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-sm transition-colors hover:bg-primary/5 active:scale-95"
          >
            <span
              key={`cart-${cartBump}`}
              className="flex"
              style={
                cartBump
                  ? { animation: "rb-cart-bump .5s cubic-bezier(.36,1.4,.5,1)" }
                  : undefined
              }
            >
              <ShoppingCart className="h-[18px] w-[18px]" />
            </span>
            {cartCount > 0 && (
              <span
                key={`badge-${cartBump}`}
                className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gradient-primary px-1 text-[10px] font-bold text-primary-foreground shadow-md shadow-primary/30"
                style={{ animation: "rb-badge-pop .35s ease-out" }}
              >
                {cartCount}
              </span>
            )}
          </button>
          {/* <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Total</p>
            <p className="font-display text-base font-bold text-primary">
              ₹{fmt(total)}
            </p>
          </div> */}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Products */}
        <div className="flex flex-1 flex-col overflow-hidden md:border-r">
          <div className="space-y-2 border-b bg-card p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 rounded-xl pl-9"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={cn(
                    "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all active:scale-95",
                    cat === c
                      ? "bg-gradient-primary text-primary-foreground shadow-md shadow-primary/25"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain p-3 pb-28 md:pb-3">
            {renderProductGrid()}
          </div>

          {/* Mobile floating "View Cart" bar — slides up when cart has items */}
          <div
            className={cn(
              "fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 transition-transform duration-300 ease-out md:hidden",
              cartCount > 0 ? "translate-y-0" : "translate-y-[150%]",
            )}
          >
            <button
              onClick={() => setMobileCartOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl bg-gradient-primary px-4 py-3 text-primary-foreground shadow-xl shadow-primary/30 active:scale-[0.98]"
            >
              <span
                key={`bar-${cartBump}`}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/15"
                style={
                  cartBump
                    ? {
                        animation:
                          "rb-cart-bump .5s cubic-bezier(.36,1.4,.5,1)",
                      }
                    : undefined
                }
              >
                <ShoppingCart className="h-[18px] w-[18px]" />
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-primary">
                  {cartCount}
                </span>
              </span>
              <div className="flex-1 text-left leading-tight">
                <p className="text-[11px] opacity-85">Total</p>
                <p className="font-display text-base font-bold">
                  ₹{fmt(total)}
                </p>
              </div>
              <span className="flex items-center gap-1 text-sm font-semibold">
                View Cart
                <ChevronRight className="h-4 w-4" />
              </span>
            </button>
          </div>
        </div>

        {/* Desktop cart panel */}
        <aside
          className={cn(
            "hidden w-[380px] shrink-0 transition-shadow duration-300 md:flex lg:w-[400px]",
            panelFlash && "shadow-[inset_0_0_0_2px_hsl(var(--primary))]",
          )}
        >
          {renderCart(false)}
        </aside>
      </div>

      {/* Mobile cart — bottom sheet with slide-up animation */}
      {isMobile && (
        <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
          <SheetContent
            side="bottom"
            className="flex h-[94dvh] flex-col gap-0 overflow-hidden rounded-t-3xl border-t-0 p-0 data-[state=closed]:duration-300 data-[state=open]:duration-300 ease-out"
          >
            <SheetTitle className="sr-only">Cart</SheetTitle>
            <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted" />
            <div className="min-h-0 flex-1">{renderCart(true)}</div>
          </SheetContent>
        </Sheet>
      )}

      {/* Hold list */}
      <Sheet open={holdListOpen} onOpenChange={setHoldListOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "flex flex-col gap-0 p-0",
            isMobile
              ? "max-h-[85dvh] rounded-t-3xl border-t-0"
              : "w-full sm:max-w-sm",
          )}
        >
          {isMobile && (
            <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted" />
          )}
          <SheetHeader className="px-5 pb-3 pt-4 text-left">
            <SheetTitle className="font-display">Held Bills</SheetTitle>
            <SheetDescription className="text-xs">
              Tap a bill to resume it
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {holdList}
          </div>
        </SheetContent>
      </Sheet>

      {/* Payment */}
      <ResponsiveModal
        open={checkoutOpen}
        onOpenChange={(v) => !saving && setCheckoutOpen(v)}
        isMobile={isMobile}
        preventClose={saving}
        wide={!!upiOption}
        title={`Payment — ${table.name}`}
        description={`${cartCount} ${cartCount === 1 ? "item" : "items"} · ${customerName || "Walk-in customer"}`}
        icon={<Wallet className="h-5 w-5" />}
        footer={
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button
              variant="outline"
              onClick={() => setCheckoutOpen(false)}
              disabled={saving}
              className="h-12 px-5"
            >
              Cancel
            </Button>
            <Button
              onClick={handlePrint}
              disabled={saving}
              className="h-12 gap-2 bg-gradient-primary font-display text-base shadow-lg shadow-primary/25 hover:opacity-90"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              {saving ? savingStep || "Saving…" : "Print Bill"}
            </Button>
          </div>
        }
      >
        <div
          className={cn(
            "gap-4",
            upiOption && "md:grid md:grid-cols-[1fr_220px]",
          )}
        >
          <div className="space-y-4">
            {/* Total */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-primary p-4 text-primary-foreground shadow-lg shadow-primary/25">
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
              <div className="absolute -bottom-8 right-10 h-20 w-20 rounded-full bg-white/10" />
              <p className="relative text-xs opacity-85">Total Payable</p>
              <p className="relative font-display text-3xl font-bold tracking-tight">
                ₹{fmt(total)}
              </p>
              {discountAmount > 0 && (
                <p className="relative mt-0.5 text-[11px] opacity-85">
                  Discount ₹{fmt(round2(discountAmount))}
                </p>
              )}
            </div>

            {/* Payment modes */}
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  Payment Mode
                </Label>
                {paidNow < total && paidNow > 0 ? (
                  <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                    Partial payment
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    Tap more than one to split
                  </span>
                )}
              </div>

              {/* One button per account — tap more than one to split */}
              {accountsLoading && !accounts.length ? (
                <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-12 animate-pulse rounded-xl bg-muted"
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-1.5 grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto rounded-xl bg-muted/60 p-1 sm:grid-cols-3">
                  {payOptions.map((o) => {
                    const Icon = KIND_ICON[o.kind];
                    const active = selectedModes.includes(o.key);
                    return (
                      <button
                        key={o.key}
                        type="button"
                        aria-pressed={active}
                        title={o.label}
                        onClick={() => togglePaymentMode(o.key)}
                        className={cn(
                          "relative flex h-12 items-center gap-2 rounded-lg px-2.5 text-left transition-all duration-200 active:scale-[0.97]",
                          active
                            ? "bg-card text-primary shadow-sm ring-1 ring-primary/30"
                            : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 leading-tight">
                          <span className="block truncate text-[13px] font-semibold">
                            {o.label}
                          </span>
                          <span className="block truncate text-[10px] font-medium opacity-70">
                            {o.sub}
                          </span>
                        </span>
                        {active && (
                          <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground animate-in zoom-in-50">
                            <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {!accountsLoading && !accounts.length && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  No accounts found — add Cash / Bank / UPI accounts from the
                  Accounts page to track balances.
                </p>
              )}

              {/* Amount box for each selected account */}
              <div
                className={cn(
                  "mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card",
                  !selectedOptions.length && "hidden",
                )}
              >
                {selectedOptions.map((o) => {
                  const Icon = KIND_ICON[o.kind];
                  const value = o.key;
                  return (
                    <div
                      key={value}
                      className="flex items-center gap-2.5 px-2.5 py-2 animate-in fade-in slide-in-from-top-1"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate text-sm font-medium">
                          {o.label}
                        </p>
                        {remainingToEnter > 0 ? (
                          <button
                            type="button"
                            onClick={() => fillRemaining(value)}
                            className="text-[11px] font-medium text-primary hover:underline"
                          >
                            Fill balance ₹{fmt(remainingToEnter)}
                          </button>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            Amount received
                          </p>
                        )}
                      </div>
                      <div className="relative w-32 shrink-0">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-display text-sm text-muted-foreground">
                          ₹
                        </span>
                        <Input
                          ref={(el) => {
                            modeInputRefs.current[value] = el;
                          }}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          placeholder="0"
                          value={modeAmounts[value] ?? ""}
                          onChange={(e) =>
                            setModeAmounts((a) => ({
                              ...a,
                              [value]: e.target.value,
                            }))
                          }
                          onFocus={(e) => e.target.select()}
                          className="h-10 rounded-lg pl-6 text-right font-display text-base font-semibold"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {paymentError && (
                <p className="mt-2 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive">
                  {paymentError}
                </p>
              )}
            </div>

            {/* Summary */}
            <div className="space-y-1.5 rounded-2xl bg-muted/50 p-3 text-sm">
              {paymentLines.length > 1 &&
                paymentLines.map((p) => (
                  <div
                    key={p.key}
                    className="flex justify-between text-xs text-muted-foreground"
                  >
                    <span>{p.mode}</span>
                    <span className="font-display">₹{fmt(p.amount)}</span>
                  </div>
                ))}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paying now</span>
                <span className="font-display font-semibold">
                  ₹{fmt(paidNow)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Balance due</span>
                <span
                  className={cn(
                    "font-display font-semibold",
                    dueNow > 0 ? "text-warning" : "text-success",
                  )}
                >
                  ₹{fmt(dueNow)}
                </span>
              </div>
              {changeToReturn > 0 && (
                <div className="flex justify-between border-t border-border pt-1.5">
                  <span className="font-medium">Change to return</span>
                  <span className="font-display font-bold text-success">
                    ₹{fmt(changeToReturn)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* UPI QR */}
          {upiOption && (
            <div className="mt-4 flex flex-col items-center rounded-2xl border border-border bg-card p-4 text-center md:mt-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <QrCode className="h-4 w-4 text-primary" />
                Scan & Pay
              </div>
              <p className="mt-0.5 max-w-full truncate text-[11px] font-medium">
                {upiOption.label}
              </p>
              {upiLink && upiAmount > 0 ? (
                <>
                  <div className="mt-3 rounded-xl bg-white p-2.5 shadow-sm">
                    <QRCodeSVG value={upiLink} size={168} level="M" />
                  </div>
                  <p className="mt-3 font-display text-lg font-bold">
                    ₹{fmt(upiAmount)}
                  </p>
                  <p className="max-w-full truncate text-[11px] text-muted-foreground">
                    {upiPayee}
                  </p>
                </>
              ) : (
                <p className="mt-4 text-xs text-muted-foreground">
                  Enter the UPI amount to generate the QR
                </p>
              )}
            </div>
          )}
        </div>
      </ResponsiveModal>
    </div>
  );
};

export default RestaurantBilling;
