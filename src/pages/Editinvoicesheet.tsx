// src/components/sales/EditInvoiceSheet.tsx
import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Minus, X, Search } from "lucide-react";
import { toast } from "sonner";
import { SellService, SellItemPayload } from "@/services/sell.service";
import { ProductService } from "@/services/product.service";

interface InvoiceItem {
  product_id: number;
  product_name: string;
  single_product_price: number;
  qty: number;
  cgst: number;
  sgst: number;
  available_stock: number;
}

interface ProductOption {
  id: number;
  name: string;
  final_amount: number;
  cgst: number;
  sgst: number;
  stock: number;
}

const getUserProfile = () =>
  JSON.parse(localStorage.getItem("company_data") || "{}");

const roundOff = (v: number) =>
  v - Math.floor(v) < 0.5 ? Math.floor(v) : Math.ceil(v);

interface EditInvoiceSheetProps {
  sellId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called after a successful save, so the caller can refresh its list.
  onSaved?: () => void;
}

const EditInvoiceSheet = ({
  sellId,
  open,
  onOpenChange,
  onSaved,
}: EditInvoiceSheetProps) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [discountType, setDiscountType] = useState<"%" | "₹">("₹");
  const [discountValue, setDiscountValue] = useState(0);
  const [paid, setPaid] = useState(0);
  const [items, setItems] = useState<InvoiceItem[]>([]);

  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  // Load the bill (header + line items) whenever the sheet opens for a given sellId
  useEffect(() => {
    if (!open || !sellId) return;

    const load = async () => {
      setLoading(true);
      try {
        const userProfile = getUserProfile();
        const res = await SellService.getSale(
          sellId,
          userProfile.company_id,
          userProfile.franchise_id,
        );

        if (res.status === "success" && res.data) {
          const d = res.data;
          setBillNo(d.sell_bill_number);
          setBillDate(d.sell_date);
          setCustomerName(d.sell_customer_name || "");
          setCustomerMobile(d.sell_customer_number || "");
          setPaymentMode(d.sell_payment_mode || "Cash");
          setDiscountType("₹");
          setDiscountValue(Number(d.sell_total_discount_amount) || 0);
          setPaid(Number(d.sales_total_paid_amount) || 0);
          setItems(
            (d.items || []).map((it) => ({
              product_id: Number(it.sell_details_product_id),
              product_name:
                it.product_name || `Product #${it.sell_details_product_id}`,
              single_product_price:
                Number(it.sell_details_single_product_price) || 0,
              qty: Number(it.sell_details_product_qty) || 0,
              cgst: Number(it.sell_details_product_cgst) || 0,
              sgst: Number(it.sell_details_product_sgst) || 0,
              available_stock:
                Number(it.sell_details_product_avalable_stock) || 0,
            })),
          );
        } else {
          toast.error(res.message || "Failed to load invoice");
          onOpenChange(false);
        }
      } catch (error) {
        console.error("Error loading invoice:", error);
        toast.error("Failed to load invoice. Please try again.");
        onOpenChange(false);
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sellId]);

  // Load the product catalog once per sheet-open, for the "Add Product" search
  useEffect(() => {
    if (!open || productOptions.length) return;

    const loadProducts = async () => {
      try {
        const userProfile = getUserProfile();
        const res = await ProductService.getProducts(
          userProfile.company_id,
          userProfile.franchise_id,
        );
        if (res.status === "success" && res.data) {
          setProductOptions(
            res.data.map((p: any) => ({
              id: p.product_id,
              name: p.product_name,
              final_amount: Number(p.product_final_amount) || 0,
              cgst: Number(p.product_cgst) || 0,
              sgst: Number(p.product_sgst) || 0,
              stock: Number(p.product_stock) || 0,
            })),
          );
        }
      } catch (error) {
        console.error("Error loading products:", error);
      }
    };

    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const subtotal = items.reduce(
    (s, i) => s + i.single_product_price * i.qty,
    0,
  );
  const discountAmount = Math.min(
    Math.max(
      discountType === "%" ? (subtotal * discountValue) / 100 : discountValue,
      0,
    ),
    subtotal,
  );
  const total = roundOff(subtotal - discountAmount);
  const balance = total - paid;

  const addProduct = (p: ProductOption) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          product_id: p.id,
          product_name: p.name,
          single_product_price: p.final_amount,
          qty: 1,
          cgst: p.cgst,
          sgst: p.sgst,
          available_stock: p.stock,
        },
      ];
    });
    setProductSearch("");
    setAddOpen(false);
  };

  const updateQty = (productId: number, delta: number) => {
    setItems((prev) =>
      prev
        .map((i) =>
          i.product_id === productId
            ? { ...i, qty: Math.max(0, i.qty + delta) }
            : i,
        )
        .filter((i) => i.qty > 0),
    );
  };

  const removeItem = (productId: number) => {
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  };

  const filteredProducts = productOptions.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()),
  );

  const handleSave = async () => {
    if (!sellId) return;
    if (!items.length) return toast.error("Bill must have at least one item");

    const userProfile = getUserProfile();
    if (!userProfile?.company_id || !userProfile?.franchise_id) {
      return toast.error("Company data missing. Please sign in again.");
    }

    // Same proportional-split approach used when the bill was created, so the
    // per-line totals stay roughly in sync with the bill-level discount.
    const payloadItems: SellItemPayload[] = items.map((i) => {
      const lineAmount = i.single_product_price * i.qty;
      const lineShare = subtotal > 0 ? lineAmount / subtotal : 0;
      const lineDiscount = discountAmount * lineShare;
      return {
        product_id: i.product_id,
        single_product_price: i.single_product_price,
        qty: i.qty,
        cgst: i.cgst,
        sgst: i.sgst,
        available_stock: i.available_stock,
        discount_type: "₹",
        discount: Number(lineDiscount.toFixed(2)),
      };
    });

    setSaving(true);
    try {
      const res = await SellService.updateSell(sellId, {
        company_id: userProfile.company_id,
        franchise_id: userProfile.franchise_id,
        sell_date: billDate,
        sell_total_amount: total,
        sell_total_discount_amount: discountAmount,
        sales_total_paid_amount: paid,
        sales_total_remainng_amount: balance,
        customer_mobile: customerMobile,
        customer_name: customerName || "Walk-in",
        payment_mode: paymentMode,
        items: payloadItems,
      });

      if (res.status === "success") {
        toast.success("Invoice updated");
        onOpenChange(false);
        onSaved?.();
      } else {
        toast.error(res.message || "Failed to update invoice");
      }
    } catch (error) {
      console.error("Error updating invoice:", error);
      toast.error("Failed to update invoice. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-display">Edit Invoice</SheetTitle>
          <SheetDescription>
            Update bill details, items, and payment
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading invoice...
          </div>
        ) : (
          <div className="mt-5 space-y-6 pb-4">
            {/* Invoice info */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Invoice Details
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Bill No.</Label>
                  <Input
                    value={billNo}
                    disabled
                    className="mt-1.5 font-display"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Date</Label>
                  <Input
                    type="date"
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </div>
            </div>

            {/* Customer */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Customer
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Mobile No.</Label>
                  <Input
                    value={customerMobile}
                    onChange={(e) => setCustomerMobile(e.target.value)}
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10-digit (optional)"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Name</Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Walk-in"
                    className="mt-1.5"
                  />
                </div>
              </div>
            </div>

            {/* Products */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Products
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setAddOpen((v) => !v)}
                >
                  <Plus className="h-3 w-3" />
                  Add Product
                </Button>
              </div>

              {addOpen && (
                <div className="space-y-2 rounded-lg border p-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Search products..."
                      className="h-8 pl-8 text-xs"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {filteredProducts.length === 0 ? (
                      <p className="px-1 py-2 text-xs text-muted-foreground">
                        No products found
                      </p>
                    ) : (
                      filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addProduct(p)}
                          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                        >
                          <span className="truncate">{p.name}</span>
                          <span className="ml-2 shrink-0 font-display font-semibold">
                            ₹{p.final_amount}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {items.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                  No items in this bill
                </div>
              ) : (
                <div className="divide-y rounded-lg border">
                  {items.map((i) => (
                    <div
                      key={i.product_id}
                      className="flex items-center justify-between gap-2 p-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {i.product_name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          ₹{i.single_product_price} × {i.qty}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center rounded-md border">
                        <button
                          type="button"
                          onClick={() => updateQty(i.product_id, -1)}
                          className="p-1.5 hover:bg-muted"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="px-2.5 font-display text-xs font-semibold">
                          {i.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQty(i.product_id, 1)}
                          className="p-1.5 hover:bg-muted"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="w-16 shrink-0 text-right font-display text-sm font-bold">
                        ₹{i.single_product_price * i.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(i.product_id)}
                        className="shrink-0 text-muted-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payment */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Payment
              </p>

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
                      className={`px-2.5 py-1 text-[11px] font-display font-semibold transition-colors ${
                        discountType === t
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <Input
                  type="number"
                  min={0}
                  value={discountValue || ""}
                  onChange={(e) => setDiscountValue(Number(e.target.value))}
                  className="h-7 w-20 text-xs"
                />
              </div>

              <div>
                <Label className="mb-1.5 block text-xs font-semibold">
                  Payment Mode
                </Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {["Cash", "Card", "UPI"].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMode(m)}
                      className={`rounded-md border-2 py-2 text-xs font-medium transition-colors ${
                        paymentMode === m
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Amount Paid</Label>
                <Input
                  type="number"
                  value={paid || ""}
                  onChange={(e) => setPaid(Number(e.target.value))}
                  className="mt-1.5 font-display"
                />
              </div>

              <div className="space-y-1.5 rounded-lg bg-muted/50 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-display">₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-display text-success">
                    -₹{discountAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-1.5 text-base font-bold">
                  <span>Total</span>
                  <span className="font-display text-primary">₹{total}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Balance Due</span>
                  <span
                    className={`font-display font-semibold ${balance > 0 ? "text-warning" : "text-success"}`}
                  >
                    ₹{balance.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && (
          <div className="mt-2 flex justify-end gap-2 border-t pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="min-w-[130px]"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default EditInvoiceSheet;
