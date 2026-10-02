import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Loader2, Minus, Plus, Trash2 } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { FormPage } from "@/components/shared/FormPage";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QuickAddVendorDialog, CreatedVendor } from "./Quickaddvendordialog";
import { DatePicker } from "./Datepicker";
import {
  PurchaseProduct,
  toPurchaseProduct,
  QuickAddProductDialog,
} from "./Quickaddproductdialog";
import { SearchableOption, SearchableSelect } from "./Searchableselect";

const API_URL =
  import.meta.env.VITE_API_URL || "https://sunshineproduct.in/POS/v1_api/";

const getUserProfile = () =>
  JSON.parse(localStorage.getItem("company_data") || "{}");

// ---------- Types ----------

interface VendorOption {
  id: string;
  name: string;
  mobile: string;
  outstanding: number; // tbl_vendor.vendor_wallet
}

interface PurchaseRow {
  key: string;
  productId: string;
  basePrice: string; // excl. GST, per unit
  gstPercent: string;
  qty: string;
}

type DiscountType = "percent" | "amount";
type Errors = Record<string, string>;

// ---------- Helpers ----------

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Keeps only digits and a single decimal point */
const decimal = (v: string) =>
  v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");

const round2 = (n: number) => Math.round(n * 100) / 100;

const inr = (n: number) =>
  `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** "5.00" → "5", "12.50" → "12.5" */
const cleanNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? String(n) : "";
};

/**
 * Base Price + GST % = Price (per unit)
 * Price × Qty = Line total
 */
const rowCalc = (r: PurchaseRow) => {
  const base = num(r.basePrice);
  const gstPct = num(r.gstPercent);
  const qty = num(r.qty);
  const price = base * (1 + gstPct / 100);
  const sub = base * qty;
  const gst = (sub * gstPct) / 100;
  return { price, sub, gst, total: price * qty };
};

const newRow = (): PurchaseRow => ({
  key: crypto.randomUUID(),
  productId: "",
  basePrice: "",
  gstPercent: "",
  qty: "1",
});

const apiError = (err: any, fallback: string) =>
  err?.response?.data?.message || fallback;

const scrollToFirstError = () =>
  requestAnimationFrame(() =>
    document
      .querySelector('[aria-invalid="true"]')
      ?.scrollIntoView({ behavior: "smooth", block: "center" }),
  );

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

const AddPurchase = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const isMobile = useIsMobile();

  const [billNo, setBillNo] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [remark, setRemark] = useState("");
  const [rows, setRows] = useState<PurchaseRow[]>([newRow()]);
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("");

  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [products, setProducts] = useState<PurchaseProduct[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingPurchase, setLoadingPurchase] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const [vendorDialog, setVendorDialog] = useState({ open: false, name: "" });
  // Saved bill (edit mode) - its amount is already inside the vendor's outstanding
  const [original, setOriginal] = useState({ vendorId: "", grand: 0 });

  const [productDialog, setProductDialog] = useState({
    open: false,
    name: "",
    rowKey: "",
  });

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
          res.data.data.map((v: any) => ({
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

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const u = getUserProfile();
      const res = await axios.post(`${API_URL}product.php`, {
        type: 7, // purchase products only
        company_id: u.company_id,
        franchise_id: u.franchise_id,
      });
      if (res.data.status === "success") {
        setProducts(
          res.data.data
            .filter((p: any) => String(p.product_is_active) !== "0")
            .map(toPurchaseProduct),
        );
      } else {
        toast.error(res.data.message || "Couldn't load products");
      }
    } catch (err) {
      console.error("Error loading products:", err);
      toast.error(apiError(err, "Couldn't load products. Reload the page."));
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    loadVendors();
    loadProducts();
  }, [loadVendors, loadProducts]);

  // Edit mode: load the saved purchase
  useEffect(() => {
    if (!isEdit) return;
    const loadPurchase = async () => {
      try {
        const u = getUserProfile();
        const res = await axios.post(`${API_URL}purchase.php`, {
          type: 5,
          company_id: u.company_id,
          franchise_id: u.franchise_id,
          purchase_id: Number(id),
        });
        if (res.data.status !== "success") {
          toast.error(res.data.message || "Purchase not found");
          navigate("/purchases");
          return;
        }
        const p = res.data.data;
        setBillNo(p.purchess_bill_number || "");
        setVendorId(String(p.purchess_vendor_id || ""));
        setDate(String(p.purchess_date || "").slice(0, 10));
        setRemark(p.purchess_remark || "");
        setDiscountType("amount");
        setDiscountValue(cleanNum(p.purches_total_discount_amount));
        setOriginal({
          vendorId: String(p.purchess_vendor_id || ""),
          grand: Number(p.purches_total_with_gst_amount) || 0,
        });

        if (p.purchess_vendor_id && p.vendor_name) {
          setVendors((vs) =>
            vs.some((v) => v.id === String(p.purchess_vendor_id))
              ? vs
              : [
                  ...vs,
                  {
                    id: String(p.purchess_vendor_id),
                    name: p.vendor_name,
                    mobile: p.vendor_mobile_no || "",
                    outstanding: Number(p.vendor_wallet) || 0,
                  },
                ],
          );
        }

        const items: any[] = p.items || [];
        setProducts((ps) => {
          const missing = items
            .filter(
              (d) =>
                !ps.some((x) => x.id === String(d.purchess_details_product_id)),
            )
            .map((d) => ({
              id: String(d.purchess_details_product_id),
              name:
                d.product_name || `Product #${d.purchess_details_product_id}`,
              sku: d.product_sku || "",
              mrp: Number(d.product_mrp_with_gst) || 0,
              price: Number(d.purchess_details_single_product_price) || 0,
              gst: Number(d.purchess_details_product_gst_persantage) || 0,
            }));
          return missing.length ? [...ps, ...missing] : ps;
        });

        setRows(
          items.length
            ? items.map((d) => ({
                key: crypto.randomUUID(),
                productId: String(d.purchess_details_product_id),
                basePrice: cleanNum(d.purchess_details_single_product_price),
                gstPercent: cleanNum(d.purchess_details_product_gst_persantage),
                qty: cleanNum(d.purchess_details_product_qty),
              }))
            : [newRow()],
        );
      } catch (err) {
        console.error("Error loading purchase:", err);
        toast.error(apiError(err, "Couldn't load the purchase"));
        navigate("/purchases");
      } finally {
        setLoadingPurchase(false);
      }
    };
    loadPurchase();
  }, [id, isEdit, navigate]);

  // ---------- Error helpers ----------

  const clearErrors = (keys: string[]) =>
    setErrors((prev) => {
      if (!keys.some((k) => prev[k])) return prev;
      const next = { ...prev };
      keys.forEach((k) => delete next[k]);
      return next;
    });

  const rowErr = (key: string, field: string) => errors[`${key}.${field}`];

  // ---------- Row actions ----------

  const patchRow = (
    key: string,
    patch: Partial<PurchaseRow>,
    fields: string[],
  ) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    clearErrors([...fields.map((f) => `${key}.${f}`), "items"]);
  };

  const applyProduct = (key: string, p: PurchaseProduct) =>
    patchRow(
      key,
      {
        productId: p.id,
        basePrice: p.price ? String(p.price) : "",
        gstPercent: String(p.gst || 0),
      },
      ["product", "base", "gst"],
    );

  const addRow = () => {
    const row = newRow();
    setRows((rs) => [...rs, row]);
    // Bring the new item into view (mainly for mobile)
    setTimeout(
      () =>
        document
          .getElementById(`item-${row.key}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      50,
    );
  };

  const removeRow = (key: string) => {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
    clearErrors(["product", "base", "gst", "qty"].map((f) => `${key}.${f}`));
  };

  const stepQty = (key: string, delta: number) => {
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    const next = Math.max(1, round2(num(row.qty) + delta));
    patchRow(key, { qty: String(next) }, ["qty"]);
  };

  // ---------- Options ----------

  const vendorOptions: SearchableOption[] = useMemo(
    () =>
      vendors.map((v) => ({
        value: v.id,
        label: v.name,
        hint: [v.mobile, `Outstanding ${inr(v.outstanding)}`]
          .filter(Boolean)
          .join(", "),
      })),
    [vendors],
  );

  const productOptionsFor = (rowKey: string): SearchableOption[] =>
    products.map((p) => {
      const usedElsewhere = rows.some(
        (r) => r.key !== rowKey && r.productId === p.id,
      );
      return {
        value: p.id,
        label: p.name,
        hint: usedElsewhere
          ? "Already added in this bill"
          : [p.sku, p.price ? `Base ${inr(p.price)}` : ""]
              .filter(Boolean)
              .join(", "),
        disabled: usedElsewhere,
      };
    });

  // ---------- Totals ----------

  const totals = useMemo(() => {
    const sub = rows.reduce((s, r) => s + rowCalc(r).sub, 0);
    const gst = rows.reduce((s, r) => s + rowCalc(r).gst, 0);
    const itemsTotal = round2(sub) + round2(gst);
    const d = num(discountValue);
    const rawDiscount = discountType === "percent" ? (itemsTotal * d) / 100 : d;
    const discount = Math.min(Math.max(rawDiscount, 0), itemsTotal);
    return {
      sub,
      gst,
      itemsTotal,
      discount,
      grand: Math.max(0, itemsTotal - discount),
    };
  }, [rows, discountType, discountValue]);

  const filledItems = rows.filter((r) => r.productId).length;

  const selectedVendor = vendors.find((v) => v.id === vendorId);
  const outstandingAfter = selectedVendor
    ? selectedVendor.outstanding -
      (vendorId === original.vendorId ? original.grand : 0) +
      totals.grand
    : 0;

  // ---------- Validation ----------

  const validate = (): Errors => {
    const e: Errors = {};
    if (!billNo.trim()) e.billNo = "Enter the bill number";
    if (!vendorId) e.vendor = "Select a vendor";
    if (!date) e.date = "Select the purchase date";
    if (!rows.some((r) => r.productId))
      e.items = "Add at least one product to the bill";

    rows.forEach((r, i) => {
      const n = i + 1;
      if (!r.productId)
        e[`${r.key}.product`] =
          `Item ${n}: select a product or remove the item`;
      if (num(r.basePrice) <= 0)
        e[`${r.key}.base`] = `Item ${n}: enter the base price`;
      if (num(r.gstPercent) > 100)
        e[`${r.key}.gst`] = `Item ${n}: GST % can't be more than 100`;
      if (num(r.qty) <= 0) e[`${r.key}.qty`] = `Item ${n}: enter the quantity`;
    });

    const d = num(discountValue);
    if (discountType === "percent" && d > 100)
      e.discount = "Discount % can't be more than 100";
    if (discountType === "amount" && d > totals.itemsTotal)
      e.discount = "Discount can't be more than the items total";

    return e;
  };

  const rowErrorCount = Object.keys(errors).filter((k) =>
    k.includes("."),
  ).length;

  // ---------- Save ----------

  const save = async () => {
    if (saving || loadingPurchase) return;

    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(Object.values(e)[0]);
      scrollToFirstError();
      return;
    }

    setSaving(true);
    try {
      const u = getUserProfile();
      const financialYearRaw = localStorage.getItem("financial_year");
      const financialYear = financialYearRaw
        ? JSON.parse(financialYearRaw)
        : null;

      if (!financialYear?.key) {
        toast.error("Financial year not set. Please sign in again.");
        return;
      }

      const payload = {
        type: isEdit ? 3 : 1,
        purchase_id: isEdit ? Number(id) : 0,
        company_id: u.company_id,
        franchise_id: u.franchise_id,
        financial_year_id: financialYear.key,
        employee_id: u.employee_id ?? u.user_id ?? 0,
        bill_number: billNo.trim(),
        purchase_date: date,
        vendor_id: Number(vendorId),
        remark: remark.trim(),
        discount_type: discountType,
        discount_value: num(discountValue),
        items: rows.map((r) => ({
          product_id: Number(r.productId),
          price: num(r.basePrice), // per unit, excl. GST
          gst_percent: num(r.gstPercent),
          qty: num(r.qty),
        })),
      };

      const res = await axios.post(`${API_URL}purchase.php`, payload);
      console.log("Save purchase response:", res);
      if (res.data.status === "success") {
        const balance = Number(res.data.vendor_outstanding);
        toast.success(isEdit ? "Purchase updated" : "Purchase saved", {
          description: Number.isFinite(balance)
            ? `${selectedVendor?.name ?? "Vendor"} outstanding: ${inr(balance)}`
            : undefined,
        });
        navigate("/purchases");
      } else {
        toast.error(res.data.message || "Couldn't save the purchase");
      }
    } catch (err) {
      console.error("Error saving purchase:", err);
      toast.error(apiError(err, "Couldn't save the purchase. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const title = isEdit ? "Edit Purchase" : "Add Purchase";
  const saveText = saving
    ? "Saving…"
    : isEdit
      ? "Update Purchase"
      : "Save Purchase";

  // Bigger touch targets + 16px text (stops iOS zoom on focus)
  const touch = isMobile ? "h-11 text-base" : "";

  // ---------- Sections ----------

  const headerFields = (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 md:grid-cols-3",
        isMobile && "gap-4 rounded-2xl border border-border bg-card p-4",
      )}
    >
      <Field label="Bill No." htmlFor="bill-no" required error={errors.billNo}>
        <Input
          id="bill-no"
          value={billNo}
          onChange={(e) => {
            setBillNo(e.target.value);
            clearErrors(["billNo"]);
          }}
          placeholder="PUR-105"
          aria-invalid={!!errors.billNo}
          className={cn(touch, errors.billNo && "border-destructive")}
        />
      </Field>

      <Field label="Vendor" htmlFor="vendor" required error={errors.vendor}>
        <SearchableSelect
          id="vendor"
          value={vendorId}
          onChange={(v) => {
            setVendorId(v);
            clearErrors(["vendor"]);
          }}
          options={vendorOptions}
          placeholder={loadingVendors ? "Loading vendors…" : "Select vendor"}
          searchPlaceholder="Search by name or mobile"
          emptyText="No vendor found"
          addLabel="Add new vendor"
          onAddNew={(name) => setVendorDialog({ open: true, name })}
          invalid={!!errors.vendor}
          loading={loadingVendors}
          className={touch}
        />
        {selectedVendor && !errors.vendor && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className="text-muted-foreground">
              Outstanding {inr(selectedVendor.outstanding)}
            </span>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-400">
              After this bill {inr(outstandingAfter)}
            </span>
          </div>
        )}
      </Field>

      <Field label="Date" htmlFor="purchase-date" required error={errors.date}>
        <DatePicker
          id="purchase-date"
          value={date}
          onChange={(v) => {
            setDate(v);
            clearErrors(["date"]);
          }}
          disableFuture
          invalid={!!errors.date}
          className={touch}
        />
      </Field>
    </div>
  );

  const productSelect = (r: PurchaseRow) => (
    <SearchableSelect
      value={r.productId}
      onChange={(v) => {
        const p = products.find((x) => x.id === v);
        if (p) applyProduct(r.key, p);
      }}
      options={productOptionsFor(r.key)}
      placeholder={loadingProducts ? "Loading…" : "Select product"}
      searchPlaceholder="Search product or SKU"
      emptyText="No product found"
      addLabel="Add new product"
      onAddNew={(name) => setProductDialog({ open: true, name, rowKey: r.key })}
      invalid={!!rowErr(r.key, "product")}
      loading={loadingProducts}
      className={isMobile ? "h-11 text-base" : "h-9"}
    />
  );

  const basePriceInput = (r: PurchaseRow, idx: number, className: string) => (
    <Input
      inputMode="decimal"
      value={r.basePrice}
      onChange={(e) =>
        patchRow(r.key, { basePrice: decimal(e.target.value) }, ["base"])
      }
      placeholder="0.00"
      aria-label={`Base price, item ${idx + 1}`}
      aria-invalid={!!rowErr(r.key, "base")}
      className={cn(className, rowErr(r.key, "base") && "border-destructive")}
    />
  );

  const gstInput = (r: PurchaseRow, idx: number, className: string) => (
    <Input
      inputMode="decimal"
      value={r.gstPercent}
      onChange={(e) =>
        patchRow(r.key, { gstPercent: decimal(e.target.value) }, ["gst"])
      }
      placeholder="0"
      aria-label={`GST percent, item ${idx + 1}`}
      aria-invalid={!!rowErr(r.key, "gst")}
      className={cn(className, rowErr(r.key, "gst") && "border-destructive")}
    />
  );

  const errorNote = (
    <>
      {errors.items && (
        <p className="text-xs text-destructive">{errors.items}</p>
      )}
      {!errors.items && rowErrorCount > 0 && (
        <p className="text-xs text-destructive">
          Fill the highlighted fields. Product, Base Price and Qty are required
          for every item.
        </p>
      )}
    </>
  );

  // Desktop / tablet: table
  const itemsTable = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold">
          Items{" "}
          <span className="font-normal text-muted-foreground">
            ({rows.length})
          </span>
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          className="gap-1"
        >
          <Plus className="h-3.5 w-3.5" /> Add Item
        </Button>
      </div>

      <div
        className={cn(
          "overflow-x-auto rounded-xl border border-border",
          errors.items && "border-destructive",
        )}
      >
        <table className="w-full text-xs md:text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="w-[30%] min-w-[220px] px-2 py-2 font-display font-semibold">
                Product <span className="text-destructive">*</span>
              </th>
              <th className="px-2 py-2 font-display font-semibold">
                Base Price <span className="text-destructive">*</span>
              </th>
              <th className="px-2 py-2 font-display font-semibold">GST %</th>
              <th className="px-2 py-2 font-display font-semibold">Price</th>
              <th className="px-2 py-2 font-display font-semibold">
                Qty <span className="text-destructive">*</span>
              </th>
              <th className="px-2 py-2 text-right font-display font-semibold">
                Total
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const { price, gst, total } = rowCalc(r);
              return (
                <tr
                  key={r.key}
                  id={`item-${r.key}`}
                  className="border-t border-border"
                >
                  <td className="px-2 py-1.5">{productSelect(r)}</td>
                  <td className="px-2 py-1.5">
                    {basePriceInput(r, idx, "h-9 w-28")}
                  </td>
                  <td className="px-2 py-1.5">
                    {gstInput(r, idx, "h-9 w-20")}
                  </td>
                  <td className="px-2 py-1.5">
                    <div
                      className="flex h-9 w-28 items-center rounded-md border border-dashed border-border bg-muted/40 px-3 text-muted-foreground"
                      title="Base Price + GST %"
                    >
                      {inr(price)}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      inputMode="decimal"
                      value={r.qty}
                      onChange={(e) =>
                        patchRow(r.key, { qty: decimal(e.target.value) }, [
                          "qty",
                        ])
                      }
                      aria-label={`Quantity, item ${idx + 1}`}
                      aria-invalid={!!rowErr(r.key, "qty")}
                      className={cn(
                        "h-9 w-20",
                        rowErr(r.key, "qty") && "border-destructive",
                      )}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <div className="font-display font-semibold">
                      {inr(total)}
                    </div>
                    {gst > 0 && (
                      <div className="text-[11px] text-muted-foreground">
                        incl. {inr(gst)} GST
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => removeRow(r.key)}
                      disabled={rows.length === 1}
                      className="rounded p-1 text-muted-foreground hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                      aria-label={`Remove item ${idx + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {errorNote}
    </div>
  );

  // Mobile: one card per item, no horizontal scroll
  const itemsCards = (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="font-display text-base font-semibold">
          Items{" "}
          <span className="font-normal text-muted-foreground">
            ({rows.length})
          </span>
        </h3>
      </div>

      {rows.map((r, idx) => {
        const { price, gst, total } = rowCalc(r);
        const hasError = ["product", "base", "gst", "qty"].some((f) =>
          rowErr(r.key, f),
        );
        return (
          <div
            key={r.key}
            id={`item-${r.key}`}
            className={cn(
              "rounded-2xl border border-border bg-card p-3 shadow-sm",
              hasError && "border-destructive/60",
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">
                Item {idx + 1}
              </span>
              <button
                type="button"
                onClick={() => removeRow(r.key)}
                disabled={rows.length === 1}
                className="-mr-1 flex h-9 w-9 touch-manipulation items-center justify-center rounded-full text-muted-foreground active:bg-destructive/10 active:text-destructive disabled:opacity-30"
                aria-label={`Remove item ${idx + 1}`}
              >
                <Trash2 className="h-[18px] w-[18px]" />
              </button>
            </div>

            {productSelect(r)}

            <div className="mt-3 grid grid-cols-2 gap-3">
              <MobileField label="Base Price" required>
                {basePriceInput(r, idx, "h-11 text-base")}
              </MobileField>
              <MobileField label="GST %">
                {gstInput(r, idx, "h-11 text-base")}
              </MobileField>
              <MobileField label="Price">
                <div className="flex h-11 items-center rounded-md border border-dashed border-border bg-muted/40 px-3 text-base text-muted-foreground">
                  {inr(price)}
                </div>
              </MobileField>
              <MobileField label="Qty" required>
                <div
                  className={cn(
                    "flex h-11 items-center overflow-hidden rounded-md border border-input bg-background",
                    rowErr(r.key, "qty") && "border-destructive",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => stepQty(r.key, -1)}
                    className="flex h-full w-10 shrink-0 touch-manipulation items-center justify-center text-muted-foreground active:bg-muted"
                    aria-label={`Decrease quantity, item ${idx + 1}`}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    inputMode="decimal"
                    value={r.qty}
                    onChange={(e) =>
                      patchRow(r.key, { qty: decimal(e.target.value) }, ["qty"])
                    }
                    aria-label={`Quantity, item ${idx + 1}`}
                    aria-invalid={!!rowErr(r.key, "qty")}
                    className="h-full w-full min-w-0 bg-transparent text-center text-base font-semibold outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => stepQty(r.key, 1)}
                    className="flex h-full w-10 shrink-0 touch-manipulation items-center justify-center text-primary active:bg-muted"
                    aria-label={`Increase quantity, item ${idx + 1}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </MobileField>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5">
              <span className="text-xs text-muted-foreground">
                {gst > 0 ? `Line total, incl. ${inr(gst)} GST` : "Line total"}
              </span>
              <span className="font-display text-base font-bold">
                {inr(total)}
              </span>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addRow}
        className="flex h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/30 text-sm font-semibold text-primary transition-transform active:scale-[0.98] active:bg-primary/5"
      >
        <Plus className="h-4 w-4" /> Add another item
      </button>
      {errorNote}
    </div>
  );

  const remarkField = (
    <div
      className={cn(isMobile && "rounded-2xl border border-border bg-card p-4")}
    >
      <Label htmlFor="remark" className="text-xs">
        Remark / Notes
      </Label>
      <Textarea
        id="remark"
        value={remark}
        onChange={(e) => setRemark(e.target.value)}
        rows={isMobile ? 3 : 4}
        placeholder="Optional"
        className={cn("mt-1", isMobile && "text-base")}
      />
    </div>
  );

  const summary = (
    <div
      className={cn(
        "space-y-2 rounded-2xl border border-border p-4",
        isMobile ? "bg-card" : "bg-muted/30",
      )}
    >
      <SummaryRow label="Subtotal (Excl. GST)" value={totals.sub} />
      <SummaryRow label="GST" value={totals.gst} />
      <SummaryRow label="Items Total" value={totals.itemsTotal} bold />

      {/* Discount: % / ₹ toggle + one input */}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-2 text-sm">
        <span className="text-muted-foreground">Discount</span>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Discount type"
            className="inline-flex rounded-lg border border-border bg-background p-0.5"
          >
            {(["percent", "amount"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={discountType === t}
                onClick={() => {
                  setDiscountType(t);
                  clearErrors(["discount"]);
                }}
                className={cn(
                  "rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isMobile ? "h-9 w-10" : "h-7 w-8",
                  discountType === t
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "percent" ? "%" : "₹"}
              </button>
            ))}
          </div>
          <Input
            inputMode="decimal"
            value={discountValue}
            onChange={(e) => {
              setDiscountValue(decimal(e.target.value));
              clearErrors(["discount"]);
            }}
            placeholder="0"
            aria-label={
              discountType === "percent"
                ? "Discount percent"
                : "Discount amount in rupees"
            }
            aria-invalid={!!errors.discount}
            className={cn(
              "w-24 bg-muted/50 text-right",
              isMobile ? "h-10 text-base" : "h-9",
              errors.discount && "border-destructive",
            )}
          />
        </div>
      </div>
      {errors.discount && (
        <p className="text-right text-xs text-destructive">{errors.discount}</p>
      )}
      {totals.discount > 0 && (
        <SummaryRow
          label={
            discountType === "percent"
              ? `Discount applied (${num(discountValue)}%)`
              : "Discount applied"
          }
          value={-totals.discount}
          className="text-destructive"
        />
      )}

      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="font-display font-bold">Grand Total</span>
        <span className="font-display text-2xl font-bold text-primary">
          {inr(totals.grand)}
        </span>
      </div>
    </div>
  );

  const loader = (
    <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      Loading purchase…
    </div>
  );

  const dialogs = (
    <>
      <QuickAddVendorDialog
        open={vendorDialog.open}
        defaultName={vendorDialog.name}
        onOpenChange={(open) => setVendorDialog((d) => ({ ...d, open }))}
        onCreated={(v: CreatedVendor) => {
          setVendors((vs) => [{ ...v, outstanding: 0 }, ...vs]);
          setVendorId(v.id);
          clearErrors(["vendor"]);
        }}
      />
      <QuickAddProductDialog
        open={productDialog.open}
        defaultName={productDialog.name}
        onOpenChange={(open) => setProductDialog((d) => ({ ...d, open }))}
        onCreated={(p) => {
          setProducts((ps) => [p, ...ps]);
          if (productDialog.rowKey) applyProduct(productDialog.rowKey, p);
        }}
      />
    </>
  );

  // ---------- Mobile layout (app-like, save button at the bottom) ----------

  if (isMobile) {
    return (
      <>
        <div className="px-4 pb-36 pt-2">
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/purchases")}
              aria-label="Back to purchases"
              className="-ml-2 flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full active:bg-muted"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate font-display text-xl font-bold">
                {title}
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Enter purchase invoice details
              </p>
            </div>
          </div>

          {loadingPurchase ? (
            loader
          ) : (
            <div className="space-y-4">
              {headerFields}
              {itemsCards}
              {summary}
              {remarkField}
            </div>
          )}
        </div>

        {/* Sticky bottom action bar */}
        <div
          className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-background/95 px-4 pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur supports-[backdrop-filter]:bg-background/85"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground">
                Grand total, {filledItems}{" "}
                {filledItems === 1 ? "item" : "items"}
              </p>
              <p className="truncate font-display text-lg font-bold text-primary">
                {inr(totals.grand)}
              </p>
            </div>
            <Button
              type="button"
              onClick={save}
              disabled={saving || loadingPurchase}
              className="h-12 min-w-[150px] touch-manipulation rounded-xl text-base font-semibold transition-transform active:scale-[0.97]"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saveText}
            </Button>
          </div>
        </div>

        {dialogs}
      </>
    );
  }

  // ---------- Desktop / tablet layout ----------

  return (
    <FormPage
      title={title}
      subtitle="Enter purchase invoice details"
      onSave={save}
      saveLabel={saveText}
      backTo="/purchases"
    >
      {loadingPurchase ? (
        loader
      ) : (
        <div className="space-y-6">
          {headerFields}
          {itemsTable}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {remarkField}
            {summary}
          </div>
        </div>
      )}
      {dialogs}
    </FormPage>
  );
};

// ---------- Small UI pieces ----------

const Field = ({
  label,
  htmlFor,
  required,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) => (
  <div>
    <Label htmlFor={htmlFor} className="text-xs">
      {label} {required && <span className="text-destructive">*</span>}
    </Label>
    <div className="mt-1">{children}</div>
    {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
  </div>
);

const MobileField = ({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) => (
  <div className="min-w-0">
    <span className="mb-1 block text-xs text-muted-foreground">
      {label} {required && <span className="text-destructive">*</span>}
    </span>
    {children}
  </div>
);

const SummaryRow = ({
  label,
  value,
  bold,
  className,
}: {
  label: string;
  value: number;
  bold?: boolean;
  className?: string;
}) => (
  <div className={cn("flex items-center justify-between text-sm", className)}>
    <span className={cn(!className && "text-muted-foreground")}>{label}</span>
    <span className={cn("font-display", bold && "font-bold")}>
      {inr(value)}
    </span>
  </div>
);

export default AddPurchase;
