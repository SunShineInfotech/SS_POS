import { useEffect, useMemo, useState } from "react";
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
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Search,
  Plus,
  Minus,
  User,
  Grid3X3,
  Pause,
  Printer,
  X,
  ShoppingCart,
  ChevronDown,
  Save,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { loadStore, saveStore } from "@/lib/store";
import axios from "axios";

interface Product {
  id: number;
  name: string;
  category_name: string;
  final_amount: number;
  stock: number;
  is_active: number;
}
interface CartItem extends Product {
  qty: number;
  discountType: "%" | "₹";
  discountValue: number;
}

interface InvoiceDetails {
  date: string;
  mobile: string;
  name: string;
  email: string;
  state: string;
  address: string;
  pincode: string;
  bankAccount: string;
  gstNumber: string;
  remark: string;
}

interface DraftInvoice {
  id: number;
  details: InvoiceDetails;
  cart: CartItem[];
  billDiscountType: "%" | "₹";
  billDiscountValue: number;
  shipping: number;
  labour: number;
  paid: number;
  amount: number;
  status: string;
}

interface TableRow {
  id: number;
  table_no: string;
  franchise_name: string;
  table_status: number;
  table_capacity: number;
}

const DRAFT_KEY = "pos-drafts";

const states = [
  "Gujarat",
  "Maharashtra",
  "Delhi",
  "Karnataka",
  "Tamil Nadu",
  "Rajasthan",
  "Uttar Pradesh",
  "West Bengal",
  "Madhya Pradesh",
  "Punjab",
];

const bankAccounts = [
  "HDFC Bank — 5521 (GST 24AAAAA0000A1Z5)",
  "ICICI Bank — 8890 (GST 24AAAAA0000A1Z5)",
  "SBI Current — 1123 (Non-GST)",
  "Cash Counter",
];

const roundOff = (v: number): number =>
  v - Math.floor(v) < 0.5 ? Math.floor(v) : Math.ceil(v);

const emptyDetails = (): InvoiceDetails => ({
  date: new Date().toISOString().split("T")[0],
  mobile: "",
  name: "",
  email: "",
  state: "",
  address: "",
  pincode: "",
  bankAccount: "",
  gstNumber: "",
  remark: "",
});

const API_URL =
  import.meta.env.VITE_API_URL || "https://sunshineproduct.in/POS/v1_api/";
const getUserProfile = () =>
  JSON.parse(localStorage.getItem("company_data") || "{}");
const POS = () => {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [billDiscountType, setBillDiscountType] = useState<"%" | "₹">("₹");
  const [billDiscountValue, setBillDiscountValue] = useState(0);
  const [selectedTable, setSelectedTable] = useState("");
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  const [details, setDetails] = useState<InvoiceDetails>(emptyDetails);
  const [shipping, setShipping] = useState(0);
  const [labour, setLabour] = useState(0);
  const [paid, setPaid] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [drafts, setDrafts] = useState<DraftInvoice[]>(() =>
    loadStore<DraftInvoice>(DRAFT_KEY, []),
  );
  const [draftListOpen, setDraftListOpen] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<number | null>(null);
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [productData, setProductData] = useState<Product[]>([]);
  const categories = [
    "All",
    ...Array.from(new Set(productData.map((p: any) => p.category_name))),
  ];
  // Get the Table details
  const fetchTables = async () => {
    try {
      const userProfile = getUserProfile();

      const res = await axios.post(`${API_URL}table_master.php`, {
        type: 2,
        company_id: userProfile.company_id,
        franchise_id: userProfile.franchise_id,
      });

      console.log("Fetch Tables Response:", res.data);
      if (res.data.status === "success") {
        const tempData = res.data.data
          .map((item: any) => ({
            id: item.table_id,
            table_no: item.table_no,
            franchise_name: item.franchise_name,
            table_status: item.table_status,
            table_capacity: item.table_Capacity,
          }))
          .sort((a: TableRow, b: TableRow) =>
            a.table_no.localeCompare(b.table_no, undefined, { numeric: true }),
          );
        setTableData(tempData);
      } else {
        toast.error(res.data.message || "Failed to fetch tables");
      }
    } catch (error) {
      console.error("Error fetching tables:", error);
      toast.error("Failed to fetch tables. Please try again.");
    }
  };

  // Get the Product details
  const fetchProducts = async () => {
    try {
      const userProfile = getUserProfile();
      const res = await axios.post(`${API_URL}product.php`, {
        type: 6,
        company_id: userProfile.company_id,
        franchise_id: userProfile.franchise_id,
      });

      console.log("Fetch Products Response:", res.data);
      if (res.data.status === "success") {
        const tempData = res.data.data.map((item: any) => ({
          id: item.product_id,
          name: item.product_name,
          category_name: item.category_name,
          final_amount: item.product_final_amount,
          // stock: item.product_stock,
          is_active: item.product_is_active,
        }));
        setProductData(tempData);
      } else {
        toast.error(res.data.message || "Failed to fetch products");
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Failed to fetch products. Please try again.");
    }
  };

  useEffect(() => {
    saveStore(DRAFT_KEY, drafts);
    fetchTables();
    fetchProducts();
  }, [drafts]);

  const setField = (key: keyof InvoiceDetails, value: string) =>
    setDetails((d) => ({ ...d, [key]: value }));

  const filteredProducts = useMemo(
    () =>
      productData.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) &&
          (selectedCategory === "All" || p.category_name === selectedCategory),
      ),
    [search, selectedCategory, productData],
  );

  const addToCart = (product: Product) => {
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
  };

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

  const grossSubtotal = useMemo(
    () => cart.reduce((s, i) => s + i.final_amount * i.qty, 0),
    [cart],
  );

  const itemDiscount = useMemo(
    () =>
      cart.reduce((sum, item) => {
        const itemTotal = item.final_amount * item.qty;
        return (
          sum +
          (item.discountType === "%"
            ? (itemTotal * item.discountValue) / 100
            : item.discountValue)
        );
      }, 0),
    [cart],
  );

  const subtotal = grossSubtotal - itemDiscount;

  const billDiscount = useMemo(
    () =>
      billDiscountType === "%"
        ? (subtotal * billDiscountValue) / 100
        : billDiscountValue,
    [subtotal, billDiscountType, billDiscountValue],
  );

  const totalDiscount = itemDiscount + billDiscount;
  const finalTotal = roundOff(
    Math.max(grossSubtotal - totalDiscount, 0) + shipping + labour,
  );
  const dueAmount = finalTotal - paid;
  const total = finalTotal;
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const resetInvoice = () => {
    setCart([]);
    setDetails(emptyDetails());
    setBillDiscountType("₹");
    setBillDiscountValue(0);
    setShipping(0);
    setLabour(0);
    setPaid(0);
    setEditingDraftId(null);
  };

  const saveDraft = () => {
    if (!cart.length) return toast.error("Cart is empty");
    const draft: DraftInvoice = {
      id: editingDraftId ?? Date.now(),
      details,
      cart,
      billDiscountType,
      billDiscountValue,
      shipping,
      labour,
      paid,
      amount: finalTotal,
      status: paid >= finalTotal ? "Paid" : paid > 0 ? "Partial" : "Draft",
    };
    setDrafts((d) => [draft, ...d.filter((x) => x.id !== draft.id)]);
    toast.success("Invoice saved to Save List");
    resetInvoice();
  };

  const openDraft = (draft: DraftInvoice) => {
    setCart(draft.cart);
    setDetails(draft.details);
    setBillDiscountType(draft.billDiscountType);
    setBillDiscountValue(draft.billDiscountValue);
    setShipping(draft.shipping);
    setLabour(draft.labour);
    setPaid(draft.paid);
    setEditingDraftId(draft.id);
    setDraftListOpen(false);
    setMobileCartOpen(true);
    toast.success("Draft loaded — you can edit and finalise it");
  };

  const finalise = () => {
    if (!cart.length) return toast.error("Cart is empty");
    if (editingDraftId)
      setDrafts((d) => d.filter((x) => x.id !== editingDraftId));
    toast.success(`Invoice completed — ₹${finalTotal}`);
    resetInvoice();
  };

  const holdBill = () => {
    if (!cart.length) return toast.error("Cart is empty");
    saveDraft();
  };

  const numberField = (
    label: string,
    value: number,
    onChange: (n: number) => void,
  ) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        type="number"
        min={0}
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value))}
        placeholder="0"
        className="h-7 w-24 text-xs text-right font-display"
      />
    </div>
  );

  const DraftList = (
    <div className="space-y-2">
      {drafts.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No saved invoices
        </div>
      ) : (
        drafts.map((d) => (
          <button
            key={d.id}
            onClick={() => openDraft(d)}
            className="w-full text-left rounded-xl border border-border bg-card p-3 hover:border-primary transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold truncate">
                  {d.details.name || "Walk-in customer"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {d.details.date} · {d.cart.length} items
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-display text-sm font-bold text-primary">
                  ₹{d.amount}
                </p>
                <span
                  className={`text-[10px] font-medium ${
                    d.status === "Paid"
                      ? "text-success"
                      : d.status === "Partial"
                        ? "text-warning"
                        : "text-muted-foreground"
                  }`}
                >
                  {d.status}
                </span>
              </div>
            </div>
          </button>
        ))
      )}
    </div>
  );

  const CartContent = () => (
    <div className="flex flex-col h-full bg-card overflow-y-auto md:overflow-hidden">
      {/* Cart header */}
      <div className="p-4 border-b border-border space-y-2 bg-gradient-to-r from-primary/5 to-accent/5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-bold tracking-tight">
            {editingDraftId ? "Editing Saved Invoice" : "Current Order"}
          </h2>
          <span className="font-display text-xs text-muted-foreground">
            {cart.length} items
          </span>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Customer Name"
              value={details.name}
              onChange={(e) => setField("name", e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <div className="flex-1">
            <Select value={selectedTable} onValueChange={setSelectedTable}>
              <SelectTrigger className="h-8 text-xs">
                <Grid3X3 className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Select Table" />
              </SelectTrigger>
              <SelectContent>
                {tableData.map((table) => (
                  <SelectItem
                    key={table.id}
                    value={table.table_no}
                    onSelect={() => setSelectedTable(table.id.toString())}
                  >
                    {table.table_no} —{" "}
                    {Number(table.table_status) === 1
                      ? "Free"
                      : Number(table.table_status) === 2
                        ? "Occupied"
                        : Number(table.table_status) === 3
                          ? "Reserved"
                          : "Unknown"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Invoice details */}
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium">
            Invoice & Customer Details
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">
                  Date
                </Label>
                <Input
                  type="date"
                  value={details.date}
                  onChange={(e) => setField("date", e.target.value)}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">
                  Customer Mobile No
                </Label>
                <Input
                  value={details.mobile}
                  onChange={(e) => setField("mobile", e.target.value)}
                  inputMode="numeric"
                  maxLength={10}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
              <div className="col-span-2" style={{ display: "none" }}>
                <Label className="text-[10px] text-muted-foreground">
                  Customer Email
                </Label>
                <Input
                  type="email"
                  value={details.email}
                  onChange={(e) => setField("email", e.target.value)}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
              <div style={{ display: "none" }}>
                <Label className="text-[10px] text-muted-foreground">
                  State
                </Label>
                <Select
                  value={details.state}
                  onValueChange={(v) => setField("state", v)}
                >
                  <SelectTrigger className="h-8 text-xs mt-0.5">
                    <SelectValue placeholder="Select State" />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div style={{ display: "none" }}>
                <Label className="text-[10px] text-muted-foreground">
                  Pincode
                </Label>
                <Input
                  value={details.pincode}
                  onChange={(e) => setField("pincode", e.target.value)}
                  inputMode="numeric"
                  maxLength={6}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
              <div className="col-span-2" style={{ display: "none" }}>
                <Label className="text-[10px] text-muted-foreground">
                  Address
                </Label>
                <Textarea
                  value={details.address}
                  onChange={(e) => setField("address", e.target.value)}
                  rows={2}
                  className="text-xs mt-0.5 resize-none"
                />
              </div>
              <div className="col-span-2" style={{ display: "none" }}>
                <Label className="text-[10px] text-muted-foreground">
                  GST / Bank Account
                </Label>
                <Select
                  value={details.bankAccount}
                  onValueChange={(v) => setField("bankAccount", v)}
                >
                  <SelectTrigger className="h-8 text-xs mt-0.5">
                    <SelectValue placeholder="Select Account" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2" style={{ display: "none" }}>
                <Label className="text-[10px] text-muted-foreground">
                  Customer GST Number
                </Label>
                <Input
                  value={details.gstNumber}
                  onChange={(e) =>
                    setField("gstNumber", e.target.value.toUpperCase())
                  }
                  maxLength={15}
                  className="h-8 text-xs mt-0.5 font-display"
                />
              </div>
              <div className="col-span-2" style={{ display: "none" }}>
                <Label className="text-[10px] text-muted-foreground">
                  Remark
                </Label>
                <Textarea
                  value={details.remark}
                  onChange={(e) => setField("remark", e.target.value)}
                  rows={2}
                  className="text-xs mt-0.5 resize-none"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Cart items */}
      <div className="flex-1 md:overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 text-muted-foreground">
            <ShoppingCart className="h-12 w-12 opacity-30" />
            <p className="text-sm mt-2">No items in cart</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {cart.map((item) => (
              <div key={item.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="font-display text-xs text-muted-foreground">
                      ₹{item.final_amount} × {item.qty}
                    </p>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="p-1 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center border border-border rounded-md">
                    <button
                      onClick={() => updateQty(item.id, -1)}
                      className="p-1 hover:bg-muted"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="px-2 text-xs font-display font-semibold min-w-[24px] text-center">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => updateQty(item.id, 1)}
                      className="p-1 hover:bg-muted"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1 flex-1">
                    <button
                      onClick={() =>
                        updateItemDiscount(
                          item.id,
                          item.discountType === "%" ? "₹" : "%",
                          item.discountValue,
                        )
                      }
                      className="h-6 w-6 flex items-center justify-center rounded border border-border text-[10px] font-display hover:bg-muted"
                    >
                      {item.discountType}
                    </button>
                    <Input
                      type="number"
                      value={item.discountValue || ""}
                      onChange={(e) =>
                        updateItemDiscount(
                          item.id,
                          item.discountType,
                          Number(e.target.value),
                        )
                      }
                      placeholder="Disc"
                      className="h-6 text-[10px] px-1.5"
                    />
                  </div>
                  <span className="font-display text-sm font-semibold whitespace-nowrap">
                    ₹
                    {(
                      item.final_amount * item.qty -
                      (item.discountType === "%"
                        ? (item.final_amount * item.qty * item.discountValue) /
                          100
                        : item.discountValue)
                    ).toFixed(0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cart footer */}
      {cart.length > 0 && (
        <div className="border-t border-border p-4 space-y-2.5 bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex-1">
              Bill Discount
            </span>
            <button
              onClick={() =>
                setBillDiscountType(billDiscountType === "%" ? "₹" : "%")
              }
              className="h-6 w-6 flex items-center justify-center rounded border border-border text-[10px] font-display hover:bg-muted"
            >
              {billDiscountType}
            </button>
            <Input
              type="number"
              value={billDiscountValue || ""}
              onChange={(e) => setBillDiscountValue(Number(e.target.value))}
              className="h-7 text-xs w-24 text-right"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Subtotal</span>
              <span className="font-display">₹{grossSubtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total Discount</span>
              <span className="font-display text-success">
                -₹{totalDiscount.toFixed(2)}
              </span>
            </div>
            {numberField("Total Shipping Charges", shipping, setShipping)}
            {numberField("Total Labour Charges", labour, setLabour)}
            <div className="flex justify-between text-base font-bold pt-1.5 border-t border-border">
              <span>Final Total</span>
              <span className="font-display text-primary">₹{finalTotal}</span>
            </div>
            {numberField("Paid Amount", paid, setPaid)}
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-muted-foreground">Due Amount</span>
              <span
                className={`font-display ${dueAmount > 0 ? "text-warning" : "text-success"}`}
              >
                ₹{dueAmount.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={holdBill}
              className="gap-1 text-xs font-display"
            >
              <Pause className="h-3.5 w-3.5" />
              Hold
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={saveDraft}
              className="gap-1 text-xs font-display"
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
            <Button
              size="sm"
              onClick={finalise}
              className="gap-1 text-xs font-display bg-gradient-primary hover:opacity-90"
            >
              <Printer className="h-3.5 w-3.5" />
              Pay
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Products panel */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between px-3 h-12 border-b bg-gradient-primary text-primary-foreground">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            <span className="font-display font-bold text-sm">POS</span>
          </div>
          <span className="text-xs opacity-90">
            {filteredProducts.length} items
          </span>
        </div>

        {/* Search & categories */}
        <div className="p-3 md:p-4 border-b border-border bg-card space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Sheet open={draftListOpen} onOpenChange={setDraftListOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-xs relative"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Save List
                  {drafts.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                      {drafts.length}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-full sm:max-w-sm overflow-y-auto"
              >
                <SheetHeader>
                  <SheetTitle className="font-display">
                    Saved Invoices
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-4">{DraftList}</div>
              </SheetContent>
            </Sheet>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {categories.map((cat: any) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  selectedCategory === cat
                    ? "bg-gradient-primary text-primary-foreground shadow"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4 pb-24 md:pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="group text-left p-3 rounded-lg border border-border bg-card hover:border-primary hover:shadow-md transition-all"
              >
                <p className="text-sm font-medium truncate">{product.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {product.category_name}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-display text-sm font-bold text-primary">
                    ₹{product.final_amount}
                  </span>
                  {/* <span className="text-[10px] text-muted-foreground">
                    Stock: {product.stock}
                  </span> */}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Mobile sticky footer */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t bg-card p-2.5 flex items-center gap-2 shadow-lg">
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground">Final Total</p>
            <p className="font-display text-base font-bold text-primary leading-tight">
              ₹{total}
            </p>
          </div>
          <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
            <SheetTrigger asChild>
              <Button
                size="sm"
                className="gap-1.5 bg-gradient-primary text-primary-foreground relative"
              >
                <ShoppingCart className="h-4 w-4" />
                View Cart
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0 w-full sm:max-w-sm">
              {CartContent()}
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Desktop cart panel */}
      <div className="w-full max-w-sm hidden md:flex">{CartContent()}</div>
    </div>
  );
};

export default POS;
