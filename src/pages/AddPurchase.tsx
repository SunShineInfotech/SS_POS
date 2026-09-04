import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { FormPage } from "@/components/shared/FormPage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { appendStore, loadStore } from "@/lib/store";
import { toast } from "sonner";

interface PurchaseRow {
  id: string;
  product: string;
  qty: number;
  mrp: number;
  price: number; // excluding GST
  gstPercent: number;
}

const PRODUCT_OPTIONS = [
  { name: "Masala Dosa", mrp: 140, price: 120, gst: 5 },
  { name: "Paneer Tikka", mrp: 250, price: 220, gst: 5 },
  { name: "Mango Lassi", mrp: 90, price: 80, gst: 12 },
  { name: "Flour (1kg)", mrp: 50, price: 45, gst: 0 },
  { name: "Cooking Oil (1L)", mrp: 180, price: 160, gst: 5 },
];

const VENDORS = ["Fresh Farm Supplies", "Metro Beverages", "Spice World Trading", "Golden Oil Mills"];

const rowTotal = (r: PurchaseRow) => {
  const sub = r.qty * r.price;
  const gst = (sub * r.gstPercent) / 100;
  return { sub, gst, total: sub + gst };
};

const newRow = (): PurchaseRow => ({
  id: crypto.randomUUID(),
  product: "",
  qty: 1,
  mrp: 0,
  price: 0,
  gstPercent: 0,
});

const AddPurchase = () => {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [billNo, setBillNo] = useState("");
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState(today);
  const [remark, setRemark] = useState("");
  const [rows, setRows] = useState<PurchaseRow[]>([newRow()]);
  const [discountAmt, setDiscountAmt] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);

  const onProduct = (idx: number, name: string) => {
    const p = PRODUCT_OPTIONS.find((o) => o.name === name);
    setRows((rs) =>
      rs.map((r, i) =>
        i === idx ? { ...r, product: name, mrp: p?.mrp ?? r.mrp, price: p?.price ?? r.price, gstPercent: p?.gst ?? r.gstPercent } : r,
      ),
    );
  };

  const patchRow = (idx: number, patch: Partial<PurchaseRow>) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const totals = useMemo(() => {
    const sub = rows.reduce((s, r) => s + rowTotal(r).sub, 0);
    const gst = rows.reduce((s, r) => s + rowTotal(r).gst, 0);
    const itemsTotal = sub + gst;
    const pctDisc = (itemsTotal * (discountPct || 0)) / 100;
    const totalDiscount = (discountAmt || 0) + pctDisc;
    const grand = Math.max(0, itemsTotal - totalDiscount + (otherCharges || 0));
    return { sub, gst, itemsTotal, totalDiscount, grand };
  }, [rows, discountAmt, discountPct, otherCharges]);

  const save = () => {
    if (!billNo.trim()) return toast.error("Enter bill number");
    if (!vendor) return toast.error("Select vendor");
    const cleanRows = rows.filter((r) => r.product && r.qty > 0);
    if (cleanRows.length === 0) return toast.error("Add at least one product");

    const initial: any[] = [];
    appendStore(
      "purchases",
      {
        id: Date.now(),
        billNo,
        date,
        vendor,
        remark,
        items: cleanRows.length,
        subtotal: Math.round(totals.sub),
        gst: Math.round(totals.gst),
        discount: Math.round(totals.totalDiscount),
        otherCharges: otherCharges || 0,
        total: Math.round(totals.grand),
        status: "Pending",
        rows: cleanRows,
      },
      initial,
    );
    // ensure store created
    loadStore("purchases", []);
    toast.success("Purchase saved");
    navigate("/purchases");
  };

  return (
    <FormPage title="Add Purchase" subtitle="Enter purchase invoice details" onSave={save} saveLabel="Save Purchase" backTo="/purchases">
      <div className="space-y-6">
        {/* Header info */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Bill No. (Manual)</Label>
            <Input value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="PUR-105" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Vendor</Label>
            <Select value={vendor} onValueChange={setVendor}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select vendor" /></SelectTrigger>
              <SelectContent>
                {VENDORS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
          </div>
          <div className="md:col-span-1">
            <Label className="text-xs">Remark</Label>
            <Input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Optional" className="mt-1" />
          </div>
        </div>

        {/* Items */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Items</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, newRow()])} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Add Item
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs md:text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-2 py-2 font-display font-semibold w-[24%]">Product</th>
                  <th className="px-2 py-2 font-display font-semibold">Qty</th>
                  <th className="px-2 py-2 font-display font-semibold">MRP</th>
                  <th className="px-2 py-2 font-display font-semibold">Price (Excl. GST)</th>
                  <th className="px-2 py-2 font-display font-semibold">GST %</th>
                  <th className="px-2 py-2 font-display font-semibold text-right">Total</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const { total } = rowTotal(r);
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-2 py-1.5">
                        <Select value={r.product} onValueChange={(v) => onProduct(idx, v)}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Select product" /></SelectTrigger>
                          <SelectContent>
                            {PRODUCT_OPTIONS.map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="number" min={0} value={r.qty || ""} onChange={(e) => patchRow(idx, { qty: Number(e.target.value) })} className="h-9 w-20" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="number" min={0} value={r.mrp || ""} onChange={(e) => patchRow(idx, { mrp: Number(e.target.value) })} className="h-9 w-24" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="number" min={0} value={r.price || ""} onChange={(e) => patchRow(idx, { price: Number(e.target.value) })} className="h-9 w-28" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="number" min={0} value={r.gstPercent || ""} onChange={(e) => patchRow(idx, { gstPercent: Number(e.target.value) })} className="h-9 w-20" />
                      </td>
                      <td className="px-2 py-1.5 text-right font-display font-semibold">₹{total.toFixed(2)}</td>
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, i) => i !== idx) : rs))}
                          className="p-1 text-muted-foreground hover:text-destructive"
                          aria-label="Remove row"
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
        </div>

        {/* Discount + charges + totals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Discount Amount (₹)</Label>
                <Input type="number" min={0} value={discountAmt || ""} onChange={(e) => setDiscountAmt(Number(e.target.value))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Discount %</Label>
                <Input type="number" min={0} max={100} value={discountPct || ""} onChange={(e) => setDiscountPct(Number(e.target.value))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Other Charges (₹)</Label>
              <Input type="number" min={0} value={otherCharges || ""} onChange={(e) => setOtherCharges(Number(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Remark / Notes</Label>
              <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} className="mt-1" />
            </div>
          </div>

          <div className="rounded-2xl border border-border p-4 space-y-2 bg-muted/30">
            <Row label="Subtotal (Excl. GST)" value={totals.sub} />
            <Row label="GST" value={totals.gst} />
            <Row label="Items Total" value={totals.itemsTotal} bold />
            <Row label="Total Discount" value={-totals.totalDiscount} className="text-destructive" />
            <Row label="Other Charges" value={otherCharges || 0} />
            <div className="border-t border-border pt-2 flex items-center justify-between">
              <span className="font-display font-bold">Grand Total</span>
              <span className="font-display text-2xl font-bold text-primary">₹{totals.grand.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </FormPage>
  );
};

const Row = ({ label, value, bold, className }: { label: string; value: number; bold?: boolean; className?: string }) => (
  <div className={`flex items-center justify-between text-sm ${className ?? ""}`}>
    <span className="text-muted-foreground">{label}</span>
    <span className={`font-display ${bold ? "font-bold" : ""}`}>₹{value.toFixed(2)}</span>
  </div>
);

export default AddPurchase;
