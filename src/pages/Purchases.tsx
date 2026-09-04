import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { Card, CardContent } from "@/components/ui/card";
import { IndianRupee, Truck, Package } from "lucide-react";
import { initStore, saveStore } from "@/lib/store";
import { toast } from "sonner";

interface Purchase {
  id: number;
  billNo: string;
  date: string;
  vendor: string;
  items: number;
  subtotal: number;
  gst: number;
  total: number;
  status: string;
  deleted?: boolean;
}

const initialPurchases: Purchase[] = [
  { id: 1, billNo: "PUR-101", date: "2026-03-29", vendor: "Fresh Farm Supplies", items: 5, subtotal: 8500, gst: 425, total: 8925, status: "Paid" },
  { id: 2, billNo: "PUR-102", date: "2026-03-28", vendor: "Metro Beverages", items: 3, subtotal: 4200, gst: 504, total: 4704, status: "Pending" },
  { id: 3, billNo: "PUR-103", date: "2026-03-27", vendor: "Spice World Trading", items: 8, subtotal: 12000, gst: 600, total: 12600, status: "Paid" },
  { id: 4, billNo: "PUR-104", date: "2026-03-26", vendor: "Golden Oil Mills", items: 2, subtotal: 6800, gst: 340, total: 7140, status: "Pending" },
];

const columns = [
  { key: "billNo" as const, label: "Bill No.", render: (v: any) => <span className="font-display text-xs font-semibold">{v}</span> },
  { key: "date" as const, label: "Date" },
  { key: "vendor" as const, label: "Vendor" },
  { key: "items" as const, label: "Items", render: (v: any) => <span className="font-display">{v}</span> },
  { key: "subtotal" as const, label: "Subtotal", render: (v: any) => <span className="font-display">₹{Number(v).toLocaleString()}</span> },
  { key: "gst" as const, label: "GST", render: (v: any) => <span className="font-display text-xs">₹{Number(v).toLocaleString()}</span> },
  { key: "total" as const, label: "Total", render: (v: any) => <span className="font-display font-bold">₹{Number(v).toLocaleString()}</span> },
  {
    key: "status" as const,
    label: "Status",
    render: (v: any) => (
      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${v === "Paid" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>{v}</span>
    ),
  },
];

const Purchases = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Purchase[]>(() => initStore("purchases", initialPurchases));
  const persist = (next: Purchase[]) => { setData(next); saveStore("purchases", next); };

  const totalPurchases = data.filter((p) => !p.deleted).reduce((s, p) => s + p.total, 0);
  const pendingTotal = data.filter((p) => !p.deleted && p.status === "Pending").reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Package className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Total Purchases</span></div>
          <p className="font-display text-2xl font-bold">{data.filter((p) => !p.deleted).length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><IndianRupee className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Total Amount</span></div>
          <p className="font-display text-2xl font-bold">₹{totalPurchases.toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Truck className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Pending</span></div>
          <p className="font-display text-2xl font-bold text-warning">₹{pendingTotal.toLocaleString()}</p>
        </CardContent></Card>
      </div>
      <DataTable data={data} columns={columns}
        onAdd={() => navigate("/purchases/new")}
        onEdit={(row) => navigate(`/purchases/${row.id}/edit`)}
        addLabel="Add Purchase"
        onDelete={(id) => { persist(data.map((p) => (p.id === id ? { ...p, deleted: true } : p))); toast.success("Deleted"); }}
        onRestore={(id) => { persist(data.map((p) => (p.id === id ? { ...p, deleted: false } : p))); toast.success("Restored"); }}
      />
    </div>
  );
};

export default Purchases;
