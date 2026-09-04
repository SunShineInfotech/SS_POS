import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  ArrowLeft, Search, Plus, Minus, X, Save, Printer, CreditCard, Receipt, Pause, ListOrdered, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { loadStore, saveStore } from "@/lib/store";

interface Product {
  id: number; name: string; price: number; category: string;
}
interface CartItem extends Product { qty: number; }

interface HeldBill {
  id: number;
  tableName: string;
  customerName: string;
  customerMobile: string;
  heldAt: string;
  amount: number;
  items: CartItem[];
  discountType: "%" | "₹";
  discountValue: number;
}

const HOLD_KEY = "restaurant-holds";

const sampleProducts: Product[] = [
  { id: 1, name: "Masala Dosa", price: 120, category: "Food" },
  { id: 2, name: "Paneer Tikka", price: 220, category: "Food" },
  { id: 3, name: "Butter Naan", price: 45, category: "Food" },
  { id: 4, name: "Dal Makhani", price: 180, category: "Food" },
  { id: 5, name: "Mango Lassi", price: 80, category: "Drinks" },
  { id: 6, name: "Cold Coffee", price: 120, category: "Drinks" },
  { id: 7, name: "Fresh Lime Soda", price: 60, category: "Drinks" },
  { id: 8, name: "Gulab Jamun", price: 90, category: "Dessert" },
  { id: 9, name: "Veg Biryani", price: 200, category: "Food" },
  { id: 10, name: "Chicken Tikka", price: 280, category: "Food" },
  { id: 11, name: "Tandoori Roti", price: 30, category: "Food" },
  { id: 12, name: "Raita", price: 50, category: "Food" },
];

const categories = ["All", ...Array.from(new Set(sampleProducts.map((p) => p.category)))];
const roundOff = (v: number) => (v - Math.floor(v) < 0.5 ? Math.floor(v) : Math.ceil(v));

const RestaurantBilling = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tableId } = useParams();
  const table = (location.state as any)?.table || { name: tableId, status: "Free" };

  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paid, setPaid] = useState(0);
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [printed, setPrinted] = useState(false);

  // Customer + discount
  const [customerMobile, setCustomerMobile] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [discountType, setDiscountType] = useState<"%" | "₹">("%");
  const [discountValue, setDiscountValue] = useState(0);

  // Hold list
  const [holds, setHolds] = useState<HeldBill[]>(() => loadStore<HeldBill>(HOLD_KEY, []));
  const [holdListOpen, setHoldListOpen] = useState(false);
  const [resumedId, setResumedId] = useState<number | null>(null);

  useEffect(() => { saveStore(HOLD_KEY, holds); }, [holds]);

  const filtered = useMemo(
    () =>
      sampleProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) &&
          (cat === "All" || p.category === cat)
      ),
    [search, cat]
  );

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discountAmount = useMemo(() => {
    const raw = discountType === "%" ? (subtotal * discountValue) / 100 : discountValue;
    return Math.min(Math.max(raw || 0, 0), subtotal);
  }, [discountType, discountValue, subtotal]);
  const total = roundOff(subtotal - discountAmount);
  const balance = total - paid;

  const add = (p: Product) =>
    setCart((c) =>
      c.find((x) => x.id === p.id)
        ? c.map((x) => (x.id === p.id ? { ...x, qty: x.qty + 1 } : x))
        : [...c, { ...p, qty: 1 }]
    );
  const updateQty = (id: number, d: number) =>
    setCart((c) =>
      c.map((x) => (x.id === id ? { ...x, qty: Math.max(0, x.qty + d) } : x)).filter((x) => x.qty > 0)
    );

  const clearBill = () => {
    setCart([]);
    setCustomerName("");
    setCustomerMobile("");
    setDiscountValue(0);
    setDiscountType("%");
    setResumedId(null);
  };

  const handleSave = () => {
    if (!cart.length) return toast.error("Cart is empty");
    toast.success(`Order saved for ${table.name}`);
    navigate("/restaurant-tables");
  };

  const handleHold = () => {
    if (!cart.length) return toast.error("Nothing to hold");
    const bill: HeldBill = {
      id: resumedId ?? Date.now(),
      tableName: table.name,
      customerName: customerName || "Walk-in",
      customerMobile,
      heldAt: new Date().toISOString(),
      amount: total,
      items: cart,
      discountType,
      discountValue,
    };
    setHolds((h) => [bill, ...h.filter((x) => x.id !== bill.id)]);
    toast.success("Bill held");
    clearBill();
  };

  const resumeHold = (bill: HeldBill) => {
    setCart(bill.items);
    setCustomerName(bill.customerName === "Walk-in" ? "" : bill.customerName);
    setCustomerMobile(bill.customerMobile);
    setDiscountType(bill.discountType);
    setDiscountValue(bill.discountValue);
    setResumedId(bill.id);
    setHolds((h) => h.filter((x) => x.id !== bill.id));
    setHoldListOpen(false);
    toast.success(`Resumed bill — ${bill.tableName}`);
  };

  const handleCheckout = () => {
    if (!cart.length) return toast.error("Cart is empty");
    setPaid(total);
    setPrinted(false);
    setCheckoutOpen(true);
  };

  const handlePrint = () => {
    setPrinted(true);
    toast.success("Bill printed");
    setTimeout(() => {
      navigate("/restaurant-tables");
    }, 600);
  };

  const HoldList = (
    <div className="space-y-2">
      {holds.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No held bills
        </div>
      ) : (
        holds.map((h) => (
          <button
            key={h.id}
            onClick={() => resumeHold(h)}
            className="w-full text-left rounded-xl border border-border bg-card p-3 hover:border-primary transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold truncate">{h.tableName}</p>
                <p className="text-xs text-muted-foreground truncate">{h.customerName}{h.customerMobile ? ` · ${h.customerMobile}` : ""}</p>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                  <Clock className="h-3 w-3" />
                  {new Date(h.heldAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <span className="font-display text-sm font-bold text-primary shrink-0">₹{h.amount}</span>
            </div>
          </button>
        ))
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-3 md:px-4 h-14 border-b bg-card">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate("/restaurant-tables")} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold truncate">{table.name}</p>
            <p className="text-[10px] text-muted-foreground">Order in progress</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Sheet open={holdListOpen} onOpenChange={setHoldListOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 relative">
                <ListOrdered className="h-3.5 w-3.5" />
                Hold List
                {holds.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                    {holds.length}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto">
              <SheetHeader>
                <SheetTitle className="font-display">Held Bills</SheetTitle>
              </SheetHeader>
              <div className="mt-4">{HoldList}</div>
            </SheetContent>
          </Sheet>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Total</p>
            <p className="font-display text-base font-bold text-primary">₹{total}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Products */}
        <div className="flex-1 flex flex-col overflow-hidden border-b md:border-b-0 md:border-r">
          <div className="p-3 border-b bg-card space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium ${
                    cat === c ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => add(p)}
                  className="text-left p-3 rounded-lg border bg-card hover:border-primary hover:shadow-md transition-all"
                >
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">{p.category}</p>
                  <p className="font-display text-sm font-bold mt-2 text-primary">₹{p.price}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Cart */}
        <div className="w-full md:max-w-sm flex flex-col bg-card max-h-[60vh] md:max-h-none overflow-y-auto md:overflow-hidden">
          <div className="p-3 border-b space-y-2">
            <p className="font-display text-sm font-bold">Cart ({cart.length})</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Customer Mobile No</Label>
                <Input
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value)}
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit"
                  className="h-8 text-xs mt-0.5"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Customer Name</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Name"
                  className="h-8 text-xs mt-0.5"
                />
              </div>
            </div>
          </div>
          <div className="flex-1 md:overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6">
                <Receipt className="h-10 w-10 opacity-30 mb-2" />
                <p className="text-xs">Add items to start</p>
              </div>
            ) : (
              <div className="divide-y">
                {cart.map((i) => (
                  <div key={i.id} className="p-3">
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{i.name}</p>
                        <p className="text-[11px] text-muted-foreground">₹{i.price} × {i.qty}</p>
                      </div>
                      <button onClick={() => setCart((c) => c.filter((x) => x.id !== i.id))} className="text-muted-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center border rounded-md">
                        <button onClick={() => updateQty(i.id, -1)} className="p-1.5 hover:bg-muted">
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="px-3 text-xs font-display font-semibold">{i.qty}</span>
                        <button onClick={() => updateQty(i.id, 1)} className="p-1.5 hover:bg-muted">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="font-display text-sm font-bold">₹{i.price * i.qty}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t p-3 space-y-2 bg-muted/30">
            {/* Discount */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground flex-1">Discount</span>
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                {(["%", "₹"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDiscountType(t)}
                    className={`px-2.5 py-1 text-[11px] font-display font-semibold transition-colors ${
                      discountType === t ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
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
                placeholder="0"
                className="h-7 w-20 text-xs"
              />
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-display">₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Discount Amount</span>
              <span className="font-display text-success">-₹{discountAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>Final Payable</span>
              <span className="font-display text-primary">₹{total}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <Button variant="outline" onClick={handleHold} className="font-display text-xs gap-1">
                <Pause className="h-3.5 w-3.5" />
                Hold
              </Button>
              <Button variant="outline" onClick={handleSave} className="font-display text-xs gap-1">
                <Save className="h-3.5 w-3.5" />
                Save
              </Button>
              <Button onClick={handleCheckout} className="font-display text-xs gap-1 bg-gradient-primary hover:opacity-90">
                <CreditCard className="h-3.5 w-3.5" />
                Pay
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Checkout dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Checkout — {table.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Card className="p-4 bg-gradient-cool text-white border-0">
              <p className="text-xs opacity-90">Total Amount</p>
              <p className="font-display text-3xl font-bold">₹{total}</p>
              <p className="text-[11px] opacity-80 mt-1">
                {cart.length} items · Discount ₹{discountAmount.toFixed(2)}
              </p>
            </Card>

            <div>
              <Label className="text-xs">Payment Mode</Label>
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                {["Cash", "Card", "UPI"].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMode(m)}
                    className={`py-2 rounded-md text-xs font-medium border-2 transition-colors ${
                      paymentMode === m ? "border-primary bg-primary/5 text-primary" : "border-border"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Amount Received (partial allowed)</Label>
              <Input
                type="number"
                value={paid || ""}
                onChange={(e) => setPaid(Number(e.target.value))}
                className="mt-1 font-display"
              />
            </div>

            <div className="flex justify-between text-sm p-2.5 rounded-md bg-muted">
              <span className="text-muted-foreground">Balance Due</span>
              <span className={`font-display font-bold ${balance > 0 ? "text-warning" : "text-success"}`}>
                ₹{balance.toFixed(2)}
              </span>
            </div>

            {!printed ? (
              <Button onClick={handlePrint} className="w-full bg-gradient-primary hover:opacity-90 font-display gap-1.5">
                <Printer className="h-4 w-4" />
                Print Bill
              </Button>
            ) : (
              <Button disabled className="w-full font-display">Printing...</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RestaurantBilling;
