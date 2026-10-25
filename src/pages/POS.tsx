import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Banknote,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CreditCard,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Minus,
  PackageSearch,
  Pause,
  Phone,
  Plus,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { loadStore, saveStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ProductImage, resolveImage } from "@/components/shared/ProductImage";
import { SellService } from "@/services/sell.service";
import { CustomerService, type StateRow } from "@/services/customer.service";
import {
  FullScreenLoader,
  LoaderStyles,
  ProcessingOverlay,
  ProductGridSkeleton,
  type ProcessingStep,
} from "@/components/Loader";
import { DatePicker } from "./Datepicker";

/* ============================================================
   TYPES
   ============================================================ */

interface Product {
  id: number;
  name: string;
  image: string;
  category_name: string;
  final_amount: number;
  is_active: number;
}

interface CartItem extends Product {
  qty: number;
  discountType: "%" | "₹";
  discountValue: number;
}

interface CustomerExtra {
  email: string;
  stateId: string;
  city: string;
  address: string;
  pincode: string;
  walletBalance: string;
}

interface InvoiceDetails {
  date: string;
  mobile: string;
  name: string;
  customerId: number | null;
  extra: CustomerExtra;
}

interface DraftInvoice {
  id: number;
  details: InvoiceDetails;
  cart: CartItem[];
  billDiscountType: "%" | "₹";
  billDiscountValue: number;
  shipping: number;
  labour: number;
  amount: number;
  customerDirty?: boolean;
  savedAt?: string;
}

type CustomerStatus = "idle" | "loading" | "found" | "new";
type PaymentMode = "Cash" | "Card" | "UPI";

interface ReceiptData {
  billNumber: string;
  date: string;
  customerName: string;
  customerMobile: string;
  items: { name: string; qty: number; rate: number; total: number }[];
  grossSubtotal: number;
  totalDiscount: number;
  shipping: number;
  labour: number;
  total: number;
  paid: number;
  due: number;
  paymentMode: string; // e.g. "Cash" or "Cash+UPI"
  payments: { mode: PaymentMode; amount: number }[];
  change: number;
}

/* ============================================================
   CONSTANTS & HELPERS
   ============================================================ */

const DRAFT_KEY = "pos-drafts";
const UPI_STORAGE_KEY = "pos-upi-id";
// Optional: hard-code the store's UPI ID here if it isn't in company_data or .env (VITE_UPI_ID)
const DEFAULT_UPI_ID = "9173271098@ibl";
const UPI_REGEX = /^[\w.\-]{2,}@[a-zA-Z][a-zA-Z0-9.]{1,}$/;
const MOBILE_QUERY = "(max-width: 767px)";
/** Cart lines shown before "View All" is needed. */
const CART_PREVIEW_COUNT = 3;

const API_URL =
  import.meta.env.VITE_API_URL || "https://sunshineproduct.in/POS/v1_api/";
const getUserProfile = () =>
  JSON.parse(localStorage.getItem("company_data") || "{}");

const BILL_STEPS: ProcessingStep[] = [
  { key: "customer", label: "Saving customer details" },
  { key: "bill", label: "Creating bill & line items" },
  { key: "print", label: "Preparing receipt" },
];

const PAYMENT_MODES: {
  value: PaymentMode;
  label: string;
  icon: typeof Banknote;
}[] = [
  { value: "Cash", label: "Cash", icon: Banknote },
  { value: "Card", label: "Card", icon: CreditCard },
  { value: "UPI", label: "UPI", icon: Smartphone },
];

const emptyModeAmounts = (): Record<PaymentMode, string> => ({
  Cash: "",
  Card: "",
  UPI: "",
});

const roundOff = (v: number): number =>
  v - Math.floor(v) < 0.5 ? Math.floor(v) : Math.ceil(v);
const round2 = (v: number) => Math.round(v * 100) / 100;
const fmt = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
// Local date (toISOString is UTC and gives yesterday before 5:30 AM IST)
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const emptyExtra = (): CustomerExtra => ({
  email: "",
  stateId: "",
  city: "",
  address: "",
  pincode: "",
  walletBalance: "",
});

const emptyDetails = (): InvoiceDetails => ({
  date: today(),
  mobile: "",
  name: "",
  customerId: null,
  extra: emptyExtra(),
});

// Drafts saved by the previous version had email/address/pincode at the top level
const normalizeDraft = (d: any): DraftInvoice => {
  const det = d?.details ?? {};
  return {
    id: d.id,
    cart: d.cart ?? [],
    billDiscountType: d.billDiscountType ?? "₹",
    billDiscountValue: d.billDiscountValue ?? 0,
    shipping: d.shipping ?? 0,
    labour: d.labour ?? 0,
    amount: d.amount ?? 0,
    customerDirty: d.customerDirty ?? false,
    savedAt: d.savedAt,
    details: {
      date: det.date || today(),
      mobile: det.mobile ?? "",
      name: det.name ?? "",
      customerId: det.customerId ?? null,
      extra: {
        ...emptyExtra(),
        email: det.email ?? "",
        address: det.address ?? "",
        pincode: det.pincode ?? "",
        ...(det.extra ?? {}),
      },
    },
  };
};

const lineGross = (i: CartItem) => i.final_amount * i.qty;
const lineDiscount = (i: CartItem) => {
  const gross = lineGross(i);
  const d =
    i.discountType === "%" ? (gross * i.discountValue) / 100 : i.discountValue;
  return Math.min(Math.max(d || 0, 0), gross);
};
const lineTotal = (i: CartItem) => lineGross(i) - lineDiscount(i);

const errorMessage = (e: any) =>
  e?.response?.data?.message || e?.message || "Something went wrong";

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/** Prints an 80mm thermal-style receipt through a hidden iframe */
const printReceipt = (r: ReceiptData) => {
  const p = getUserProfile();
  const company = p.company_name || p.franchise_name || "Invoice";
  const address = p.company_address || p.franchise_address || "";
  const phone = p.company_mobile || p.company_phone || p.mobile || "";
  const gst = p.company_gst || p.gst_number || "";

  const rows = r.items
    .map(
      (i) => `<tr>
        <td>${escapeHtml(i.name)}<div class="muted">${i.qty} × ₹${fmt(i.rate)}</div></td>
        <td class="r">₹${fmt(i.total)}</td>
      </tr>`,
    )
    .join("");

  const line = (label: string, value: string, cls = "") =>
    `<div class="row ${cls}"><span>${label}</span><span>${value}</span></div>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(r.billNumber)}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; color: #000; margin: 0; width: 72mm; }
    h1 { font-size: 15px; margin: 0; text-align: center; }
    .c { text-align: center; } .r { text-align: right; white-space: nowrap; vertical-align: top; }
    .muted { color: #555; font-size: 11px; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; } td { padding: 3px 0; }
    .row { display: flex; justify-content: space-between; padding: 1px 0; }
    .big { font-size: 15px; font-weight: 700; }
  </style></head><body>
    <h1>${escapeHtml(company)}</h1>
    ${address ? `<div class="c muted">${escapeHtml(address)}</div>` : ""}
    ${phone ? `<div class="c muted">Ph: ${escapeHtml(String(phone))}</div>` : ""}
    ${gst ? `<div class="c muted">GSTIN: ${escapeHtml(gst)}</div>` : ""}
    <hr/>
    ${line("Bill No", escapeHtml(r.billNumber))}
    ${line("Date", escapeHtml(r.date))}
    ${line("Customer", escapeHtml(r.customerName || "Walk-in"))}
    ${r.customerMobile ? line("Mobile", escapeHtml(r.customerMobile)) : ""}
    <hr/>
    <table>${rows}</table>
    <hr/>
    ${line("Subtotal", `₹${fmt(r.grossSubtotal)}`)}
    ${r.totalDiscount > 0 ? line("Discount", `-₹${fmt(r.totalDiscount)}`) : ""}
    ${r.shipping > 0 ? line("Shipping", `₹${fmt(r.shipping)}`) : ""}
    ${r.labour > 0 ? line("Labour", `₹${fmt(r.labour)}`) : ""}
    <hr/>
    ${line("TOTAL", `₹${fmt(r.total)}`, "big")}
    ${
      r.payments.length > 1
        ? r.payments
            .map((p) => line(`Paid (${p.mode})`, `₹${fmt(p.amount)}`))
            .join("")
        : line(`Paid (${r.paymentMode})`, `₹${fmt(r.paid)}`)
    }
    ${r.change > 0 ? line("Change returned", `₹${fmt(r.change)}`) : ""}
    ${r.due > 0 ? line("Due", `₹${fmt(r.due)}`) : ""}
    <hr/>
    <div class="c">Thank you! Visit again</div>
  </body></html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    return false;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();

  const cleanup = () => setTimeout(() => iframe.remove(), 500);
  win.onafterprint = cleanup;
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch (e) {
      console.error("Print failed:", e);
    }
    setTimeout(() => iframe.remove(), 60_000); // fallback if afterprint never fires
  }, 300);
  return true;
};

/* ============================================================
   SMALL HOOKS & COMPONENTS
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

/** State dropdown — shadcn Select on desktop, searchable bottom sheet on mobile */
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
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted" />
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

/** Horizontal stepper used in the payment flow */
const Stepper = ({ steps, current }: { steps: string[]; current: number }) => (
  <div className="flex items-center">
    {steps.map((label, i) => {
      const done = i < current;
      const active = i === current;
      return (
        <div
          key={label}
          className={cn("flex items-center", i < steps.length - 1 && "flex-1")}
        >
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-all duration-300",
                done && "bg-success text-white",
                active &&
                  "bg-gradient-primary text-primary-foreground shadow-md shadow-primary/30",
                !done && !active && "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className="mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-success transition-all duration-500"
                style={{ width: done ? "100%" : "0%" }}
              />
            </div>
          )}
        </div>
      );
    })}
  </div>
);

/* ============================================================
   POS PAGE
   ============================================================ */

const POS = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const profile = useMemo(getUserProfile, []);

  // ----- Catalogue -----
  const [productData, setProductData] = useState<Product[]>([]);
  const [booting, setBooting] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productError, setProductError] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // ----- Order -----
  const [cart, setCart] = useState<CartItem[]>([]);
  const [billDiscountType, setBillDiscountType] = useState<"%" | "₹">("₹");
  const [billDiscountValue, setBillDiscountValue] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [labour, setLabour] = useState(0);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [cartExpanded, setCartExpanded] = useState(false);

  // ----- Customer -----
  const [details, setDetails] = useState<InvoiceDetails>(emptyDetails);
  const [customerStatus, setCustomerStatus] = useState<CustomerStatus>("idle");
  const [customerDirty, setCustomerDirty] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerExtra>(emptyExtra);
  const [states, setStates] = useState<StateRow[]>([]);
  const [statesLoading, setStatesLoading] = useState(false);
  const latestMobile = useRef("");

  // ----- Drafts -----
  const [drafts, setDrafts] = useState<DraftInvoice[]>(() =>
    loadStore<any>(DRAFT_KEY, []).map(normalizeDraft),
  );
  const [draftListOpen, setDraftListOpen] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<number | null>(null);

  // ----- Payment -----
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentStep, setPaymentStep] = useState<1 | 2>(1); // 1 = payment, 2 = done
  // Split payment: each selected mode gets its own amount box
  const [selectedModes, setSelectedModes] = useState<PaymentMode[]>(["Cash"]);
  const [modeAmounts, setModeAmounts] =
    useState<Record<PaymentMode, string>>(emptyModeAmounts);
  const modeInputRefs = useRef<Partial<Record<PaymentMode, HTMLInputElement | null>>>({});
  const [processing, setProcessing] = useState({ active: false, current: 0 });
  const [completedBill, setCompletedBill] = useState<ReceiptData | null>(null);
  const [upiId, setUpiId] = useState<string>(() => {
    let saved = "";
    try {
      saved = localStorage.getItem(UPI_STORAGE_KEY) || "";
    } catch {
      /* storage blocked */
    }
    return (
      profile.company_upi_id ||
      profile.upi_id ||
      profile.company_upi ||
      profile.upi ||
      import.meta.env.VITE_UPI_ID ||
      saved ||
      DEFAULT_UPI_ID
    );
  });
  const [upiDraft, setUpiDraft] = useState("");

  /* ---------- Full-screen mode: hide the app's side menu / page scroll ---------- */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* ---------- Data loading ---------- */
  const fetchProducts = async () => {
    setLoadingProducts(true);
    setProductError(false);
    try {
      const res = await axios.post(`${API_URL}product.php`, {
        type: 6,
        company_id: profile.company_id,
        franchise_id: profile.franchise_id,
      });
      if (res.data.status === "success") {
        setProductData(
          (res.data.data ?? []).map((item: any) => ({
            id: Number(item.product_id),
            name: item.product_name,
            image: resolveImage(item.product_image),
            category_name: item.category_name,
            final_amount: Number(item.product_final_amount) || 0,
            is_active: Number(item.product_is_active),
          })),
        );
      } else {
        setProductError(true);
        toast.error(res.data.message || "Failed to fetch products");
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      setProductError(true);
      toast.error("Failed to fetch products. Please try again.");
    } finally {
      setLoadingProducts(false);
    }
  };

  // Same call the Vendor form uses (state.php type 2 — active states of the company)
  const fetchStates = async (force = false) => {
    if (!force && (states.length || statesLoading)) return;
    setStatesLoading(true);
    try {
      const res = await axios.post(`${API_URL}state.php`, {
        type: 2,
        company_id: profile.company_id,
      });
      console.log("Fetched states:", res);
      const rows: any[] = Array.isArray(res.data?.data) ? res.data.data : [];
      setStates(
        rows
          .filter((r) => r && r.state_id != null && r.state_name)
          .map((r) => ({
            state_id: String(r.state_id),
            state_name: String(r.state_name),
            state_active_inactive: String(r.state_active_inactive ?? "1"),
          })),
      );
      if (res.data?.status !== "success")
        console.warn("state.php:", res.data?.message);
    } catch (error) {
      console.error("Error fetching states:", error);
      toast.error("Failed to load states");
    } finally {
      setStatesLoading(false);
    }
  };

  useEffect(() => {
    Promise.allSettled([fetchProducts(), fetchStates()]).finally(() =>
      setBooting(false),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveStore(DRAFT_KEY, drafts);
  }, [drafts]);

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

  const filteredProducts = useMemo(
    () =>
      productData.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) &&
          (selectedCategory === "All" || p.category_name === selectedCategory),
      ),
    [search, selectedCategory, productData],
  );

  const cartQty = useMemo(
    () => new Map(cart.map((c) => [c.id, c.qty])),
    [cart],
  );

  /* ---------- Cart actions ---------- */
  const addToCart = (product: Product) =>
    setCart((prev) => {
      const existing = prev.find((c) => c.id === product.id);
      if (existing)
        return prev.map((c) =>
          c.id === product.id ? { ...c, qty: c.qty + 1 } : c,
        );
      return [
        ...prev,
        { ...product, qty: 1, discountType: "₹", discountValue: 0 },
      ];
    });

  const updateQty = (id: number, delta: number) =>
    setCart((prev) =>
      prev
        .map((c) =>
          c.id === id ? { ...c, qty: Math.max(0, c.qty + delta) } : c,
        )
        .filter((c) => c.qty > 0),
    );

  const removeFromCart = (id: number) =>
    setCart((prev) => prev.filter((c) => c.id !== id));

  const updateItemDiscount = (id: number, type: "%" | "₹", value: number) =>
    setCart((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, discountType: type, discountValue: value } : c,
      ),
    );

  /* ---------- Totals ---------- */
  const grossSubtotal = useMemo(
    () => cart.reduce((s, i) => s + lineGross(i), 0),
    [cart],
  );
  const itemDiscount = useMemo(
    () => cart.reduce((s, i) => s + lineDiscount(i), 0),
    [cart],
  );
  const subtotal = grossSubtotal - itemDiscount;
  const billDiscount = Math.min(
    Math.max(
      billDiscountType === "%"
        ? (subtotal * billDiscountValue) / 100
        : billDiscountValue,
      0,
    ),
    subtotal,
  );
  const totalDiscount = itemDiscount + billDiscount;
  const finalTotal = roundOff(
    Math.max(grossSubtotal - totalDiscount, 0) + shipping + labour,
  );
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  // Collapsed cart shows only the most recently added lines so the
  // bill discount / charges section stays in view.
  const visibleCart = cartExpanded
    ? cart
    : cart.slice(-CART_PREVIEW_COUNT);
  const hiddenCartCount = cart.length - visibleCart.length;

  useEffect(() => {
    if (cart.length === 0) setCartExpanded(false);
  }, [cart.length]);

  // Payment-derived values
  const modeAmount = (m: PaymentMode) =>
    selectedModes.includes(m)
      ? round2(Math.max(Number(modeAmounts[m]) || 0, 0))
      : 0;
  const cashIn = modeAmount("Cash");
  const nonCashIn = round2(modeAmount("Card") + modeAmount("UPI"));
  const received = round2(cashIn + nonCashIn);
  const paidNow = Math.min(received, finalTotal);
  const dueNow = round2(finalTotal - paidNow);
  const changeToReturn = round2(Math.max(received - finalTotal, 0));
  // Change can only be handed back from cash — card / UPI can't exceed the bill
  const paymentError =
    nonCashIn > finalTotal
      ? "Card + UPI amount is more than the bill total"
      : changeToReturn > cashIn
        ? "Amount received is more than the bill total"
        : "";
  // What actually stays with the store per mode (cash is net of change)
  const paymentLines = PAYMENT_MODES.map(({ value }) => ({
    mode: value,
    amount:
      value === "Cash" ? round2(cashIn - changeToReturn) : modeAmount(value),
  })).filter((p) => p.amount > 0);
  const paymentModeLabel = paymentLines.length
    ? paymentLines.map((p) => p.mode).join("+")
    : selectedModes[0] || "Cash";
  const remainingToEnter = round2(Math.max(finalTotal - received, 0));

  /* ---------- Customer ---------- */
  const lookupCustomer = async (mobile: string) => {
    setCustomerStatus("loading");
    try {
      const res = await CustomerService.findByMobile(
        mobile,
        String(profile.company_id),
        String(profile.franchise_id ?? ""),
      );
      // Ignore the response if the number was edited while the request was in flight
      if (latestMobile.current !== mobile) return;

      if (res.status !== "success") {
        setCustomerStatus("idle");
        toast.error(res.message || "Customer lookup failed");
        return;
      }

      const row: any = Array.isArray(res.data) ? res.data[0] : res.data;
      if (row) {
        const fromRow = (prev: CustomerExtra): CustomerExtra => ({
          email: row.customer_email || prev.email,
          stateId:
            row.customer_state_id && String(row.customer_state_id) !== "0"
              ? String(row.customer_state_id)
              : prev.stateId,
          city: row.customer_city || prev.city,
          address: row.customer_address || prev.address,
          pincode: row.customer_pincode || prev.pincode,
          walletBalance:
            row.customer_wallet_balance != null
              ? String(Number(row.customer_wallet_balance))
              : prev.walletBalance,
        });
        const dbName =
          row.customer_name && row.customer_name !== "Walk-in"
            ? String(row.customer_name)
            : "";
        setDetails((d) => ({
          ...d,
          name: dbName || d.name,
          customerId: Number(row.customer_id),
          extra: fromRow(d.extra),
        }));
        setCustomerForm((f) => fromRow(f));
        setCustomerDirty(false);
        setCustomerStatus("found");
      } else {
        setDetails((d) => ({ ...d, customerId: null }));
        setCustomerStatus("new");
      }
    } catch (error) {
      console.error("Error fetching customer:", error);
      if (latestMobile.current === mobile) setCustomerStatus("idle");
    }
  };

  const handleMobileChange = (value: string) => {
    const mobile = value.replace(/\D/g, "").slice(0, 10);
    if (mobile === details.mobile) return;
    latestMobile.current = mobile;
    const wasExisting = details.customerId !== null;
    // Drop the details prefilled for the previous number
    setDetails((d) =>
      wasExisting
        ? { ...d, mobile, name: "", customerId: null, extra: emptyExtra() }
        : { ...d, mobile, customerId: null },
    );
    if (wasExisting) {
      setCustomerForm(emptyExtra());
      setCustomerDirty(false);
    }
    if (mobile.length === 10) lookupCustomer(mobile);
    else setCustomerStatus("idle");
  };

  const handleNameChange = (name: string) => {
    setDetails((d) => ({ ...d, name }));
    if (details.customerId) setCustomerDirty(true);
  };

  const openCustomerModal = () => {
    setCustomerForm({ ...details.extra });
    setCustomerModalOpen(true);
    if (!states.length) fetchStates(true);
  };

  const saveCustomerModal = () => {
    const f = customerForm;
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))
      return toast.error("Enter a valid email address");
    if (f.pincode && f.pincode.length !== 6)
      return toast.error("Pincode must be 6 digits");
    setDetails((d) => ({ ...d, extra: { ...f } }));
    setCustomerDirty(true);
    setCustomerModalOpen(false);
    toast.success("Customer details added to this bill");
  };

  const setFormField = (key: keyof CustomerExtra, value: string) =>
    setCustomerForm((f) => ({ ...f, [key]: value }));

  const hasExtra = Object.values(details.extra).some((v) => v !== "");
  const selectedStateName = states.find(
    (s) => String(s.state_id) === details.extra.stateId,
  )?.state_name;

  const isMobileValid = () => {
    if (!details.mobile || details.mobile.length === 10) return true;
    toast.error("Enter a 10 digit mobile number");
    return false;
  };

  /* ---------- Reset / drafts ---------- */
  const resetInvoice = () => {
    setCart([]);
    setDetails(emptyDetails());
    setBillDiscountType("₹");
    setBillDiscountValue(0);
    setShipping(0);
    setLabour(0);
    setEditingDraftId(null);
    setCustomerStatus("idle");
    setCustomerDirty(false);
    latestMobile.current = "";
  };

  const holdBill = () => {
    if (!cart.length) return toast.error("Cart is empty");
    if (!isMobileValid()) return;
    const draft: DraftInvoice = {
      id: editingDraftId ?? Date.now(),
      details,
      cart,
      billDiscountType,
      billDiscountValue,
      shipping,
      labour,
      amount: finalTotal,
      customerDirty,
      savedAt: new Date().toISOString(),
    };
    setDrafts((d) => [draft, ...d.filter((x) => x.id !== draft.id)]);
    toast.success("Bill on hold — find it in Save List");
    resetInvoice();
    setMobileCartOpen(false);
  };

  const openDraft = (raw: DraftInvoice) => {
    const draft = normalizeDraft(raw);
    setCart(draft.cart);
    setDetails(draft.details);
    setBillDiscountType(draft.billDiscountType);
    setBillDiscountValue(draft.billDiscountValue);
    setShipping(draft.shipping);
    setLabour(draft.labour);
    setEditingDraftId(draft.id);
    setCustomerDirty(draft.customerDirty ?? false);
    setCustomerStatus(
      draft.details.customerId
        ? "found"
        : draft.details.mobile.length === 10
          ? "new"
          : "idle",
    );
    latestMobile.current = draft.details.mobile;
    setDraftListOpen(false);
    if (isMobile) setMobileCartOpen(true);
    toast.success("Draft loaded — you can edit and finalise it");
  };

  const deleteDraft = (id: number) => {
    setDrafts((d) => d.filter((x) => x.id !== id));
    if (editingDraftId === id) setEditingDraftId(null);
    toast.success("Draft removed");
  };

  /* ---------- Payment ---------- */
  const openPayment = () => {
    if (!cart.length) return toast.error("Cart is empty");
    if (!isMobileValid()) return;
    setSelectedModes(["Cash"]);
    setModeAmounts(emptyModeAmounts());
    setPaymentStep(1);
    setCompletedBill(null);
    setMobileCartOpen(false);
    setPaymentOpen(true);
  };

  const togglePaymentMode = (mode: PaymentMode) => {
    if (selectedModes.includes(mode)) {
      if (selectedModes.length === 1) return; // keep at least one mode
      setSelectedModes((s) => s.filter((m) => m !== mode));
      setModeAmounts((a) => ({ ...a, [mode]: "" }));
    } else {
      setSelectedModes((s) => [...s, mode]);
      // Let the input enable before focusing it
      setTimeout(() => modeInputRefs.current[mode]?.focus(), 0);
    }
  };

  // Puts whatever is still unpaid into this mode's box
  const fillRemaining = (mode: PaymentMode) =>
    setModeAmounts((a) => ({
      ...a,
      [mode]: String(round2(modeAmount(mode) + remainingToEnter)),
    }));

  const closePayment = (open: boolean) => {
    if (open || processing.active) return;
    setPaymentOpen(false);
    if (paymentStep === 2) resetInvoice();
  };

  const startNewOrder = () => {
    setPaymentOpen(false);
    resetInvoice();
    setPaymentStep(1);
    setCompletedBill(null);
  };

  const buildCustomerPayload = () => ({
    company_id: String(profile.company_id),
    franchise_id: String(profile.franchise_id ?? ""),
    customer_name: details.name.trim() || "Walk-in",
    customer_mobile: details.mobile,
    customer_email: details.extra.email.trim(),
    customer_state_id: details.extra.stateId,
    customer_city: details.extra.city.trim(),
    customer_address: details.extra.address.trim(),
    customer_pincode: details.extra.pincode,
    customer_wallet_balance: Number(details.extra.walletBalance) || 0,
  });

  const handlePrintBill = async () => {
    if (!cart.length) return toast.error("Cart is empty");
    if (paymentError) return toast.error(paymentError);
    if (received <= 0 && finalTotal > 0) {
      const ok = window.confirm(
        "No amount received. Save the full amount as due?",
      );
      if (!ok) return;
    }

    setProcessing({ active: true, current: 0 });
    try {
      // 1. Customer — register new, or update an existing one whose details changed
      let customerId = details.customerId;
      if (details.mobile.length === 10) {
        const payload = buildCustomerPayload();
        const warnSkipped = (fields?: string[]) => {
          if (fields?.length)
            toast.warning(
              `Not saved (column missing in tbl_customer): ${fields
                .map((f) => f.replace("customer_", "").replace("_id", ""))
                .join(", ")}`,
            );
        };
        if (!customerId) {
          const res = await CustomerService.createCustomer(payload);
          if (res.status === "success" && res.customer_id) {
            customerId = res.customer_id;
            warnSkipped(res.skipped_fields);
          } else if (res.customer_id) {
            // Already registered (409) — use it and push the edited details
            customerId = res.customer_id;
            if (customerDirty)
              await CustomerService.updateCustomer(customerId, payload);
          } else {
            throw new Error(res.message || "Failed to save customer");
          }
        } else if (customerDirty) {
          const res = await CustomerService.updateCustomer(customerId, payload);
          if (res.status !== "success")
            throw new Error(res.message || "Failed to update customer");
          warnSkipped(res.skipped_fields);
        }
      }

      // 2. Bill header + line items (tbl_sell → tbl_sell_details)
      setProcessing({ active: true, current: 1 });
      const financialYearRaw = localStorage.getItem("financial_year");
      const financialYear = financialYearRaw
        ? JSON.parse(financialYearRaw)
        : null;
      const sellRes = await SellService.createSell({
        company_id: String(profile.company_id),
        franchise_id: String(profile.franchise_id),
        sell_financial_year_id: financialYear.key || undefined,
        sell_date: details.date,
        sell_total_amount: finalTotal,
        sell_total_discount_amount: round2(totalDiscount),
        sell_total_ship_charge: round2(shipping),
        sell_total_lebar_charge: round2(labour),
        sales_total_paid_amount: paidNow,
        sales_total_remainng_amount: dueNow,
        sell_table_id: 2,
        customer_mobile: details.mobile || undefined,
        customer_name: details.name.trim() || "Walk-in",
        payment_mode: paymentModeLabel,
        payments: paymentLines,
        items: cart.map((i) => ({
          product_id: i.id,
          single_product_price: i.final_amount,
          qty: i.qty,
          discount_type: i.discountType,
          discount: i.discountValue || 0,
        })),
      });
      if (sellRes.status !== "success")
        throw new Error(sellRes.message || "Failed to save bill");

      // 3. Receipt
      setProcessing({ active: true, current: 2 });
      const receipt: ReceiptData = {
        billNumber: sellRes.sell_bill_number || `#${sellRes.sell_id}`,
        date: details.date,
        customerName: details.name.trim() || "Walk-in",
        customerMobile: details.mobile,
        items: cart.map((i) => ({
          name: i.name,
          qty: i.qty,
          rate: i.final_amount,
          total: round2(lineTotal(i)),
        })),
        grossSubtotal: round2(grossSubtotal),
        totalDiscount: round2(totalDiscount),
        shipping,
        labour,
        total: finalTotal,
        paid: paidNow,
        due: dueNow,
        paymentMode: paymentModeLabel,
        payments: paymentLines,
        change: changeToReturn,
      };
      printReceipt(receipt);

      if (editingDraftId)
        setDrafts((d) => d.filter((x) => x.id !== editingDraftId));
      if (customerId) setDetails((d) => ({ ...d, customerId }));
      setCompletedBill(receipt);
      setPaymentStep(2);
      toast.success(`Bill ${receipt.billNumber} saved`);
    } catch (error) {
      console.error("Error saving bill:", error);
      toast.error(errorMessage(error));
    } finally {
      setProcessing({ active: false, current: 0 });
    }
  };

  const upiLink = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
        profile.company_name || "Store",
      )}&am=${modeAmount("UPI").toFixed(2)}&cu=INR&tn=${encodeURIComponent("POS Bill")}`
    : "";

  const saveUpiId = () => {
    const id = upiDraft.trim();
    if (!UPI_REGEX.test(id))
      return toast.error("Enter a valid UPI ID (e.g. store@okaxis)");
    try {
      localStorage.setItem(UPI_STORAGE_KEY, id);
    } catch {
      /* storage blocked — keep for this session only */
    }
    setUpiId(id);
    toast.success("UPI ID saved");
  };

  /* ============================================================
     RENDER PIECES (plain functions — keeps input focus stable)
     ============================================================ */

  const numberField = (
    label: string,
    value: number,
    onChange: (n: number) => void,
  ) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        value={value || ""}
        onChange={(e) => onChange(Math.max(Number(e.target.value), 0))}
        placeholder="0"
        className="h-8 w-24 text-right font-display text-xs"
      />
    </div>
  );

  const mobileInput = (big = false) => (
    <div className="relative mt-1">
      <Phone className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        placeholder="10 digit mobile"
        value={details.mobile}
        onChange={(e) => handleMobileChange(e.target.value)}
        className={cn("pl-8 pr-8 font-display text-sm", big ? "h-11" : "h-10")}
      />
      {customerStatus === "loading" && (
        <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {customerStatus === "found" && (
        <CheckCircle2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-success" />
      )}
    </div>
  );

  const nameInput = (big = false) => (
    <div className="relative mt-1">
      <User className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Walk-in customer"
        value={details.name}
        onChange={(e) => handleNameChange(e.target.value)}
        className={cn("pl-8 text-sm", big ? "h-11" : "h-10")}
      />
    </div>
  );

  const existingBadge = customerStatus === "found" && (
    <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
      <UserCheck className="h-3 w-3" />
      Existing
      {Number(details.extra.walletBalance) > 0 &&
        ` · Wallet ₹${fmt(Number(details.extra.walletBalance))}`}
    </span>
  );

  const renderCustomer = () => (
    <div className="space-y-3 border-b border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Customer
        </h3>
        {existingBadge}
      </div>

      <div className="flex items-end gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
          <div className="min-w-0">
            <Label className="text-[11px] text-muted-foreground">
              Mobile No
            </Label>
            {mobileInput()}
          </div>
          <div className="min-w-0">
            <Label className="text-[11px] text-muted-foreground">
              Customer Name
            </Label>
            {nameInput()}
          </div>
        </div>
        <button
          type="button"
          onClick={openCustomerModal}
          aria-label="Customer details"
          title="Customer details"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-md shadow-primary/25 transition-all hover:opacity-90 active:scale-95"
        >
          {hasExtra ? (
            <UserCheck className="h-4 w-4" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          {hasExtra && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-card" />
          )}
        </button>
      </div>

      {hasExtra && (
        <button
          type="button"
          onClick={openCustomerModal}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">
            {[
              details.extra.email,
              details.extra.city,
              selectedStateName,
              details.extra.pincode,
            ]
              .filter(Boolean)
              .join(" · ") || "Customer details added"}
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        </button>
      )}
    </div>
  );

  const renderCartItems = () =>
    cart.length === 0 ? (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <ShoppingCart className="h-8 w-8 opacity-40" />
        </div>
        <p className="mt-3 text-sm font-medium">No items in cart</p>
        <p className="mt-0.5 text-xs">Tap a product to add it</p>
      </div>
    ) : (
      <div className="divide-y divide-border">
        {visibleCart.map((item) => (
          <div key={item.id} className="flex gap-3 px-4 py-3">
            <ProductImage
              src={item.image}
              alt={item.name}
              className="h-11 w-11 shrink-0 rounded-lg"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="font-display text-xs text-muted-foreground">
                    ₹{fmt(item.final_amount)} × {item.qty}
                  </p>
                </div>
                <button
                  onClick={() => removeFromCart(item.id)}
                  aria-label={`Remove ${item.name}`}
                  className="-mr-1 p-1 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border border-border">
                  <button
                    onClick={() => updateQty(item.id, -1)}
                    aria-label="Decrease quantity"
                    className="p-1.5 hover:bg-muted active:scale-90"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="min-w-[24px] px-1.5 text-center font-display text-xs font-semibold">
                    {item.qty}
                  </span>
                  <button
                    onClick={() => updateQty(item.id, 1)}
                    aria-label="Increase quantity"
                    className="p-1.5 hover:bg-muted active:scale-90"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex flex-1 items-center gap-1">
                  <button
                    onClick={() =>
                      updateItemDiscount(
                        item.id,
                        item.discountType === "%" ? "₹" : "%",
                        item.discountValue,
                      )
                    }
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border font-display text-[10px] hover:bg-muted"
                  >
                    {item.discountType}
                  </button>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={item.discountValue || ""}
                    onChange={(e) =>
                      updateItemDiscount(
                        item.id,
                        item.discountType,
                        Math.max(Number(e.target.value), 0),
                      )
                    }
                    placeholder="Disc"
                    className="h-7 px-1.5 text-xs"
                  />
                </div>
                <span className="whitespace-nowrap font-display text-sm font-semibold">
                  ₹{fmt(round2(lineTotal(item)))}
                </span>
              </div>
            </div>
          </div>
        ))}
        {hiddenCartCount > 0 && (
          <button
            type="button"
            onClick={() => setCartExpanded(true)}
            className="flex w-full items-center justify-center gap-1 py-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
          >
            +{hiddenCartCount} more {hiddenCartCount === 1 ? "item" : "items"}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );

  const renderCart =(mobile: boolean) => (
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
            {editingDraftId ? "Editing Saved Invoice" : "Current Order"}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {cartCount} {cartCount === 1 ? "item" : "items"}
          </p>
        </div>
        <div className="w-36 shrink-0">
          <DatePicker
            value={details.date}
            onChange={(v) => setDetails((d) => ({ ...d, date: v }))}
            className="h-9 text-xs"
          />
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {renderCustomer()}

        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Items{cart.length > 0 && ` (${cart.length})`}
          </h3>
          {cart.length > CART_PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setCartExpanded((v) => !v)}
              className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
            >
              {cartExpanded ? "Hide All" : `View All (${cart.length})`}
              {cartExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
        {renderCartItems()}

        {cart.length > 0 && (
          <div className="space-y-2 border-t border-border p-4">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs text-muted-foreground">
                Bill Discount
              </span>
              <button
                onClick={() =>
                  setBillDiscountType(billDiscountType === "%" ? "₹" : "%")
                }
                className="flex h-8 w-8 items-center justify-center rounded border border-border font-display text-[10px] hover:bg-muted"
              >
                {billDiscountType}
              </button>
              <Input
                type="number"
                inputMode="decimal"
                value={billDiscountValue || ""}
                onChange={(e) =>
                  setBillDiscountValue(Math.max(Number(e.target.value), 0))
                }
                placeholder="0"
                className="h-8 w-24 text-right font-display text-xs"
              />
            </div>
            {numberField("Shipping Charges", shipping, setShipping)}
            {numberField("Labour Charges", labour, setLabour)}
            <div className="flex justify-between pt-1 text-xs text-muted-foreground">
              <span>Subtotal</span>
              <span className="font-display">
                ₹{fmt(round2(grossSubtotal))}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total Discount</span>
              <span className="font-display text-success">
                -₹{fmt(round2(totalDiscount))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Cart footer */}
      {cart.length > 0 && (
        <div
          className={cn(
            "space-y-3 border-t border-border bg-muted/20 p-4",
            mobile && "pb-[max(1rem,env(safe-area-inset-bottom))]",
          )}
        >
          <div className="flex items-end justify-between">
            <span className="text-sm font-semibold text-muted-foreground">
              Total Amount
            </span>
            <span className="font-display text-2xl font-bold text-primary">
              ₹{fmt(finalTotal)}
            </span>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button
              variant="outline"
              onClick={holdBill}
              className="h-11 gap-1.5 px-4 font-display text-sm"
            >
              <Pause className="h-4 w-4" />
              Hold
            </Button>
            <Button
              onClick={openPayment}
              className="h-11 gap-1.5 bg-gradient-primary font-display text-sm shadow-lg shadow-primary/25 hover:opacity-90"
            >
              <Wallet className="h-4 w-4" />
              Pay ₹{fmt(finalTotal)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  const renderCardStepper = (
    product: Product,
    qty: number,
    className: string,
  ) => (
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(
        "ldr-anim h-7 shrink-0 items-center justify-between rounded-lg bg-gradient-primary p-0.5 text-primary-foreground shadow-md shadow-primary/25",
        className,
      )}
      style={{ animation: "ldr-pop .2s ease-out both" }}
    >
      <button
        type="button"
        aria-label={`Remove one ${product.name}`}
        onClick={() => updateQty(product.id, -1)}
        className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-white/20 active:scale-90"
      >
        <Minus className="h-3 w-3" strokeWidth={2.5} />
      </button>
      <span className="min-w-[1.25rem] text-center font-display text-xs font-bold tabular-nums">
        {qty}
      </span>
      <button
        type="button"
        aria-label={`Add one ${product.name}`}
        onClick={() => addToCart(product)}
        className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-white/20 active:scale-90"
      >
        <Plus className="h-3 w-3" strokeWidth={2.5} />
      </button>
    </div>
  );

  const renderProductGrid = () => {
    if (loadingProducts && !productData.length) return <ProductGridSkeleton />;

    if (productError && !productData.length)
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <PackageSearch className="h-12 w-12 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">Couldn't load products</p>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchProducts}
            className="mt-4 gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      );

    if (!filteredProducts.length)
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
          <PackageSearch className="h-12 w-12 opacity-40" />
          <p className="mt-3 text-sm font-medium">No products found</p>
          <p className="mt-0.5 text-xs">Try a different search or category</p>
        </div>
      );

    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:gap-3 lg:grid-cols-5 xl:grid-cols-6">
        {filteredProducts.map((product) => {
          const qty = cartQty.get(product.id) ?? 0;
          const inCart = qty > 0;
          return (
            <div
              key={product.id}
              role="button"
              tabIndex={0}
              onClick={() => addToCart(product)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  addToCart(product);
                }
              }}
              className={cn(
                "group relative cursor-pointer select-none rounded-xl border bg-card p-1.5 text-left outline-none transition-all duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary",
                inCart
                  ? "border-primary/50 bg-primary/[0.06] shadow-sm shadow-primary/10 ring-1 ring-primary/20"
                  : "border-border hover:border-primary/40 hover:shadow-md",
              )}
            >
              {/* Remove-all: frosted glass close button in the image corner */}
              {inCart && (
                <button
                  type="button"
                  aria-label={`Remove all ${product.name} from cart`}
                  title="Remove from cart"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromCart(product.id);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white shadow-[0_2px_8px_rgba(0,0,0,0.25)] ring-1 ring-white/40 backdrop-blur-md duration-200 animate-in fade-in zoom-in-75 transition-all hover:rotate-90 hover:bg-black/70 active:scale-90"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              )}
              <ProductImage
                src={product.image}
                alt={product.name}
                className="aspect-square w-full rounded-lg"
              />
              <div className="px-1 pb-0.5 pt-1.5">
                <p className="line-clamp-2 min-h-[2rem] text-xs font-medium leading-4">
                  {product.name}
                </p>
                <div className="mt-0.5 flex min-h-6 items-center justify-between gap-1">
                  <p className="truncate font-display text-sm font-bold text-primary">
                    ₹{fmt(product.final_amount)}
                  </p>
                  {/* Desktop: stepper sits beside the price */}
                  {inCart && renderCardStepper(product, qty, "hidden lg:flex")}
                </div>
              </div>
              {/* Mobile / tablet: stepper below the price */}
              {inCart &&
                renderCardStepper(product, qty, "mt-1 flex w-full lg:hidden")}
            </div>
          );
        })}
      </div>
    );
  };

  const draftCountBadge = drafts.length > 0 && (
    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
      {drafts.length}
    </span>
  );

  /* ============================================================
     PAGE
     ============================================================ */

  const page = (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* ---------- Desktop top bar ---------- */}
      <header className="hidden h-16 shrink-0 items-center gap-4 border-b border-border bg-card/80 px-4 backdrop-blur md:flex lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="rounded-xl"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-md shadow-primary/25">
            <Receipt className="h-[18px] w-[18px]" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-sm font-bold">Point of Sale</p>
            <p className="max-w-[180px] truncate text-[11px] text-muted-foreground">
              {profile.company_name || profile.franchise_name || "New sale"}
            </p>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-xl pl-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          onClick={() => setDraftListOpen(true)}
          className="relative h-10 gap-1.5 rounded-xl text-xs"
        >
          <FileText className="h-4 w-4" />
          Save List
          {draftCountBadge}
        </Button>
      </header>

      {/* ---------- Mobile app bar ---------- */}
      <header className="shrink-0 bg-gradient-primary pt-[env(safe-area-inset-top)] text-primary-foreground shadow-md md:hidden">
        <div className="flex h-14 items-center gap-1 px-1.5">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="flex h-10 w-10 items-center justify-center rounded-full active:bg-white/15"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="font-display text-base font-bold">New Sale</p>
            <p className="text-[11px] opacity-85">
              {filteredProducts.length} products
            </p>
          </div>
          <button
            onClick={() => setDraftListOpen(true)}
            aria-label="Saved invoices"
            className="relative flex h-10 w-10 items-center justify-center rounded-full active:bg-white/15"
          >
            <FileText className="h-5 w-5" />
            {drafts.length > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-primary">
                {drafts.length}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ---------- Products panel ---------- */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-border">
          <div className="space-y-2.5 border-b border-border bg-card p-3 md:p-4">
            <div className="relative md:hidden">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 rounded-xl bg-muted/50 pl-9"
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
            <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all active:scale-95",
                    selectedCategory === cat
                      ? "bg-gradient-primary text-primary-foreground shadow-md shadow-primary/25"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain p-3 pb-28 md:p-4 md:pb-4">
            {renderProductGrid()}
          </div>

          {/* Mobile floating cart bar */}
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
              <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                <ShoppingCart className="h-[18px] w-[18px]" />
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-primary">
                  {cartCount}
                </span>
              </span>
              <div className="flex-1 text-left leading-tight">
                <p className="text-[11px] opacity-85">Total</p>
                <p className="font-display text-base font-bold">
                  ₹{fmt(finalTotal)}
                </p>
              </div>
              <span className="flex items-center gap-1 text-sm font-semibold">
                View Cart
                <ChevronRight className="h-4 w-4" />
              </span>
            </button>
          </div>
        </div>

        {/* ---------- Desktop cart panel ---------- */}
        <aside className="hidden w-[380px] shrink-0 md:flex lg:w-[400px]">
          {renderCart(false)}
        </aside>
      </div>

      {/* ---------- Mobile cart sheet ---------- */}
      {isMobile && (
        <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
          <SheetContent
            side="bottom"
            className="flex h-[94dvh] flex-col gap-0 overflow-hidden rounded-t-3xl border-t-0 p-0"
          >
            <SheetTitle className="sr-only">Cart</SheetTitle>
            <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted" />
            <div className="min-h-0 flex-1">{renderCart(true)}</div>
          </SheetContent>
        </Sheet>
      )}

      {/* ---------- Saved invoices ---------- */}
      <Sheet open={draftListOpen} onOpenChange={setDraftListOpen}>
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
            <SheetTitle className="font-display">Saved Invoices</SheetTitle>
            <SheetDescription className="text-xs">
              Bills on hold — tap to continue
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-2 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {drafts.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                <FileText className="mx-auto mb-2 h-8 w-8 opacity-30" />
                No saved invoices
              </div>
            ) : (
              drafts.map((d) => (
                <div
                  key={d.id}
                  className={cn(
                    "flex items-stretch overflow-hidden rounded-2xl border bg-card transition-colors",
                    editingDraftId === d.id
                      ? "border-primary"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  <button
                    onClick={() => openDraft(d)}
                    className="min-w-0 flex-1 p-3 text-left active:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-display text-sm font-semibold">
                          {d.details.name || "Walk-in customer"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {d.details.date} · {d.cart.length} items
                          {d.details.mobile && ` · ${d.details.mobile}`}
                        </p>
                      </div>
                      <p className="shrink-0 font-display text-sm font-bold text-primary">
                        ₹{fmt(d.amount)}
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => deleteDraft(d.id)}
                    aria-label="Delete draft"
                    className="flex w-11 items-center justify-center border-l border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ---------- Customer details modal ---------- */}
      <ResponsiveModal
        open={customerModalOpen}
        onOpenChange={setCustomerModalOpen}
        isMobile={isMobile}
        title={customerStatus === "found" ? "Customer Details" : "New Customer"}
        description="Contact & address — saved with the bill"
        icon={<UserPlus className="h-5 w-5" />}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => setCustomerModalOpen(false)}
              className="h-11"
            >
              Cancel
            </Button>
            <Button
              onClick={saveCustomerModal}
              className="h-11 bg-gradient-primary hover:opacity-90"
            >
              <Check className="mr-1.5 h-4 w-4" />
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-muted/30 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Customer
              </span>
              {existingBadge}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <Label className="text-xs text-muted-foreground">
                  Mobile No
                </Label>
                {mobileInput(true)}
              </div>
              <div className="min-w-0">
                <Label className="text-xs text-muted-foreground">
                  Customer Name
                </Label>
                {nameInput(true)}
              </div>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Email Address
            </Label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                inputMode="email"
                placeholder="customer@email.com"
                value={customerForm.email}
                onChange={(e) => setFormField("email", e.target.value)}
                className="h-10 pl-9"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">State</Label>
              <StatePicker
                value={customerForm.stateId}
                onChange={(v) => setFormField("stateId", v)}
                states={states}
                isMobile={isMobile}
                loading={statesLoading}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">City</Label>
              <Input
                placeholder="City name"
                value={customerForm.city}
                onChange={(e) => setFormField("city", e.target.value)}
                className="mt-1 h-10"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Address</Label>
            <Textarea
              rows={2}
              placeholder="House no, street, area"
              value={customerForm.address}
              onChange={(e) => setFormField("address", e.target.value)}
              className="mt-1 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Pincode</Label>
              <Input
                inputMode="numeric"
                maxLength={6}
                placeholder="6 digits"
                value={customerForm.pincode}
                onChange={(e) =>
                  setFormField("pincode", e.target.value.replace(/\D/g, ""))
                }
                className="mt-1 h-10 font-display"
              />
            </div>
            <div>
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
                  value={customerForm.walletBalance}
                  onChange={(e) =>
                    setFormField("walletBalance", e.target.value)
                  }
                  className="h-10 pl-7 font-display"
                />
              </div>
            </div>
          </div>
        </div>
      </ResponsiveModal>

      {/* ---------- Payment modal ---------- */}
      <ResponsiveModal
        open={paymentOpen}
        onOpenChange={closePayment}
        isMobile={isMobile}
        preventClose={processing.active}
        wide={paymentStep === 1 && selectedModes.includes("UPI")}
        title={paymentStep === 1 ? "Payment" : "Bill Completed"}
        description={
          paymentStep === 1
            ? `${cartCount} ${cartCount === 1 ? "item" : "items"} · ${details.name || "Walk-in customer"}`
            : completedBill?.billNumber
        }
        icon={
          paymentStep === 1 ? (
            <Wallet className="h-5 w-5" />
          ) : (
            <CheckCircle2 className="h-5 w-5" />
          )
        }
        footer={
          paymentStep === 1 ? (
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Button
                variant="outline"
                onClick={() => closePayment(false)}
                disabled={processing.active}
                className="h-12 px-5"
              >
                Cancel
              </Button>
              <Button
                onClick={handlePrintBill}
                disabled={processing.active}
                className="h-12 gap-2 bg-gradient-primary font-display text-base shadow-lg shadow-primary/25 hover:opacity-90"
              >
                {processing.active ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                Print Bill
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => completedBill && printReceipt(completedBill)}
                className="h-12 gap-2"
              >
                <Printer className="h-4 w-4" />
                Print Again
              </Button>
              <Button
                onClick={startNewOrder}
                className="h-12 gap-2 bg-gradient-primary font-display hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                New Order
              </Button>
            </div>
          )
        }
      >
        <div className="mb-4">
          <Stepper
            steps={["Cart", "Payment", "Done"]}
            current={paymentStep === 1 ? 1 : 3}
          />
        </div>

        {paymentStep === 1 ? (
          <div
            className={cn(
              "gap-4",
              selectedModes.includes("UPI") &&
                "md:grid md:grid-cols-[1fr_220px]",
            )}
          >
            <div className="space-y-4">
              {/* Total */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-primary p-4 text-primary-foreground shadow-lg shadow-primary/25">
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
                <div className="absolute -bottom-8 right-10 h-20 w-20 rounded-full bg-white/10" />
                <p className="relative text-xs opacity-85">Total Payable</p>
                <p className="relative font-display text-3xl font-bold tracking-tight">
                  ₹{fmt(finalTotal)}
                </p>
                {totalDiscount > 0 && (
                  <p className="relative mt-0.5 text-[11px] opacity-85">
                    You saved ₹{fmt(round2(totalDiscount))}
                  </p>
                )}
              </div>

              {/* Payment modes — tap one or more (split), amount per selected mode */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    Payment Mode
                  </Label>
                  {paidNow < finalTotal && paidNow > 0 ? (
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                      Partial payment
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      Tap more than one to split
                    </span>
                  )}
                </div>

                {/* Side-by-side selector */}
                <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1">
                  {PAYMENT_MODES.map(({ value, label, icon: Icon }) => {
                    const active = selectedModes.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => togglePaymentMode(value)}
                        className={cn(
                          "relative flex h-10 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold transition-all duration-200 active:scale-[0.97]",
                          active
                            ? "bg-card text-primary shadow-sm ring-1 ring-primary/30"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {label}
                        {active && (
                          <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground animate-in zoom-in-50">
                            <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Amount for each selected mode */}
                <div className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                  {PAYMENT_MODES.filter(({ value }) =>
                    selectedModes.includes(value),
                  ).map(({ value, label, icon: Icon }) => (
                    <div
                      key={value}
                      className="flex items-center gap-2.5 px-2.5 py-2 animate-in fade-in slide-in-from-top-1"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="text-sm font-medium">{label}</p>
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
                          ref={(el) => (modeInputRefs.current[value] = el)}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          placeholder="0"
                          value={modeAmounts[value]}
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
                  ))}
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
                      key={p.mode}
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
                  <span className="text-muted-foreground">Due amount</span>
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
            {selectedModes.includes("UPI") && (
              <div className="mt-4 flex flex-col items-center rounded-2xl border border-border bg-card p-4 text-center md:mt-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <QrCode className="h-4 w-4 text-primary" />
                  Scan & Pay
                </div>
                {!upiId ? (
                  <div className="mt-3 w-full space-y-2 text-left">
                    <p className="text-center text-xs text-muted-foreground">
                      Add the store's UPI ID once to generate the QR
                    </p>
                    <Input
                      placeholder="store@okaxis"
                      value={upiDraft}
                      onChange={(e) => setUpiDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveUpiId()}
                      className="h-10 text-sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={saveUpiId}
                      className="h-9 w-full bg-gradient-primary hover:opacity-90"
                    >
                      Save UPI ID
                    </Button>
                  </div>
                ) : modeAmount("UPI") > 0 ? (
                  <>
                    <div className="mt-3 rounded-xl bg-white p-2.5 shadow-sm">
                      <QRCodeSVG value={upiLink} size={168} level="M" />
                    </div>
                    <p className="mt-3 font-display text-lg font-bold">
                      ₹{fmt(modeAmount("UPI"))}
                    </p>
                    <p className="max-w-full truncate text-[11px] text-muted-foreground">
                      {upiId}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setUpiDraft(upiId);
                        setUpiId("");
                      }}
                      className="mt-1 text-[11px] font-medium text-primary hover:underline"
                    >
                      Change UPI ID
                    </button>
                  </>
                ) : (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Enter the UPI amount to generate the QR
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          completedBill && (
            <div className="flex flex-col items-center py-2 text-center">
              <div
                className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10"
                style={{ animation: "ldr-pop .4s ease-out both" }}
              >
                <CheckCircle2 className="h-11 w-11 text-success" />
              </div>
              <p className="mt-4 font-display text-xl font-bold">
                ₹{fmt(completedBill.total)}
              </p>
              <p className="text-sm text-muted-foreground">
                Bill {completedBill.billNumber} saved & sent to printer
              </p>
              <div className="mt-5 w-full space-y-1.5 rounded-2xl bg-muted/50 p-3 text-left text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium">
                    {completedBill.customerName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Paid ({completedBill.paymentMode})
                  </span>
                  <span className="font-display font-semibold text-success">
                    ₹{fmt(completedBill.paid)}
                  </span>
                </div>
                {completedBill.due > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Due</span>
                    <span className="font-display font-semibold text-warning">
                      ₹{fmt(completedBill.due)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </ResponsiveModal>
    </div>
  );

  // Portalled to <body> so the POS covers the app's side menu / header completely
  return createPortal(
    <>
      <LoaderStyles />
      {page}
      <FullScreenLoader
        active={booting}
        label="Opening POS"
        sublabel="Loading products & customer data"
      />
      <ProcessingOverlay
        active={processing.active}
        steps={BILL_STEPS}
        current={processing.current}
        title="Saving bill"
      />
    </>,
    document.body,
  );
};

export default POS;
