import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  addMonths,
  format,
  getDaysInMonth,
  isAfter,
  isBefore,
  isSameDay,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import axios from "axios";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Inbox,
  Landmark,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Smartphone,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DatePicker } from "./Datepicker";
import { SearchableOption, SearchableSelect } from "./Searchableselect";
import {
  LoaderStyles,
  LoadingOverlay,
  TableSkeleton,
  TopProgressBar,
} from "./../components/Loader";

const API_URL =
  import.meta.env.VITE_API_URL || "https://sunshineproduct.in/POS/v1_api/";
const PAY_API = `${API_URL}purchase_payment.php`;

/** Save loader stays on screen at least this long */
const MIN_SAVE_LOADER_MS = 2000;

const getUserProfile = () => {
  try {
    return JSON.parse(localStorage.getItem("company_data") || "{}");
  } catch {
    return {};
  }
};

const getFinancialYear = () => {
  try {
    const raw = localStorage.getItem("financial_year");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Types ----------

interface VendorOption {
  id: string;
  name: string;
  mobile: string;
  outstanding: number; // tbl_vendor.vendor_wallet
}

interface AccountOption {
  id: string;
  name: string;
  type: string;
  number: string;
  balance: number; // tbl_account.account_balance
}

interface LedgerEntry {
  id: number;
  date: string;
  kind: "credit" | "debit"; // 1 = credit (purchase), 2 = debit (payment)
  amount: number;
  balance: number; // tbl_transaction.transaction_balance (outstanding after this entry)
  remark: string;
  account: string;
  accountId: string;
  purchaseId: string; // "" when not against a bill
  transferType: number;
  txnNumber: string;
  billNo: string;
  isPayment: boolean; // only payments can be edited / deleted from here
}

interface Bill {
  id: string;
  billNo: string;
  date: string;
  grand: number;
  returned: number;
  paid: number;
  pending: number;
  status: "paid" | "partial" | "unpaid";
}

interface Allocation {
  bill: Bill;
  amount: number;
}

type TransferType = "1" | "2" | "3";
type MobileTab = "pay" | "history" | "bills";
type ListTab = "history" | "bills";
type Errors = Record<string, string>;

interface EditForm {
  accountId: string;
  transferType: TransferType | "";
  amount: string;
  txnNumber: string;
  date: string;
  remark: string;
}

const EMPTY_EDIT: EditForm = {
  accountId: "",
  transferType: "",
  amount: "",
  txnNumber: "",
  date: "",
  remark: "",
};

const TRANSFER_TYPES: {
  value: TransferType;
  label: string;
  icon: typeof Landmark;
  refHint: string;
}[] = [
  {
    value: "1",
    label: "Bank",
    icon: Landmark,
    refHint: "Cheque / NEFT / RTGS ref. no.",
  },
  {
    value: "2",
    label: "Cash",
    icon: Banknote,
    refHint: "Receipt no. (optional)",
  },
  { value: "3", label: "UPI", icon: Smartphone, refHint: "UPI ref. / UTR no." },
];

const transferLabel = (t: number) =>
  TRANSFER_TYPES.find((x) => Number(x.value) === t)?.label ?? "";

const toTransferType = (t: number): TransferType | "" =>
  t === 1 || t === 2 || t === 3 ? (String(t) as TransferType) : "";

/** Cash account → Cash, every other account → Bank */
const isCashAccount = (a: AccountOption) =>
  /cash/i.test(a.name) || /cash/i.test(a.type);

const BILL_STATUS: Record<
  Bill["status"],
  { label: string; className: string }
> = {
  paid: {
    label: "Paid",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  partial: {
    label: "Partly paid",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  unpaid: {
    label: "Unpaid",
    className: "bg-destructive/10 text-destructive",
  },
};

const PAGE = 20;

// ---------- Helpers ----------

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Keeps only digits and a single decimal point (max 2 decimals) */
const decimal = (v: string) =>
  v
    .replace(/[^\d.]/g, "")
    .replace(/(\..*)\./g, "$1")
    .replace(/(\.\d{2})\d+$/, "$1");

const round2 = (n: number) => Math.round(n * 100) / 100;

const inr = (n: number) =>
  `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Negative outstanding means we paid the vendor in advance */
const dueText = (n: number) => (n < 0 ? `${inr(-n)} advance` : inr(n));

/** "2026-08-12 00:00:00" → "12-08-2026" */
const prettyDate = (d: string) => {
  const s = String(d || "").slice(0, 10);
  const [y, m, dd] = s.split("-");
  return y && m && dd ? `${dd}-${m}-${y}` : s;
};

const ymd = (d: string) => String(d || "").slice(0, 10);

/** "2026-08-12" → Date (local), or null */
const parseYmd = (s: string) => {
  const [y, m, d] = ymd(s).split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
};

const amountText = (n: number) => String(round2(n));

const apiError = (err: any, fallback: string) =>
  err?.response?.data?.message || err?.message || fallback;

const scrollToFirstError = () =>
  requestAnimationFrame(() =>
    document
      .querySelector('[aria-invalid="true"]')
      ?.scrollIntoView({ behavior: "smooth", block: "center" }),
  );

/** Oldest bill first, same order the server uses to split the amount */
const byOldest = (a: Bill, b: Bill) =>
  String(a.date).localeCompare(String(b.date)) || Number(a.id) - Number(b.id);

const toLedger = (t: any): LedgerEntry => ({
  id: Number(t.transaction_id),
  date: t.transaction_date,
  kind: String(t.transaction_type) === "2" ? "debit" : "credit",
  amount: Number(t.transaction_amount) || 0,
  balance: Number(t.transaction_balance) || 0,
  remark: t.transaction_remark || "",
  account: t.account_name || "",
  accountId:
    Number(t.transaction_account_id) > 0
      ? String(t.transaction_account_id)
      : "",
  purchaseId:
    Number(t.transaction_purches_id) > 0
      ? String(t.transaction_purches_id)
      : "",
  transferType: Number(t.transaction_transfer_type) || 0,
  txnNumber: t.transaction_number || "",
  billNo: t.purchess_bill_number || "",
  isPayment: String(t.is_payment) === "1",
});

const toBill = (b: any): Bill => ({
  id: String(b.purchess_id),
  billNo: b.purchess_bill_number || `#${b.purchess_id}`,
  date: b.purchess_date,
  grand: Number(b.grand) || 0,
  returned: Number(b.returned) || 0,
  paid: Number(b.paid) || 0,
  pending: Number(b.pending) || 0,
  status: b.status === "paid" || b.status === "partial" ? b.status : "unpaid",
});

/** true below the md breakpoint (768px) */
const useIsMobile = (breakpoint = 768) => {
  const query = `(max-width: ${breakpoint - 1}px)`;
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return isMobile;
};

// ---------- Component ----------

const PurchasePayment = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();

  // Optional deep link: /purchase-payments?vendor=12&bill=105
  const billParam = searchParams.get("bill") || "";

  // ----- Form -----
  const [vendorId, setVendorId] = useState(searchParams.get("vendor") || "");
  const [accountId, setAccountId] = useState("");
  const [transferType, setTransferType] = useState<TransferType | "">("");
  const [amount, setAmount] = useState("");
  const [txnNumber, setTxnNumber] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [remark, setRemark] = useState("");
  const [billIds, setBillIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  // ----- Data -----
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loadingVendorData, setLoadingVendorData] = useState(false);
  const [vendorDataError, setVendorDataError] = useState("");

  // ----- UI -----
  const [mobileTab, setMobileTab] = useState<MobileTab>("pay");
  const [listTab, setListTab] = useState<ListTab>("history");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [billSheetOpen, setBillSheetOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LedgerEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ----- Edit payment -----
  const [editTarget, setEditTarget] = useState<LedgerEntry | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT);
  const [editErrors, setEditErrors] = useState<Errors>({});
  const [editSaving, setEditSaving] = useState(false);

  const reqRef = useRef(0);
  const formRef = useRef<HTMLDivElement>(null);
  const billParamUsed = useRef(false);

  // ---------- Data loading ----------

  const loadVendors = useCallback(async () => {
    setLoadingVendors(true);
    try {
      const u = getUserProfile();
      const res = await axios.post(`${API_URL}vendor.php`, {
        type: 2,
        company_id: u.company_id,
        franchise_id: u.franchise_id,
      });
      if (res.data.status === "success") {
        setVendors(
          (res.data.data || []).map((v: any) => ({
            id: String(v.vendor_id),
            name: v.vendor_name,
            mobile: v.vendor_mobile_no || "",
            outstanding: Number(v.vendor_wallet) || 0,
          })),
        );
      } else {
        toast.error(res.data.message || "Couldn't load vendors");
      }
    } catch (err) {
      console.error("Error loading vendors:", err);
      toast.error(apiError(err, "Couldn't load vendors. Reload the page."));
    } finally {
      setLoadingVendors(false);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const u = getUserProfile();
      const res = await axios.post(PAY_API, {
        type: 5,
        company_id: u.company_id,
        franchise_id: u.franchise_id,
      });
      if (res.data.status === "success") {
        setAccounts(
          (res.data.data || []).map((a: any) => ({
            id: String(a.account_id),
            name: a.account_name,
            type: String(a.account_type ?? ""),
            number: a.account_number || "",
            balance: Number(a.account_balance) || 0,
          })),
        );
      } else {
        toast.error(res.data.message || "Couldn't load accounts");
      }
    } catch (err) {
      console.error("Error loading accounts:", err);
      toast.error(apiError(err, "Couldn't load accounts. Reload the page."));
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  /** Ledger + bills of one vendor. Ignores late responses of an old vendor. */
  const loadVendorData = useCallback(async (vid: string) => {
    const req = ++reqRef.current;
    if (!vid) {
      setLedger([]);
      setBills([]);
      setVendorDataError("");
      setLoadingVendorData(false);
      return;
    }
    setLoadingVendorData(true);
    setVendorDataError("");
    try {
      const u = getUserProfile();
      const base = {
        company_id: u.company_id,
        franchise_id: u.franchise_id,
        vendor_id: Number(vid),
      };
      const [l, b] = await Promise.all([
        axios.post(PAY_API, { ...base, type: 2 }),
        axios.post(PAY_API, { ...base, type: 3 }),
      ]);
      if (req !== reqRef.current) return;
      if (l.data.status !== "success")
        throw new Error(l.data.message || "Couldn't load transactions");
      if (b.data.status !== "success")
        throw new Error(b.data.message || "Couldn't load bills");

      const freshBills: Bill[] = (b.data.data || []).map(toBill);
      setLedger((l.data.data || []).map(toLedger));
      setBills(freshBills);
      // Drop selected bills that are no longer pending
      setBillIds((ids) =>
        ids.filter((id) =>
          freshBills.some((x) => x.id === id && x.pending > 0),
        ),
      );

      // Keep the dropdown outstanding in sync with the server
      const fresh = Number(l.data.vendor_outstanding);
      if (Number.isFinite(fresh)) {
        setVendors((vs) =>
          vs.map((v) => (v.id === vid ? { ...v, outstanding: fresh } : v)),
        );
      }
    } catch (err) {
      if (req !== reqRef.current) return;
      console.error("Error loading vendor data:", err);
      setLedger([]);
      setBills([]);
      setVendorDataError(apiError(err, "Couldn't load this vendor's details"));
    } finally {
      if (req === reqRef.current) setLoadingVendorData(false);
    }
  }, []);

  useEffect(() => {
    loadVendors();
    loadAccounts();
  }, [loadVendors, loadAccounts]);

  useEffect(() => {
    loadVendorData(vendorId);
    setSearch("");
    setVisible(PAGE);
  }, [vendorId, loadVendorData]);

  // Deep link ?bill= : preselect that bill once its list is loaded
  useEffect(() => {
    if (billParamUsed.current || !billParam || !bills.length) return;
    billParamUsed.current = true;
    const b = bills.find((x) => x.id === billParam);
    if (b && b.pending > 0) {
      setBillIds([b.id]);
      setAmount(amountText(b.pending));
    }
  }, [bills, billParam]);

  // Close the delete dialog with Escape
  useEffect(() => {
    if (!deleteTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleting) setDeleteTarget(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteTarget, deleting]);

  // Close the desktop edit dialog with Escape (mobile sheet handles its own)
  useEffect(() => {
    if (!editOpen || isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editSaving) setEditOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [editOpen, editSaving, isMobile]);

  // ---------- Error helpers ----------

  const clearErrors = (keys: string[]) =>
    setErrors((prev) => {
      if (!keys.some((k) => prev[k])) return prev;
      const next = { ...prev };
      keys.forEach((k) => delete next[k]);
      return next;
    });

  // ---------- Derived ----------

  const selectedVendor = vendors.find((v) => v.id === vendorId);
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const selectedTransfer = TRANSFER_TYPES.find((t) => t.value === transferType);

  const openBills = useMemo(() => bills.filter((b) => b.pending > 0), [bills]);
  const selectedBills = useMemo(
    () => bills.filter((b) => billIds.includes(b.id)).sort(byOldest),
    [bills, billIds],
  );
  const selectedPending = round2(
    selectedBills.reduce((s, b) => s + b.pending, 0),
  );
  const allOpenSelected =
    openBills.length > 0 && openBills.every((b) => billIds.includes(b.id));

  const amt = round2(num(amount));
  const outstandingAfter = selectedVendor
    ? round2(selectedVendor.outstanding - amt)
    : 0;
  const accountAfter = selectedAccount
    ? round2(selectedAccount.balance - amt)
    : 0;

  const overOutstanding =
    !!selectedVendor && amt > 0 && amt > selectedVendor.outstanding + 0.001;
  const overAccount =
    !!selectedAccount && amt > 0 && amt > selectedAccount.balance + 0.001;
  const overBills = billIds.length > 0 && amt > selectedPending + 0.001;

  /** How the amount will be split over the selected bills (oldest first) */
  const allocation: Allocation[] = useMemo(() => {
    let left = amt;
    return selectedBills.map((bill) => {
      const part = round2(Math.max(0, Math.min(left, bill.pending)));
      left = round2(left - part);
      return { bill, amount: part };
    });
  }, [selectedBills, amt]);

  const vendorOptions: SearchableOption[] = useMemo(
    () =>
      vendors.map((v) => ({
        value: v.id,
        label: v.name,
        hint: [v.mobile, `Outstanding ${dueText(v.outstanding)}`]
          .filter(Boolean)
          .join(", "),
      })),
    [vendors],
  );

  const accountOptions: SearchableOption[] = useMemo(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: a.name,
        hint: [a.number ? `A/c ${a.number}` : "", `Balance ${inr(a.balance)}`]
          .filter(Boolean)
          .join(", "),
      })),
    [accounts],
  );

  const q = search.trim().toLowerCase();

  const filteredLedger = useMemo(
    () =>
      !q
        ? ledger
        : ledger.filter((t) =>
            [
              t.id,
              prettyDate(t.date),
              t.account,
              t.remark,
              t.txnNumber,
              t.billNo,
              transferLabel(t.transferType),
            ]
              .join(" ")
              .toLowerCase()
              .includes(q),
          ),
    [ledger, q],
  );

  const filteredBills = useMemo(
    () =>
      !q
        ? bills
        : bills.filter((b) =>
            [b.billNo, prettyDate(b.date), BILL_STATUS[b.status].label]
              .join(" ")
              .toLowerCase()
              .includes(q),
          ),
    [bills, q],
  );

  const ledgerTotals = useMemo(
    () =>
      ledger.reduce(
        (s, t) => {
          if (t.kind === "credit") s.credit += t.amount;
          else s.debit += t.amount;
          return s;
        },
        { credit: 0, debit: 0 },
      ),
    [ledger],
  );

  const pendingTotal = openBills.reduce((s, b) => s + b.pending, 0);

  // ----- Edit derived -----

  const editAmt = round2(num(editForm.amount));
  const editAccount = accounts.find((a) => a.id === editForm.accountId);
  const editBill = editTarget?.purchaseId
    ? bills.find((b) => b.id === editTarget.purchaseId)
    : undefined;
  /** Bill's pending + what this payment already covers */
  const editMax =
    editTarget && editBill
      ? round2(editBill.pending + editTarget.amount)
      : null;
  const editDelta = editTarget ? round2(editAmt - editTarget.amount) : 0;
  const editOutstandingAfter = selectedVendor
    ? round2(selectedVendor.outstanding - editDelta)
    : 0;
  const editSameAccount =
    !!editTarget && editForm.accountId === editTarget.accountId;
  const editAccountAfter = editAccount
    ? round2(editAccount.balance - (editSameAccount ? editDelta : editAmt))
    : 0;
  const editOverBill = editMax !== null && editAmt > editMax + 0.001;
  const editOverAccount =
    !!editAccount && editAmt > 0 && editAccountAfter < -0.001;
  const editChanged =
    !!editTarget &&
    (editAmt !== round2(editTarget.amount) ||
      !editSameAccount ||
      editForm.transferType !== toTransferType(editTarget.transferType) ||
      editForm.txnNumber.trim() !== editTarget.txnNumber ||
      editForm.date !== ymd(editTarget.date) ||
      editForm.remark.trim() !== editTarget.remark);

  // ---------- Actions ----------

  const changeVendor = (v: string) => {
    if (v === vendorId) return;
    setVendorId(v);
    setBillIds([]);
    clearErrors(["vendor", "amount"]);
  };

  /** Cash account → Cash, any other account → Bank (user can still pick UPI) */
  const changeAccount = (v: string) => {
    setAccountId(v);
    const a = accounts.find((x) => x.id === v);
    if (a) setTransferType(isCashAccount(a) ? "2" : "1");
    clearErrors(["account", "transferType"]);
  };

  /** Sets the selected bills and fills the amount with their pending total */
  const applyBills = (ids: string[]) => {
    setBillIds(ids);
    if (ids.length) {
      const total = bills
        .filter((b) => ids.includes(b.id))
        .reduce((s, b) => s + b.pending, 0);
      setAmount(amountText(total));
    }
    clearErrors(["amount"]);
  };

  const toggleBill = (id: string) =>
    applyBills(
      billIds.includes(id) ? billIds.filter((x) => x !== id) : [...billIds, id],
    );

  const toggleAllBills = () =>
    applyBills(allOpenSelected ? [] : openBills.map((b) => b.id));

  const goToForm = () => {
    if (isMobile) {
      setMobileTab("pay");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const resetForm = () => {
    setAmount("");
    setTxnNumber("");
    setRemark("");
    setBillIds([]);
    setErrors({});
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!vendorId) e.vendor = "Select a vendor";
    if (!accountId) e.account = "Select the account you are paying from";
    if (!transferType) e.transferType = "Select Bank, Cash or UPI";
    if (amt <= 0) e.amount = "Enter the amount to pay";
    else if (overBills)
      e.amount =
        selectedBills.length === 1
          ? `Bill ${selectedBills[0].billNo} has only ${inr(selectedPending)} pending`
          : `The selected bills have only ${inr(selectedPending)} pending`;
    if (!date) e.date = "Select the transaction date";
    return e;
  };

  /** Updates vendor + account balances in the dropdowns from a server response */
  const applyBalances = (data: any) => {
    const vBal = Number(data?.vendor_outstanding);
    if (Number.isFinite(vBal)) {
      setVendors((vs) =>
        vs.map((v) => (v.id === vendorId ? { ...v, outstanding: vBal } : v)),
      );
    }
    const updates: Record<string, number> = {};
    const aId = String(data?.account_id ?? "");
    const aBal = Number(data?.account_balance);
    if (aId && Number.isFinite(aBal)) updates[aId] = aBal;
    const oId = String(data?.old_account_id ?? "");
    const oBal = Number(data?.old_account_balance);
    if (oId && oId !== "null" && Number.isFinite(oBal)) updates[oId] = oBal;
    if (Object.keys(updates).length) {
      setAccounts((as) =>
        as.map((a) => (a.id in updates ? { ...a, balance: updates[a.id] } : a)),
      );
    }
    return Number.isFinite(vBal) ? vBal : null;
  };

  const save = async () => {
    if (saving) return;

    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(Object.values(e)[0]);
      if (isMobile) setMobileTab("pay");
      scrollToFirstError();
      return;
    }

    const fy = getFinancialYear();
    if (!fy?.key) {
      toast.error("Financial year not set. Please sign in again.");
      return;
    }

    setSaving(true);
    const started = Date.now();
    try {
      const u = getUserProfile();
      let res: any = null;
      let failure: unknown = null;
      try {
        res = await axios.post(PAY_API, {
          type: 1,
          company_id: u.company_id,
          franchise_id: u.franchise_id,
          financial_year_id: fy.key,
          employee_id: u.employee_id ?? u.user_id ?? 0,
          vendor_id: Number(vendorId),
          account_id: Number(accountId),
          purchase_ids: billIds.map(Number),
          transfer_type: Number(transferType),
          amount: amt,
          transaction_number: txnNumber.trim(),
          transaction_date: date,
          remark: remark.trim(),
        });
      } catch (err) {
        failure = err;
      }

      // Keep the loader on screen for at least 2 seconds
      const left = MIN_SAVE_LOADER_MS - (Date.now() - started);
      if (left > 0) await wait(left);

      if (failure) {
        console.error("Error saving payment:", failure);
        toast.error(apiError(failure, "Couldn't save the payment. Try again."));
        return;
      }
      if (res?.data?.status !== "success") {
        toast.error(res?.data?.message || "Couldn't save the payment");
        return;
      }

      const vBal = applyBalances(res.data);
      const billCount = (res.data.allocations || []).filter(
        (a: any) => a.purchase_id,
      ).length;

      toast.success("Payment saved", {
        description: [
          billCount > 1 ? `Split across ${billCount} bills.` : "",
          vBal !== null
            ? `${selectedVendor?.name ?? "Vendor"} outstanding is now ${dueText(vBal)}`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
      resetForm();
      loadVendorData(vendorId);
      if (isMobile) setMobileTab("history");
      else setListTab("history");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const u = getUserProfile();
      const res = await axios.post(PAY_API, {
        type: 4,
        company_id: u.company_id,
        franchise_id: u.franchise_id,
        employee_id: u.employee_id ?? u.user_id ?? 0,
        transaction_id: deleteTarget.id,
      });
      if (res.data.status === "success") {
        applyBalances(res.data);
        toast.success("Payment deleted", {
          description: `${inr(deleteTarget.amount)} added back to the outstanding`,
        });
        setDeleteTarget(null);
        loadVendorData(vendorId);
      } else {
        toast.error(res.data.message || "Couldn't delete the payment");
      }
    } catch (err) {
      console.error("Error deleting payment:", err);
      toast.error(apiError(err, "Couldn't delete the payment. Try again."));
    } finally {
      setDeleting(false);
    }
  };

  // ----- Edit -----

  const openEdit = (t: LedgerEntry) => {
    setEditTarget(t);
    setEditForm({
      accountId: t.accountId,
      transferType: toTransferType(t.transferType),
      amount: amountText(t.amount),
      txnNumber: t.txnNumber,
      date: ymd(t.date),
      remark: t.remark,
    });
    setEditErrors({});
    setEditOpen(true);
  };

  const closeEdit = () => {
    if (!editSaving) setEditOpen(false);
  };

  const patchEdit = (patch: Partial<EditForm>, clear: string[] = []) => {
    setEditForm((f) => ({ ...f, ...patch }));
    if (clear.length)
      setEditErrors((prev) => {
        if (!clear.some((k) => prev[k])) return prev;
        const next = { ...prev };
        clear.forEach((k) => delete next[k]);
        return next;
      });
  };

  const changeEditAccount = (v: string) => {
    const a = accounts.find((x) => x.id === v);
    patchEdit(
      {
        accountId: v,
        ...(a ? { transferType: isCashAccount(a) ? "2" : "1" } : {}),
      } as Partial<EditForm>,
      ["account", "transferType"],
    );
  };

  const validateEdit = (): Errors => {
    const e: Errors = {};
    if (!editForm.accountId) e.account = "Select the account you paid from";
    if (!editForm.transferType) e.transferType = "Select Bank, Cash or UPI";
    if (editAmt <= 0) e.amount = "Enter the amount";
    else if (editOverBill && editMax !== null)
      e.amount = `Bill ${editTarget?.billNo} allows at most ${inr(editMax)} for this payment`;
    if (!editForm.date) e.date = "Select the transaction date";
    return e;
  };

  const saveEdit = async () => {
    if (!editTarget || editSaving) return;

    const e = validateEdit();
    setEditErrors(e);
    if (Object.keys(e).length) {
      toast.error(Object.values(e)[0]);
      return;
    }
    if (!editChanged) {
      toast.info("Nothing changed");
      setEditOpen(false);
      return;
    }

    setEditSaving(true);
    const started = Date.now();
    try {
      const u = getUserProfile();
      let res: any = null;
      let failure: unknown = null;
      try {
        res = await axios.post(PAY_API, {
          type: 6,
          company_id: u.company_id,
          franchise_id: u.franchise_id,
          employee_id: u.employee_id ?? u.user_id ?? 0,
          transaction_id: editTarget.id,
          account_id: Number(editForm.accountId),
          transfer_type: Number(editForm.transferType),
          amount: editAmt,
          transaction_number: editForm.txnNumber.trim(),
          transaction_date: editForm.date,
          remark: editForm.remark.trim(),
        });
      } catch (err) {
        failure = err;
      }

      const left = MIN_SAVE_LOADER_MS - (Date.now() - started);
      if (left > 0) await wait(left);

      if (failure) {
        console.error("Error updating payment:", failure);
        toast.error(
          apiError(failure, "Couldn't update the payment. Try again."),
        );
        return;
      }
      if (res?.data?.status !== "success") {
        toast.error(res?.data?.message || "Couldn't update the payment");
        return;
      }

      const vBal = applyBalances(res.data);
      toast.success("Payment updated", {
        description:
          vBal !== null
            ? `${selectedVendor?.name ?? "Vendor"} outstanding is now ${dueText(vBal)}`
            : undefined,
      });
      setEditOpen(false);
      loadVendorData(vendorId);
    } finally {
      setEditSaving(false);
    }
  };

  const refresh = () => {
    loadVendorData(vendorId);
    loadAccounts();
  };

  // Bigger touch targets + 16px text (stops iOS zoom on focus)
  const touch = isMobile ? "h-11 text-base" : "";
  const saveText = saving ? "Saving…" : "Save Payment";

  // ---------- Form sections ----------

  const vendorField = (
    <Field label="Vendor" htmlFor="pay-vendor" required error={errors.vendor}>
      {isMobile ? (
        <SheetSelect
          id="pay-vendor"
          title="Select vendor"
          value={vendorId}
          onChange={changeVendor}
          options={vendorOptions}
          placeholder="Select vendor"
          searchPlaceholder="Search by name or mobile"
          emptyText="No vendor found"
          invalid={!!errors.vendor}
          loading={loadingVendors}
        />
      ) : (
        <SearchableSelect
          id="pay-vendor"
          value={vendorId}
          onChange={changeVendor}
          options={vendorOptions}
          placeholder={loadingVendors ? "Loading vendors…" : "Select vendor"}
          searchPlaceholder="Search by name or mobile"
          emptyText="No vendor found"
          invalid={!!errors.vendor}
          loading={loadingVendors}
        />
      )}
    </Field>
  );

  /** Outstanding now → after this payment. The one bold element of the page. */
  const balancePanel = selectedVendor ? (
    <div
      key={selectedVendor.id}
      className="overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.04] animate-in fade-in-0 zoom-in-[0.98] duration-300"
    >
      <div className="flex items-center gap-2 border-b border-primary/10 px-4 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserRound className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {selectedVendor.name}
          </p>
          {selectedVendor.mobile && (
            <p className="text-[11px] text-muted-foreground">
              {selectedVendor.mobile}
            </p>
          )}
        </div>
        {loadingVendorData && (
          <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="grid grid-cols-2 divide-x divide-primary/10">
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground">Outstanding now</p>
          <p className="mt-0.5 font-display text-xl font-bold tabular-nums">
            {dueText(selectedVendor.outstanding)}
          </p>
        </div>
        <div
          className={cn(
            "px-4 py-3 transition-colors duration-300",
            amt > 0 &&
              (overOutstanding ? "bg-amber-500/10" : "bg-emerald-500/10"),
          )}
        >
          <p className="text-xs text-muted-foreground">After this payment</p>
          <p
            className={cn(
              "mt-0.5 font-display text-xl font-bold tabular-nums transition-colors",
              amt <= 0 && "text-muted-foreground/60",
              amt > 0 &&
                !overOutstanding &&
                "text-emerald-700 dark:text-emerald-400",
              overOutstanding && "text-amber-700 dark:text-amber-400",
            )}
          >
            {amt > 0 ? dueText(outstandingAfter) : "Enter amount"}
          </p>
        </div>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
      <UserRound className="h-5 w-5 shrink-0" />
      Select a vendor to see their outstanding, bills and payments.
    </div>
  );

  /** Checkbox list of pending bills (desktop inline, mobile in a sheet) */
  const billChecklist = (
    <div className="divide-y divide-border">
      {openBills.map((b) => {
        const on = billIds.includes(b.id);
        return (
          <button
            key={b.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => toggleBill(b.id)}
            className={cn(
              "flex w-full touch-manipulation items-center gap-3 px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              isMobile ? "py-3.5" : "py-2.5",
              on ? "bg-primary/[0.06]" : "hover:bg-muted/50 active:bg-muted/60",
            )}
          >
            <CheckBox on={on} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{b.billNo}</p>
              <p className="text-[11px] text-muted-foreground">
                {prettyDate(b.date)}
                {b.paid > 0 && `, paid ${inr(b.paid)} of ${inr(b.grand)}`}
              </p>
            </div>
            <p className="font-display text-sm font-bold tabular-nums">
              {inr(b.pending)}
            </p>
          </button>
        );
      })}
    </div>
  );

  const billFieldBody = !vendorId ? (
    <p className="px-3 py-3 text-xs text-muted-foreground">
      Select a vendor first.
    </p>
  ) : loadingVendorData && !bills.length ? (
    <p className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading bills…
    </p>
  ) : !openBills.length ? (
    <p className="px-3 py-3 text-xs text-muted-foreground">
      No pending bills. The payment will be saved on account.
    </p>
  ) : (
    billChecklist
  );

  const billField = (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">
          Against bills{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        {!isMobile && openBills.length > 1 && (
          <button
            type="button"
            onClick={toggleAllBills}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {allOpenSelected ? "Clear all" : "Select all"}
          </button>
        )}
      </div>

      {isMobile ? (
        <button
          type="button"
          onClick={() => setBillSheetOpen(true)}
          disabled={!vendorId}
          aria-haspopup="dialog"
          className="mt-1 flex h-11 w-full touch-manipulation items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-base disabled:opacity-60"
        >
          <span
            className={cn(
              "truncate",
              !billIds.length && "text-muted-foreground",
            )}
          >
            {!vendorId
              ? "Select a vendor first"
              : billIds.length
                ? `${billIds.length} ${billIds.length === 1 ? "bill" : "bills"} selected, ${inr(selectedPending)}`
                : openBills.length
                  ? "On account (no specific bill)"
                  : "No pending bills"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <div className="mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-border">
          {billFieldBody}
        </div>
      )}

      {billIds.length > 0 && (
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {billIds.length} selected, pending{" "}
            <span className="font-semibold text-foreground">
              {inr(selectedPending)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => applyBills([])}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        </div>
      )}
    </div>
  );

  const payFields = (
    <div className="space-y-4">
      {/* Account */}
      <Field
        label="Pay from account"
        htmlFor="pay-account"
        required
        error={errors.account}
      >
        {isMobile ? (
          <SheetSelect
            id="pay-account"
            title="Pay from account"
            value={accountId}
            onChange={changeAccount}
            options={accountOptions}
            placeholder="Select account"
            searchPlaceholder="Search account"
            emptyText="No account found"
            invalid={!!errors.account}
            loading={loadingAccounts}
          />
        ) : (
          <SearchableSelect
            id="pay-account"
            value={accountId}
            onChange={changeAccount}
            options={accountOptions}
            placeholder={
              loadingAccounts ? "Loading accounts…" : "Select account"
            }
            searchPlaceholder="Search account"
            emptyText="No account found"
            invalid={!!errors.account}
            loading={loadingAccounts}
          />
        )}
        {selectedAccount && !errors.account && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Balance {inr(selectedAccount.balance)}
            {amt > 0 && (
              <>
                , after payment{" "}
                <span
                  className={cn(
                    "font-semibold",
                    overAccount
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-foreground",
                  )}
                >
                  {inr(accountAfter)}
                </span>
              </>
            )}
          </p>
        )}
      </Field>

      {/* Transfer type (auto-set from the account, can be changed) */}
      <TransferTypePicker
        value={transferType}
        onChange={(v) => {
          setTransferType(v);
          clearErrors(["transferType"]);
        }}
        error={errors.transferType}
        large={isMobile}
      />

      {/* Against bills (optional, multiple) */}
      {billField}

      {/* Amount */}
      <Field label="Amount" htmlFor="pay-amount" required error={errors.amount}>
        <AmountInput
          id="pay-amount"
          value={amount}
          onChange={(v) => {
            setAmount(v);
            clearErrors(["amount"]);
          }}
          invalid={!!errors.amount}
          large={isMobile}
        />

        {(billIds.length > 0 ||
          (selectedVendor && selectedVendor.outstanding > 0)) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selectedVendor && selectedVendor.outstanding > 0 && (
              <QuickChip
                onClick={() => {
                  setAmount(amountText(selectedVendor.outstanding));
                  clearErrors(["amount"]);
                }}
              >
                Full outstanding {inr(selectedVendor.outstanding)}
              </QuickChip>
            )}
            {billIds.length > 0 && (
              <QuickChip
                onClick={() => {
                  setAmount(amountText(selectedPending));
                  clearErrors(["amount"]);
                }}
              >
                {billIds.length === 1 ? "Bill pending" : "Selected bills"}{" "}
                {inr(selectedPending)}
              </QuickChip>
            )}
          </div>
        )}

        {/* Split preview: oldest bill is paid first */}
        {billIds.length > 0 && amt > 0 && !overBills && (
          <div className="mt-2 overflow-hidden rounded-lg border border-border">
            <p className="bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground">
              {billIds.length > 1
                ? "Amount is applied to the oldest bill first"
                : "Applied to this bill"}
            </p>
            {allocation.map(({ bill, amount: part }) => (
              <div
                key={bill.id}
                className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-xs"
              >
                <span className="truncate font-medium">{bill.billNo}</span>
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      part >= bill.pending
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : part > 0
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {part >= bill.pending
                      ? "Full"
                      : part > 0
                        ? "Part"
                        : "Not covered"}
                  </span>
                  <span className="font-display font-semibold tabular-nums">
                    {inr(part)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2 space-y-1.5">
          {overOutstanding && selectedVendor && (
            <Notice>
              You are paying{" "}
              {inr(amt - Math.max(selectedVendor.outstanding, 0))} more than the
              outstanding of {dueText(selectedVendor.outstanding)}. The extra
              amount will stay with the vendor as advance.
            </Notice>
          )}
          {overAccount && selectedAccount && (
            <Notice>
              {selectedAccount.name} has only {inr(selectedAccount.balance)}.
              Its balance will go to {inr(accountAfter)}.
            </Notice>
          )}
        </div>
      </Field>

      {/* Transaction number + date */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Transaction no." htmlFor="pay-number" optional>
          <Input
            id="pay-number"
            value={txnNumber}
            maxLength={100}
            onChange={(e) => setTxnNumber(e.target.value)}
            placeholder={selectedTransfer?.refHint ?? "Reference no."}
            className={touch}
          />
        </Field>
        <Field
          label="Transaction date"
          htmlFor="pay-date"
          required
          error={errors.date}
        >
          {isMobile ? (
            <SheetDatePicker
              id="pay-date"
              value={date}
              onChange={(v) => {
                setDate(v);
                clearErrors(["date"]);
              }}
              invalid={!!errors.date}
            />
          ) : (
            <DatePicker
              id="pay-date"
              value={date}
              onChange={(v) => {
                setDate(v);
                clearErrors(["date"]);
              }}
              disableFuture
              invalid={!!errors.date}
            />
          )}
        </Field>
      </div>

      {/* Remark */}
      <Field label="Remark" htmlFor="pay-remark" optional>
        <Textarea
          id="pay-remark"
          value={remark}
          maxLength={500}
          onChange={(e) => setRemark(e.target.value)}
          rows={isMobile ? 3 : 2}
          placeholder={
            selectedVendor
              ? `Leave empty to save "Payment to ${selectedVendor.name}${billIds.length ? " against bill …" : ""}"`
              : "Optional"
          }
          className={cn(isMobile && "text-base")}
        />
      </Field>
    </div>
  );

  // ---------- Edit form ----------

  const editTransfer = TRANSFER_TYPES.find(
    (t) => t.value === editForm.transferType,
  );

  const editSummary = editTarget ? (
    <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5 text-xs">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
        <ArrowUpRight className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">
          {editTarget.billNo
            ? `Against bill ${editTarget.billNo}`
            : "On account payment"}
        </p>
        <p className="text-muted-foreground">
          Saved as {inr(editTarget.amount)} on {prettyDate(editTarget.date)}
        </p>
      </div>
    </div>
  ) : null;

  const editAccountField = editTarget ? (
    <Field
      label="Paid from account"
      htmlFor="edit-account"
      required
      error={editErrors.account}
    >
      {isMobile ? (
        <SheetSelect
          id="edit-account"
          title="Paid from account"
          value={editForm.accountId}
          onChange={changeEditAccount}
          options={accountOptions}
          placeholder="Select account"
          searchPlaceholder="Search account"
          emptyText="No account found"
          invalid={!!editErrors.account}
          loading={loadingAccounts}
        />
      ) : (
        <SearchableSelect
          id="edit-account"
          value={editForm.accountId}
          onChange={changeEditAccount}
          options={accountOptions}
          placeholder={loadingAccounts ? "Loading accounts…" : "Select account"}
          searchPlaceholder="Search account"
          emptyText="No account found"
          invalid={!!editErrors.account}
          loading={loadingAccounts}
        />
      )}
      {/* Desktop shows the account effect in the side panel */}
      {isMobile && editAccount && !editErrors.account && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Balance {inr(editAccount.balance)}, after change{" "}
          <span
            className={cn(
              "font-semibold",
              editOverAccount
                ? "text-amber-700 dark:text-amber-400"
                : "text-foreground",
            )}
          >
            {inr(editAccountAfter)}
          </span>
          {!editSameAccount && editTarget.account && (
            <span className="block">
              {inr(editTarget.amount)} goes back to {editTarget.account}.
            </span>
          )}
        </p>
      )}
    </Field>
  ) : null;

  const editTransferField = (
    <TransferTypePicker
      value={editForm.transferType}
      onChange={(v) => patchEdit({ transferType: v }, ["transferType"])}
      error={editErrors.transferType}
      large={isMobile}
    />
  );

  const editAmountField = editTarget ? (
    <Field
      label="Amount"
      htmlFor="edit-amount"
      required
      error={editErrors.amount}
    >
      <AmountInput
        id="edit-amount"
        value={editForm.amount}
        onChange={(v) => patchEdit({ amount: v }, ["amount"])}
        invalid={!!editErrors.amount}
        large={isMobile}
      />
      {(editAmt !== round2(editTarget.amount) || editMax !== null) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {editAmt !== round2(editTarget.amount) && (
            <QuickChip
              onClick={() =>
                patchEdit({ amount: amountText(editTarget.amount) }, ["amount"])
              }
            >
              Original {inr(editTarget.amount)}
            </QuickChip>
          )}
          {editMax !== null && (
            <QuickChip
              onClick={() =>
                patchEdit({ amount: amountText(editMax) }, ["amount"])
              }
            >
              Bill max {inr(editMax)}
            </QuickChip>
          )}
        </div>
      )}
      {editOverBill && editMax !== null && !editErrors.amount && (
        <div className="mt-2">
          <Notice>
            Bill {editTarget.billNo} allows at most {inr(editMax)} for this
            payment.
          </Notice>
        </div>
      )}
    </Field>
  ) : null;

  const editRefDateFields = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Transaction no." htmlFor="edit-number" optional>
        <Input
          id="edit-number"
          value={editForm.txnNumber}
          maxLength={100}
          onChange={(e) => patchEdit({ txnNumber: e.target.value })}
          placeholder={editTransfer?.refHint ?? "Reference no."}
          className={touch}
        />
      </Field>
      <Field
        label="Transaction date"
        htmlFor="edit-date"
        required
        error={editErrors.date}
      >
        {isMobile ? (
          <SheetDatePicker
            id="edit-date"
            value={editForm.date}
            onChange={(v) => patchEdit({ date: v }, ["date"])}
            invalid={!!editErrors.date}
          />
        ) : (
          <DatePicker
            id="edit-date"
            value={editForm.date}
            onChange={(v) => patchEdit({ date: v }, ["date"])}
            disableFuture
            invalid={!!editErrors.date}
          />
        )}
      </Field>
    </div>
  );

  const editRemarkField = (
    <Field label="Remark" htmlFor="edit-remark" optional>
      <Textarea
        id="edit-remark"
        value={editForm.remark}
        maxLength={500}
        onChange={(e) => patchEdit({ remark: e.target.value })}
        rows={2}
        placeholder="Leave empty to use the automatic remark"
        className={cn("resize-none", isMobile && "text-base")}
      />
    </Field>
  );

  /** Mobile: everything stacked inside the bottom sheet (unchanged look) */
  const editFields = editTarget ? (
    <div className="space-y-4">
      {editSummary}
      {editAccountField}
      {editTransferField}
      {editAmountField}

      {selectedVendor && (
        <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-xl border border-border">
          <div className="px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">Outstanding now</p>
            <p className="font-display text-base font-bold tabular-nums">
              {dueText(selectedVendor.outstanding)}
            </p>
          </div>
          <div
            className={cn(
              "px-3 py-2.5 transition-colors",
              editDelta !== 0 && "bg-primary/[0.06]",
            )}
          >
            <p className="text-[11px] text-muted-foreground">
              After this change
            </p>
            <p
              className={cn(
                "font-display text-base font-bold tabular-nums",
                editDelta === 0 && "text-muted-foreground/70",
              )}
            >
              {editDelta === 0 ? "No change" : dueText(editOutstandingAfter)}
            </p>
          </div>
        </div>
      )}

      {editRefDateFields}
      {editRemarkField}
    </div>
  ) : null;

  const editActions = (
    <div className="grid grid-cols-2 gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={closeEdit}
        disabled={editSaving}
        className={cn("rounded-xl", isMobile ? "h-12 text-base" : "h-10")}
      >
        Cancel
      </Button>
      <Button
        type="button"
        onClick={saveEdit}
        disabled={editSaving || !editChanged}
        className={cn("rounded-xl", isMobile ? "h-12 text-base" : "h-10")}
      >
        {editSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {editSaving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );

  /**
   * Desktop edit dialog: wide, two columns, no scrolling.
   * Left = what changes (outstanding + account), right = the form.
   * Rendered in a portal so it also covers the app header.
   */
  const editDialog =
    !isMobile && editOpen && editTarget
      ? createPortal(
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-[2px] animate-in fade-in-0 duration-200 sm:items-center"
            onClick={closeEdit}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-title"
              onClick={(e) => e.stopPropagation()}
              className="grid w-full max-w-[920px] rounded-2xl bg-card shadow-2xl animate-in fade-in-0 zoom-in-[0.97] duration-200 md:grid-cols-[300px_minmax(0,1fr)]"
            >
              {/* Left: impact of the change */}
              <aside className="flex flex-col gap-4 rounded-t-2xl border-b border-border bg-primary/[0.05] p-5 md:rounded-l-2xl md:rounded-tr-none md:border-b-0 md:border-r">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Payment #{editTarget.id}
                  </p>
                  <h2
                    id="edit-title"
                    className="mt-0.5 font-display text-lg font-bold leading-tight"
                  >
                    Edit payment
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {editTarget.billNo
                      ? `Against bill ${editTarget.billNo}`
                      : "On account payment"}
                    , saved as {inr(editTarget.amount)} on{" "}
                    {prettyDate(editTarget.date)}
                  </p>
                </div>

                {selectedVendor && (
                  <div className="rounded-xl border border-primary/15 bg-card">
                    <div className="px-4 py-3">
                      <p className="text-[11px] text-muted-foreground">
                        {selectedVendor.name}, outstanding now
                      </p>
                      <p className="font-display text-lg font-bold tabular-nums">
                        {dueText(selectedVendor.outstanding)}
                      </p>
                    </div>
                    <div className="relative border-t border-dashed border-primary/20">
                      <span className="absolute -top-3 left-4 flex h-6 w-6 items-center justify-center rounded-full border border-primary/20 bg-card text-primary">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <div
                      className={cn(
                        "rounded-b-xl px-4 pb-3 pt-4 transition-colors duration-300",
                        editDelta !== 0 && "bg-primary/[0.06]",
                      )}
                    >
                      <p className="text-[11px] text-muted-foreground">
                        After this change
                      </p>
                      <p
                        className={cn(
                          "font-display text-2xl font-bold tabular-nums transition-colors",
                          editDelta === 0
                            ? "text-muted-foreground/60"
                            : "text-primary",
                        )}
                      >
                        {editDelta === 0
                          ? "No change"
                          : dueText(editOutstandingAfter)}
                      </p>
                      {editDelta !== 0 && (
                        <p className="mt-1 text-xs font-medium text-muted-foreground">
                          Paying {inr(Math.abs(editDelta))}{" "}
                          {editDelta > 0 ? "more" : "less"} than before
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {editAccount && (
                  <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs">
                    <p className="text-muted-foreground">{editAccount.name}</p>
                    <p className="mt-0.5 flex items-baseline gap-1.5 font-display tabular-nums">
                      <span className="text-sm text-muted-foreground">
                        {inr(editAccount.balance)}
                      </span>
                      <span className="text-muted-foreground">to</span>
                      <span
                        className={cn(
                          "text-base font-bold",
                          editOverAccount
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-foreground",
                        )}
                      >
                        {inr(editAccountAfter)}
                      </span>
                    </p>
                    {!editSameAccount && editTarget.account && (
                      <p className="mt-1 text-muted-foreground">
                        {inr(editTarget.amount)} goes back to{" "}
                        {editTarget.account}.
                      </p>
                    )}
                  </div>
                )}
              </aside>

              {/* Right: the form */}
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center justify-end px-5 pt-3">
                  <button
                    type="button"
                    onClick={closeEdit}
                    disabled={editSaving}
                    aria-label="Close"
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-4 px-5 pb-5">
                  {editAccountField}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {editTransferField}
                    {editAmountField}
                  </div>
                  {editRefDateFields}
                  {editRemarkField}
                </div>
                <div className="mt-auto flex items-center justify-end gap-2 rounded-br-2xl border-t border-border bg-muted/30 px-5 py-3">
                  <div className="w-full max-w-xs">{editActions}</div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  // ---------- List sections ----------

  const hasVendorData = ledger.length > 0 || bills.length > 0;

  const listState = (kind: ListTab): ReactNode | null => {
    if (!vendorId)
      return (
        <EmptyState
          icon={UserRound}
          title="Select a vendor"
          text={
            kind === "history"
              ? "Their purchases and payments will show here."
              : "Their bills with paid and pending amounts will show here."
          }
        />
      );
    if (loadingVendorData && !hasVendorData)
      return isMobile ? <CardSkeleton /> : <TableSkeleton />;
    if (vendorDataError)
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium">{vendorDataError}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refresh}
            className="gap-1.5"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        </div>
      );
    const all = kind === "history" ? ledger : bills;
    const shown = kind === "history" ? filteredLedger : filteredBills;
    if (!all.length)
      return (
        <EmptyState
          icon={kind === "history" ? Inbox : FileText}
          title={kind === "history" ? "No transactions yet" : "No bills yet"}
          text={
            kind === "history"
              ? "Purchases and payments of this vendor will appear here."
              : "Purchases from this vendor will appear here."
          }
        />
      );
    if (!shown.length)
      return (
        <EmptyState
          icon={Search}
          title="Nothing matches your search"
          text="Try a bill no., remark, account or reference no."
        />
      );
    return null;
  };

  const historyRows = filteredLedger.slice(0, visible);
  const billRows = filteredBills.slice(0, visible);
  const activeList: ListTab = isMobile
    ? mobileTab === "bills"
      ? "bills"
      : "history"
    : listTab;
  const hasMore =
    (activeList === "history" ? filteredLedger.length : filteredBills.length) >
    visible;

  const loadMore = hasMore ? (
    <div className="flex justify-center p-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setVisible((v) => v + PAGE)}
      >
        Show more
      </Button>
    </div>
  ) : null;

  /** Light vertical line between every column (none after the last one) */
  const colLines =
    "[&_td]:border-r [&_th]:border-r [&_td]:border-border/50 [&_th]:border-border/50 [&_tr>*:last-child]:border-r-0";

  const historyTable = (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", colLines)}>
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="w-[130px] px-4 py-2.5 font-semibold">Date</th>
            <th className="px-4 py-2.5 font-semibold">Particulars</th>
            <th className="w-[120px] px-4 py-2.5 text-right font-semibold">
              Debit
            </th>
            <th className="w-[120px] px-4 py-2.5 text-right font-semibold">
              Credit
            </th>
            <th
              className="w-[130px] px-4 py-2.5 text-right font-semibold"
              title="Vendor outstanding right after this entry"
            >
              Balance
            </th>
            <th className="w-[76px] px-2 py-2.5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {historyRows.map((t) => {
            const debit = t.kind === "debit";
            const d = parseYmd(t.date);
            return (
              <tr
                key={t.id}
                className="group border-t border-border transition-colors hover:bg-muted/30"
              >
                {/* Date + id */}
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <p className="font-medium">
                    {d ? format(d, "dd MMM yyyy") : prettyDate(t.date)}
                  </p>
                  <p className="mt-0.5 font-display text-[11px] text-muted-foreground">
                    #{t.id}
                  </p>
                </td>

                {/* What happened */}
                <td className="px-4 py-3 align-top">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                        debit
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "bg-muted text-foreground/70",
                      )}
                      title={debit ? "Payment" : "Purchase"}
                    >
                      {debit ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownLeft className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 leading-snug">
                        {t.remark || (debit ? "Payment" : "Purchase")}
                      </p>
                      {(t.account ||
                        t.transferType > 0 ||
                        t.txnNumber ||
                        (debit && t.billNo)) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                          {debit && t.billNo && <Tag>Bill {t.billNo}</Tag>}
                          {t.account && <Tag>{t.account}</Tag>}
                          {t.transferType > 0 &&
                            transferLabel(t.transferType) !== t.account && (
                              <Tag>{transferLabel(t.transferType)}</Tag>
                            )}
                          {t.txnNumber && <Tag>Ref {t.txnNumber}</Tag>}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-right align-top font-display font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {debit ? inr(t.amount) : ""}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right align-top font-display font-semibold tabular-nums">
                  {!debit ? inr(t.amount) : ""}
                </td>
                <td
                  className={cn(
                    "whitespace-nowrap px-4 py-3 text-right align-top font-display font-bold tabular-nums",
                    t.balance < 0
                      ? "text-sky-700 dark:text-sky-400"
                      : "text-foreground",
                  )}
                  title={
                    t.balance < 0
                      ? "Advance paid to the vendor"
                      : "Outstanding after this entry"
                  }
                >
                  {inr(Math.abs(t.balance))}
                </td>

                <td className="px-2 py-2.5 align-top">
                  {t.isPayment && (
                    <div className="flex items-center justify-center gap-0.5 opacity-50 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => openEdit(t)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                        aria-label={`Edit payment ${t.id}`}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(t)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Delete payment ${t.id}`}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-border bg-muted/40 text-sm">
          <tr>
            <td colSpan={2} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                    Paid
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-sky-600 dark:bg-sky-400" />
                    Advance
                  </span>
                </span>
                <span className="font-medium">Total of all entries</span>
              </div>
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-right font-display font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {inr(ledgerTotals.debit)}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-right font-display font-bold tabular-nums">
              {inr(ledgerTotals.credit)}
            </td>
            <td
              className={cn(
                "whitespace-nowrap px-4 py-3 text-right font-display font-bold tabular-nums",
                selectedVendor && selectedVendor.outstanding < 0
                  ? "text-sky-700 dark:text-sky-400"
                  : "text-primary",
              )}
              title="Current outstanding"
            >
              {selectedVendor ? inr(Math.abs(selectedVendor.outstanding)) : ""}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const selectionBar =
    billIds.length > 0 ? (
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-primary/[0.06] px-4 py-2.5 animate-in fade-in-0 slide-in-from-top-1 duration-200">
        <p className="text-sm">
          <span className="font-semibold">{billIds.length}</span>{" "}
          {billIds.length === 1 ? "bill" : "bills"} selected, pending{" "}
          <span className="font-display font-bold tabular-nums">
            {inr(selectedPending)}
          </span>
        </p>
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => applyBills([])}
          >
            Clear
          </Button>
          <Button type="button" size="sm" onClick={goToForm}>
            Pay {inr(amt > 0 ? amt : selectedPending)}
          </Button>
        </div>
      </div>
    ) : null;

  const billsTable = (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", colLines)}>
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="w-10 px-3 py-2.5">
              {openBills.length > 0 && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={allOpenSelected}
                  aria-label="Select all pending bills"
                  onClick={toggleAllBills}
                  className="flex items-center"
                >
                  <CheckBox on={allOpenSelected} />
                </button>
              )}
            </th>
            <th className="px-3 py-2.5 font-semibold">Bill No.</th>
            <th className="px-3 py-2.5 font-semibold">Date</th>
            <th className="px-3 py-2.5 text-right font-semibold">
              Bill amount
            </th>
            <th className="px-3 py-2.5 text-right font-semibold">Paid</th>
            <th className="px-3 py-2.5 text-right font-semibold">Pending</th>
            <th className="px-3 py-2.5 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {billRows.map((b) => {
            const on = billIds.includes(b.id);
            const payable = b.pending > 0;
            return (
              <tr
                key={b.id}
                onClick={() => payable && toggleBill(b.id)}
                className={cn(
                  "border-t border-border transition-colors",
                  payable && "cursor-pointer",
                  on ? "bg-primary/[0.06]" : "hover:bg-muted/30",
                )}
              >
                <td className="px-3 py-2.5">
                  {payable && (
                    <span
                      role="checkbox"
                      aria-checked={on}
                      aria-label={`Select bill ${b.billNo}`}
                    >
                      <CheckBox on={on} />
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 font-display text-xs font-semibold">
                  {b.billNo}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {prettyDate(b.date)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-display tabular-nums">
                  {inr(b.grand)}
                  {b.returned > 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      Returned {inr(b.returned)}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-display tabular-nums text-emerald-700 dark:text-emerald-400">
                  {inr(b.paid)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-display font-bold tabular-nums">
                  {inr(b.pending)}
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={b.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const historyCards = (
    <div className="space-y-2.5">
      {historyRows.map((t) => {
        const debit = t.kind === "debit";
        return (
          <div
            key={t.id}
            className="rounded-2xl border border-border bg-card p-3.5"
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  debit
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-foreground",
                )}
              >
                {debit ? (
                  <ArrowUpRight className="h-5 w-5" />
                ) : (
                  <ArrowDownLeft className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold">
                    {debit ? "Payment" : "Purchase"}
                    {t.billNo && (
                      <span className="font-normal text-muted-foreground">
                        , bill {t.billNo}
                      </span>
                    )}
                  </p>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "font-display text-base font-bold tabular-nums",
                        debit && "text-emerald-700 dark:text-emerald-400",
                      )}
                    >
                      {debit ? "-" : "+"}
                      {inr(t.amount)}
                    </p>
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      Bal {dueText(t.balance)}
                    </p>
                  </div>
                </div>
                {t.remark && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {t.remark}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Tag>#{t.id}</Tag>
                  <Tag>{prettyDate(t.date)}</Tag>
                  {t.account && <Tag>{t.account}</Tag>}
                  {t.transferType > 0 && (
                    <Tag>{transferLabel(t.transferType)}</Tag>
                  )}
                  {t.txnNumber && <Tag>Ref {t.txnNumber}</Tag>}
                </div>
              </div>
            </div>
            {t.isPayment && (
              <div className="mt-2.5 flex justify-end gap-1 border-t border-border pt-2">
                <button
                  type="button"
                  onClick={() => openEdit(t)}
                  className="flex h-9 touch-manipulation items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-muted-foreground active:bg-primary/10 active:text-primary"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(t)}
                  className="flex h-9 touch-manipulation items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-muted-foreground active:bg-destructive/10 active:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const billCards = (
    <div className="space-y-2.5">
      {billRows.map((b) => {
        const payable = Math.max(b.grand - b.returned, 0);
        const pct = payable > 0 ? Math.min(100, (b.paid / payable) * 100) : 100;
        const on = billIds.includes(b.id);
        const canPay = b.pending > 0;
        return (
          <div
            key={b.id}
            role={canPay ? "checkbox" : undefined}
            aria-checked={canPay ? on : undefined}
            tabIndex={canPay ? 0 : undefined}
            onClick={() => canPay && toggleBill(b.id)}
            onKeyDown={(e) => {
              if (canPay && (e.key === " " || e.key === "Enter")) {
                e.preventDefault();
                toggleBill(b.id);
              }
            }}
            className={cn(
              "rounded-2xl border bg-card p-3.5 transition-all",
              canPay && "touch-manipulation active:scale-[0.99]",
              on
                ? "border-primary bg-primary/[0.04] ring-1 ring-primary/30"
                : "border-border",
            )}
          >
            <div className="flex items-start gap-3">
              {canPay && (
                <div className="pt-0.5">
                  <CheckBox on={on} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-bold">
                  {b.billNo}
                </p>
                <p className="text-xs text-muted-foreground">
                  {prettyDate(b.date)}
                </p>
              </div>
              <StatusBadge status={b.status} />
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Bill</p>
                <p className="font-display font-semibold tabular-nums">
                  {inr(b.grand)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Paid</p>
                <p className="font-display font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {inr(b.paid)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground">Pending</p>
                <p className="font-display font-bold tabular-nums">
                  {inr(b.pending)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const searchBox = (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setVisible(PAGE);
        }}
        placeholder="Search"
        aria-label="Search transactions and bills"
        className={cn("pl-9", isMobile ? "h-11 text-base" : "h-9 w-56")}
        disabled={!vendorId}
      />
    </div>
  );

  const deleteDialog =
    deleteTarget &&
    createPortal(
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-in fade-in-0 sm:items-center sm:p-4"
        onClick={() => !deleting && setDeleteTarget(null)}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="del-title"
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-t-3xl bg-card p-5 shadow-xl animate-in slide-in-from-bottom-6 duration-200 sm:rounded-2xl"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
          }}
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted sm:hidden" />
          <h2 id="del-title" className="font-display text-lg font-bold">
            Delete payment #{deleteTarget.id}?
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {inr(deleteTarget.amount)} will be added back to{" "}
            {selectedVendor?.name ?? "the vendor"}'s outstanding
            {deleteTarget.account
              ? ` and to ${deleteTarget.account}'s balance`
              : ""}
            .
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="h-11 rounded-xl"
            >
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
              className="h-11 rounded-xl"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </div>
        </div>
      </div>,
      document.body,
    );

  /** Full-screen save loader (stays at least 2 seconds) */
  const busy = saving || editSaving;
  const saveLoader = createPortal(
    <div
      className={cn("fixed inset-0 z-[110]", !busy && "pointer-events-none")}
    >
      <LoadingOverlay
        active={busy}
        label={editSaving ? "Updating payment…" : "Saving payment…"}
      />
    </div>,
    document.body,
  );

  // ---------- Mobile layout ----------

  if (isMobile) {
    const tabs: { key: MobileTab; label: string; count?: number }[] = [
      { key: "pay", label: "Pay" },
      { key: "history", label: "History", count: ledger.length },
      { key: "bills", label: "Bills", count: openBills.length },
    ];
    const tabIndex = tabs.findIndex((t) => t.key === mobileTab);
    const showContinueBar = mobileTab === "bills" && billIds.length > 0;
    const hasBottomBar = mobileTab === "pay" || showContinueBar;

    return (
      <>
        <LoaderStyles />
        <div className={cn("px-4 pt-2", hasBottomBar ? "pb-36" : "pb-10")}>
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/purchases")}
              aria-label="Back to purchases"
              className="-ml-2 flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full active:bg-muted"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-xl font-bold">
                Purchase Payment
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Pay your vendors
              </p>
            </div>
            {vendorId && (
              <button
                type="button"
                onClick={refresh}
                aria-label="Refresh"
                className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-full text-muted-foreground active:bg-muted"
              >
                <RefreshCw
                  className={cn("h-4 w-4", loadingVendorData && "animate-spin")}
                />
              </button>
            )}
          </div>

          <div className="space-y-3">
            {vendorField}
            {balancePanel}
          </div>

          {/* Segmented tabs with a sliding highlight */}
          <div className="sticky top-0 z-20 -mx-4 mt-4 bg-background/90 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75">
            <div
              role="tablist"
              className="relative grid grid-cols-3 rounded-xl bg-muted p-1"
            >
              <span
                aria-hidden
                className="absolute inset-y-1 left-1 rounded-lg bg-primary shadow-md shadow-primary/30 transition-transform duration-300 ease-out motion-reduce:transition-none"
                style={{
                  width: "calc((100% - 0.5rem) / 3)",
                  transform: `translateX(${tabIndex * 100}%)`,
                }}
              />
              {tabs.map((t) => {
                const active = mobileTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setMobileTab(t.key);
                      setVisible(PAGE);
                    }}
                    className={cn(
                      "relative z-10 flex h-9 touch-manipulation items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors duration-200",
                      active
                        ? "text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {t.label}
                    {!!t.count && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-[10px] transition-colors",
                          active
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-primary/10 text-primary",
                        )}
                      >
                        {t.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative mt-2" key={mobileTab}>
            {mobileTab !== "pay" && (
              <TopProgressBar active={loadingVendorData && hasVendorData} />
            )}

            {mobileTab === "pay" && (
              <div className="rounded-2xl border border-border bg-card p-4 animate-in fade-in-0 duration-200">
                {payFields}
              </div>
            )}

            {mobileTab !== "pay" && (
              <div className="space-y-3 animate-in fade-in-0 duration-200">
                {vendorId && hasVendorData && searchBox}

                {mobileTab === "history" && vendorId && ledger.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    <MiniStat
                      label="Purchased"
                      value={inr(ledgerTotals.credit)}
                    />
                    <MiniStat
                      label="Paid"
                      value={inr(ledgerTotals.debit)}
                      tone="good"
                    />
                  </div>
                )}
                {mobileTab === "bills" && vendorId && bills.length > 0 && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <MiniStat
                        label="Bills pending"
                        value={String(openBills.length)}
                      />
                      <MiniStat
                        label="Pending amount"
                        value={inr(pendingTotal)}
                      />
                    </div>
                    {openBills.length > 1 && (
                      <button
                        type="button"
                        onClick={toggleAllBills}
                        className="flex h-9 touch-manipulation items-center gap-2 px-1 text-sm font-semibold text-primary"
                      >
                        <CheckBox on={allOpenSelected} />
                        {allOpenSelected
                          ? "Clear selection"
                          : "Select all pending bills"}
                      </button>
                    )}
                  </>
                )}

                {listState(mobileTab) ??
                  (mobileTab === "history" ? historyCards : billCards)}
                {!listState(mobileTab) && loadMore}
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar: Save on the Pay tab, Continue on the Bills tab */}
        {hasBottomBar && (
          <div
            className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-background/95 px-4 pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur animate-in slide-in-from-bottom-4 duration-200 supports-[backdrop-filter]:bg-background/85"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
            }}
          >
            {mobileTab === "pay" ? (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted-foreground">
                    {selectedVendor && amt > 0
                      ? `Outstanding after: ${dueText(outstandingAfter)}`
                      : "Amount to pay"}
                  </p>
                  <p className="truncate font-display text-lg font-bold tabular-nums text-primary">
                    {inr(amt)}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="h-12 min-w-[150px] touch-manipulation rounded-xl text-base font-semibold transition-transform active:scale-[0.97]"
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {saveText}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted-foreground">
                    {billIds.length} {billIds.length === 1 ? "bill" : "bills"}{" "}
                    selected
                  </p>
                  <p className="truncate font-display text-lg font-bold tabular-nums text-primary">
                    {inr(selectedPending)}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={goToForm}
                  className="h-12 min-w-[150px] touch-manipulation rounded-xl text-base font-semibold transition-transform active:scale-[0.97]"
                >
                  Continue to pay
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Bill picker sheet (Pay tab) */}
        <BottomSheet
          open={billSheetOpen}
          onClose={() => setBillSheetOpen(false)}
          title="Select bills"
          heightClass="h-[60vh]"
          headerAction={
            openBills.length > 1 ? (
              <button
                type="button"
                onClick={toggleAllBills}
                className="text-sm font-semibold text-primary"
              >
                {allOpenSelected ? "Clear all" : "Select all"}
              </button>
            ) : undefined
          }
          footer={
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground">
                  {billIds.length
                    ? `${billIds.length} selected`
                    : "No bill selected, saved on account"}
                </p>
                <p className="font-display text-lg font-bold tabular-nums text-primary">
                  {inr(selectedPending)}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setBillSheetOpen(false)}
                className="h-11 min-w-[120px] rounded-xl"
              >
                Done
              </Button>
            </div>
          }
        >
          {billFieldBody}
        </BottomSheet>

        {/* Edit payment sheet */}
        <BottomSheet
          open={editOpen}
          onClose={closeEdit}
          title={editTarget ? `Edit payment #${editTarget.id}` : "Edit payment"}
          heightClass="h-[88vh]"
          footer={editActions}
        >
          <div className="px-4 pb-4 pt-1">{editFields}</div>
        </BottomSheet>

        {deleteDialog}
        {saveLoader}
      </>
    );
  }

  // ---------- Desktop / tablet layout ----------

  return (
    <div className="space-y-4">
      <LoaderStyles />

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold">Purchase Payment</h1>
          <p className="text-sm text-muted-foreground">
            Pay vendors against their outstanding or one or more bills
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate("/purchases")}
          className="gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" /> Purchases
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
        {/* Form */}
        <section
          ref={formRef}
          className="scroll-mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:sticky lg:top-4"
        >
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="font-display text-base font-semibold">
              Add Purchase Payment
            </h2>
          </div>
          <div className="space-y-4 p-5">
            {vendorField}
            {balancePanel}
            {payFields}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
            <Button
              type="button"
              variant="ghost"
              onClick={resetForm}
              disabled={saving}
            >
              Clear
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={saving}
              className="min-w-[150px]"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? saveText : amt > 0 ? `Pay ${inr(amt)}` : saveText}
            </Button>
          </div>
        </section>

        {/* Ledger + bills */}
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            <div
              role="tablist"
              className="inline-flex gap-1 rounded-lg bg-muted p-1"
            >
              {(
                [
                  {
                    key: "history",
                    label: "Payment list",
                    count: ledger.length,
                  },
                  { key: "bills", label: "Bills", count: openBills.length },
                ] as const
              ).map((t) => {
                const active = listTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setListTab(t.key);
                      setVisible(PAGE);
                    }}
                    className={cn(
                      "flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                        : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                    )}
                  >
                    {t.label}
                    {t.count > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-[10px]",
                          active
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-primary/10 text-primary",
                        )}
                      >
                        {t.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {searchBox}
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={refresh}
                disabled={!vendorId}
                aria-label="Refresh"
                className="h-9 w-9"
              >
                <RefreshCw
                  className={cn("h-4 w-4", loadingVendorData && "animate-spin")}
                />
              </Button>
            </div>
          </div>

          {vendorId && !vendorDataError && hasVendorData && (
            <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
              {listTab === "history" ? (
                <>
                  <Stat
                    label="Total purchased (credit)"
                    value={inr(ledgerTotals.credit)}
                  />
                  <Stat
                    label="Total paid (debit)"
                    value={inr(ledgerTotals.debit)}
                    tone="good"
                  />
                  <Stat
                    label="Outstanding"
                    value={
                      selectedVendor ? dueText(selectedVendor.outstanding) : "-"
                    }
                    strong
                  />
                </>
              ) : (
                <>
                  <Stat label="Total bills" value={String(bills.length)} />
                  <Stat
                    label="Bills pending"
                    value={String(openBills.length)}
                  />
                  <Stat
                    label="Pending amount"
                    value={inr(pendingTotal)}
                    strong
                  />
                </>
              )}
            </div>
          )}

          {listTab === "bills" && selectionBar}

          <div className="relative" aria-busy={loadingVendorData}>
            <TopProgressBar active={loadingVendorData && hasVendorData} />
            <div
              className={cn(
                "transition-opacity duration-200",
                loadingVendorData &&
                  hasVendorData &&
                  "pointer-events-none opacity-60",
              )}
            >
              {listState(listTab) ??
                (listTab === "history" ? historyTable : billsTable)}
              {!listState(listTab) && loadMore}
            </div>
            <LoadingOverlay
              active={loadingVendorData && hasVendorData}
              label="Updating…"
            />
          </div>
        </section>
      </div>

      {editDialog}
      {deleteDialog}
      {saveLoader}
    </div>
  );
};

// ---------- Shared form pieces ----------

const TransferTypePicker = ({
  value,
  onChange,
  error,
  large,
}: {
  value: TransferType | "";
  onChange: (v: TransferType) => void;
  error?: string;
  large?: boolean;
}) => (
  <div>
    <Label className="text-xs">
      Transfer type <span className="text-destructive">*</span>
    </Label>
    <div
      role="radiogroup"
      aria-label="Transfer type"
      aria-invalid={!!error}
      className="mt-1 grid grid-cols-3 gap-2"
    >
      {TRANSFER_TYPES.map((t) => {
        const Icon = t.icon;
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "flex touch-manipulation flex-col items-center justify-center gap-1 rounded-xl border text-xs font-semibold transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              large ? "h-16 text-sm" : "h-14",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
              error && !active && "border-destructive/60",
            )}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </button>
        );
      })}
    </div>
    {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
  </div>
);

const AmountInput = ({
  id,
  value,
  onChange,
  invalid,
  large,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  large?: boolean;
}) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-display text-muted-foreground">
      ₹
    </span>
    <Input
      id={id}
      inputMode="decimal"
      value={value}
      maxLength={13}
      onChange={(e) => onChange(decimal(e.target.value))}
      placeholder="0.00"
      aria-invalid={!!invalid}
      className={cn(
        "pl-7 font-display font-semibold tabular-nums",
        large ? "h-12 text-lg" : "h-10 text-base",
        invalid && "border-destructive",
      )}
    />
  </div>
);

// ---------- Bottom sheet (mobile) ----------

const BottomSheet = ({
  open,
  onClose,
  title,
  children,
  footer,
  headerAction,
  heightClass = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  headerAction?: ReactNode;
  heightClass?: string;
}) => {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Mount → slide up; close → slide down, then unmount
  useEffect(() => {
    if (open) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(t);
  }, [open]);

  // Lock page scroll + close on Escape while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[85]">
      <div
        className={cn(
          "absolute inset-0 bg-black/40 transition-opacity duration-300",
          shown ? "opacity-100" : "opacity-0",
        )}
        onClick={() => onCloseRef.current()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col rounded-t-3xl bg-card shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          heightClass,
          shown ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25" />
        <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <div className="ml-auto flex items-center gap-2">
            {headerAction}
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              aria-label="Close"
              className="flex h-9 w-9 touch-manipulation items-center justify-center rounded-full text-muted-foreground active:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
        {footer && (
          <div
            className="shrink-0 border-t border-border px-4 pt-3"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
            }}
          >
            {footer}
          </div>
        )}
        {!footer && (
          <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
        )}
      </div>
    </div>,
    document.body,
  );
};

/** Mobile select: trigger + half-screen searchable sheet */
const SheetSelect = ({
  id,
  title,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  invalid,
  loading,
}: {
  id: string;
  title: string;
  value: string;
  onChange: (v: string) => void;
  options: SearchableOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  invalid?: boolean;
  loading?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) =>
        `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q),
      )
    : options;

  return (
    <>
      <button
        id={id}
        type="button"
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-invalid={!!invalid}
        className={cn(
          "flex h-11 w-full touch-manipulation items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-base transition-colors active:bg-muted/40",
          invalid && "border-destructive",
        )}
      >
        {selected ? (
          <span className="truncate">{selected.label}</span>
        ) : (
          <span className="truncate text-muted-foreground">
            {loading ? "Loading…" : placeholder}
          </span>
        )}
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        heightClass="h-[60vh]"
      >
        <div className="sticky top-0 z-10 bg-card px-4 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-11 rounded-xl bg-muted/50 pl-9 text-base"
            />
          </div>
        </div>

        {loading && !options.length ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : !filtered.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {emptyText}
          </p>
        ) : (
          <ul role="listbox" aria-label={title} className="px-2 pb-3">
            {filtered.map((o) => {
              const active = o.value === value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={o.disabled}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full touch-manipulation items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors disabled:opacity-40",
                      active ? "bg-primary/[0.08]" : "active:bg-muted",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-base",
                          active && "font-semibold text-primary",
                        )}
                      >
                        {o.label}
                      </p>
                      {o.hint && (
                        <p className="truncate text-xs text-muted-foreground">
                          {o.hint}
                        </p>
                      )}
                    </div>
                    {active && (
                      <Check className="h-5 w-5 shrink-0 text-primary" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </BottomSheet>
    </>
  );
};

/** Mobile date picker: trigger + calendar sheet (no future dates) */
const SheetDatePicker = ({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const selected = parseYmd(value);
  const today = startOfDay(new Date());
  const [month, setMonth] = useState(() => startOfMonth(selected ?? today));

  const openSheet = () => {
    setMonth(startOfMonth(selected ?? today));
    setOpen(true);
  };

  const pick = (d: Date) => {
    onChange(format(d, "yyyy-MM-dd"));
    setOpen(false);
  };

  const offset = (month.getDay() + 6) % 7; // Monday first
  const cells: (Date | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from(
      { length: getDaysInMonth(month) },
      (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1),
    ),
  ];
  const canNext = isBefore(month, startOfMonth(today));
  const yesterday = subDays(today, 1);

  return (
    <>
      <button
        id={id}
        type="button"
        onClick={openSheet}
        aria-haspopup="dialog"
        aria-invalid={!!invalid}
        className={cn(
          "flex h-11 w-full touch-manipulation items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-base transition-colors active:bg-muted/40",
          invalid && "border-destructive",
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? format(selected, "EEE, d MMM yyyy") : "Select date"}
        </span>
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Transaction date"
      >
        <div className="px-4 pb-4">
          <div className="mb-3 flex gap-2">
            {[
              { label: "Today", d: today },
              { label: "Yesterday", d: yesterday },
            ].map((c) => {
              const active = selected && isSameDay(selected, c.d);
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => pick(c.d)}
                  className={cn(
                    "h-9 touch-manipulation rounded-full border px-4 text-sm font-semibold transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground active:bg-muted",
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth((m) => subMonths(m, 1))}
              aria-label="Previous month"
              className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-full active:bg-muted"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <p className="font-display text-base font-semibold">
              {format(month, "MMMM yyyy")}
            </p>
            <button
              type="button"
              onClick={() => canNext && setMonth((m) => addMonths(m, 1))}
              disabled={!canNext}
              aria-label="Next month"
              className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-full active:bg-muted disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1" key={month.toISOString()}>
            {cells.map((d, i) => {
              if (!d) return <span key={`blank-${i}`} />;
              const future = isAfter(d, today);
              const isSel = !!selected && isSameDay(d, selected);
              const isToday = isSameDay(d, today);
              return (
                <button
                  key={d.getDate()}
                  type="button"
                  disabled={future}
                  onClick={() => pick(d)}
                  aria-label={format(d, "d MMMM yyyy")}
                  aria-pressed={isSel}
                  className={cn(
                    "mx-auto flex h-11 w-11 touch-manipulation items-center justify-center rounded-full text-base transition-all active:scale-95 disabled:opacity-25",
                    isSel
                      ? "bg-primary font-bold text-primary-foreground shadow-md shadow-primary/30"
                      : isToday
                        ? "font-semibold text-primary ring-1 ring-primary/40"
                        : "active:bg-muted",
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      </BottomSheet>
    </>
  );
};

// ---------- Small UI pieces ----------

const Field = ({
  label,
  htmlFor,
  required,
  optional,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  children: ReactNode;
}) => (
  <div>
    <Label htmlFor={htmlFor} className="text-xs">
      {label} {required && <span className="text-destructive">*</span>}
      {optional && (
        <span className="font-normal text-muted-foreground">(optional)</span>
      )}
    </Label>
    <div className="mt-1">{children}</div>
    {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
  </div>
);

const CheckBox = ({ on }: { on: boolean }) => (
  <span
    aria-hidden
    className={cn(
      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-150",
      on
        ? "scale-100 border-primary bg-primary text-primary-foreground"
        : "border-muted-foreground/40",
    )}
  >
    <Check
      className={cn(
        "h-3.5 w-3.5 transition-transform duration-150",
        on ? "scale-100" : "scale-0",
      )}
      strokeWidth={3}
    />
  </span>
);

const Notice = ({ children }: { children: ReactNode }) => (
  <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 animate-in fade-in-0 slide-in-from-top-1 duration-200 dark:text-amber-300">
    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span>{children}</span>
  </div>
);

const QuickChip = ({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="touch-manipulation rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary active:scale-[0.97]"
  >
    {children}
  </button>
);

const Tag = ({ children }: { children: ReactNode }) => (
  <span className="rounded-md bg-muted px-1.5 py-0.5">{children}</span>
);

const StatusBadge = ({ status }: { status: Bill["status"] }) => (
  <span
    className={cn(
      "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
      BILL_STATUS[status].className,
    )}
  >
    {BILL_STATUS[status].label}
  </span>
);

const Stat = ({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "good";
  strong?: boolean;
}) => (
  <div className="px-4 py-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p
      className={cn(
        "mt-0.5 font-display tabular-nums",
        strong ? "text-lg font-bold text-primary" : "text-base font-semibold",
        tone === "good" && "text-emerald-700 dark:text-emerald-400",
      )}
    >
      {value}
    </p>
  </div>
);

const MiniStat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good";
}) => (
  <div className="rounded-xl border border-border bg-card px-3 py-2.5">
    <p className="text-[11px] text-muted-foreground">{label}</p>
    <p
      className={cn(
        "font-display text-base font-bold tabular-nums",
        tone === "good" && "text-emerald-700 dark:text-emerald-400",
      )}
    >
      {value}
    </p>
  </div>
);

const EmptyState = ({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Inbox;
  title: string;
  text: string;
}) => (
  <div className="flex flex-col items-center px-6 py-12 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
      <Icon className="h-6 w-6" />
    </span>
    <p className="mt-3 text-sm font-semibold">{title}</p>
    <p className="mt-1 max-w-xs text-xs text-muted-foreground">{text}</p>
  </div>
);

/** Mobile card placeholders while the first load runs */
const CardSkeleton = () => (
  <div className="space-y-2.5">
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        className="flex gap-3 rounded-2xl border border-border p-3.5"
      >
        <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </div>
    ))}
  </div>
);

export default PurchasePayment;
