import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";
import axios from "axios";
import { toast } from "sonner";
import type { SearchableOption } from "./Searchableselect";

const API_URL =
  import.meta.env.VITE_API_URL || "https://sunshineproduct.in/POS/v1_api/";

const getUserProfile = () =>
  JSON.parse(localStorage.getItem("company_data") || "{}");

// ---------- Types ----------

export interface Purchase {
  id: number;
  billNo: string;
  date: string;
  vendorId: string;
  vendor: string;
  vendorMobile: string;
  items: number;
  qty: number;
  subtotal: number; // excl. GST
  gst: number;
  discount: number;
  total: number; // grand total
}

export type Preset = "all" | "today" | "yesterday" | "week" | "month" | "custom";
export type QuickPreset = Exclude<Preset, "custom">;

export const PRESETS: { key: QuickPreset; label: string }[] = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

export const ALL_VENDORS = "all";

// ---------- Helpers ----------

const API_DATE = "yyyy-MM-dd";

export const prettyDate = (v: string) => {
  const d = parseISO(v);
  return isValid(d) ? format(d, "dd MMM yyyy") : v;
};

export const inr = (n: number, decimals = 2) =>
  `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;

/** Empty from/to = no date filter (all purchases) */
const rangeFor = (preset: QuickPreset) => {
  const today = new Date();
  const f = (d: Date) => format(d, API_DATE);
  switch (preset) {
    case "today":
      return { from: f(today), to: f(today) };
    case "yesterday":
      return { from: f(subDays(today, 1)), to: f(subDays(today, 1)) };
    case "week":
      return { from: f(startOfWeek(today, { weekStartsOn: 1 })), to: f(today) };
    case "month":
      return { from: f(startOfMonth(today)), to: f(today) };
    default:
      return { from: "", to: "" };
  }
};

const toPurchase = (p: any): Purchase => ({
  id: Number(p.purchess_id),
  billNo: p.purchess_bill_number || "",
  date: String(p.purchess_date || "").slice(0, 10),
  vendorId: String(p.purchess_vendor_id || ""),
  vendor: p.vendor_name || "Unknown vendor",
  vendorMobile: p.vendor_mobile_no || "",
  items: Number(p.item_count) || 0,
  qty: Number(p.total_qty) || 0,
  subtotal: Number(p.purchess_total_amount) || 0,
  gst: Number(p.total_gst) || 0,
  discount: Number(p.purches_total_discount_amount) || 0,
  total: Number(p.purches_total_with_gst_amount) || 0,
});

// ---------- Hook ----------

/**
 * Holds the purchase filters and fetches matching rows from purchase.php.
 * Every filter goes to the API as a query parameter; nothing is filtered
 * on the client. While a new request runs, the previous rows stay on
 * screen so the page never blanks out.
 */
export const usePurchaseData = (defaultPreset: QuickPreset = "all") => {
  const initialRange = rangeFor(defaultPreset);

  const [preset, setPreset] = useState<Preset>(defaultPreset);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [vendorId, setVendorId] = useState(ALL_VENDORS);

  const [vendors, setVendors] = useState<SearchableOption[]>([]);
  const [data, setData] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    const loadVendors = async () => {
      try {
        const u = getUserProfile();
        const res = await axios.post(`${API_URL}vendor.php`, {
          type: 2,
          company_id: u.company_id,
          franchise_id: u.franchise_id,
        });
        if (res.data.status === "success") {
          setVendors(
            res.data.data.map((v: any) => ({
              value: String(v.vendor_id),
              label: v.vendor_name,
              hint: v.vendor_mobile_no || undefined,
            })),
          );
        }
      } catch (err) {
        console.error("Error loading vendors:", err);
      }
    };
    loadVendors();
  }, []);

  const reload = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    try {
      const u = getUserProfile();
      const res = await axios.post(`${API_URL}purchase.php`, {
        type: 2,
        company_id: u.company_id,
        franchise_id: u.franchise_id,
        from_date: from,
        to_date: to,
        vendor_id: vendorId === ALL_VENDORS ? 0 : Number(vendorId),
      });
      if (current !== requestId.current) return; // a newer filter won
      if (res.data.status === "success") {
        setData(res.data.data.map(toPurchase));
        setError("");
      } else {
        const msg = res.data.message || "Couldn't load purchases";
        setError(msg);
        toast.error(msg);
      }
      setHasLoaded(true);
    } catch (err: any) {
      if (current !== requestId.current) return;
      console.error("Error loading purchases:", err);
      const msg =
        err?.response?.data?.message ||
        "Couldn't load purchases. Check your connection and try again.";
      setError(msg);
      setHasLoaded(true);
      toast.error(msg);
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [from, to, vendorId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // ---------- Filter actions ----------

  const applyPreset = (p: QuickPreset) => {
    const r = rangeFor(p);
    setPreset(p);
    setFrom(r.from);
    setTo(r.to);
  };

  const onFromChange = (v: string) => {
    setPreset("custom");
    setFrom(v);
    if (to && v > to) setTo(v);
  };

  const onToChange = (v: string) => {
    setPreset("custom");
    setTo(v);
    if (from && v < from) setFrom(v);
  };

  const resetFilters = () => {
    applyPreset(defaultPreset);
    setVendorId(ALL_VENDORS);
  };

  const pickVendorByName = (name: string) => {
    const match = vendors.find((v) => v.label === name);
    if (match) setVendorId(match.value);
  };

  // ---------- Labels ----------

  const vendorOptions: SearchableOption[] = useMemo(
    () => [{ value: ALL_VENDORS, label: "All vendors" }, ...vendors],
    [vendors],
  );

  const selectedVendorName =
    vendorId === ALL_VENDORS
      ? ""
      : vendors.find((v) => v.value === vendorId)?.label || "";

  const rangeLabel = (() => {
    if (preset === "all") return "All dates";
    if (preset === "today") return "Today";
    if (preset === "yesterday") return "Yesterday";
    if (preset === "week") return "This week";
    if (preset === "month") return "This month";
    if (from && to)
      return from === to
        ? prettyDate(from)
        : `${prettyDate(from)} to ${prettyDate(to)}`;
    if (from) return `From ${prettyDate(from)}`;
    if (to) return `Up to ${prettyDate(to)}`;
    return "All dates";
  })();

  return {
    // filters
    preset,
    from,
    to,
    vendorId,
    setVendorId,
    applyPreset,
    onFromChange,
    onToChange,
    resetFilters,
    pickVendorByName,
    isDefault: preset === defaultPreset && vendorId === ALL_VENDORS,
    // data
    vendorOptions,
    data,
    setData,
    reload,
    loading,
    initialLoading: loading && !hasLoaded,
    error,
    // labels
    rangeLabel,
    selectedVendorName,
  };
};

export type PurchaseDataState = ReturnType<typeof usePurchaseData>;