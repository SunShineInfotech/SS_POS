import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { initStore, saveStore } from "@/lib/store";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { IndianRupee, TrendingUp, Receipt } from "lucide-react";

interface Sale {
  id: number;
  billNo: string;
  date: string;
  customer: string;
  items: number;
  total: number;
  paymentMode: string;
  status: string;
  deleted?: boolean;
}

const initialSales: Sale[] = [
  { id: 1, billNo: "INV-001", date: "2026-03-29", customer: "Rahul Sharma", items: 4, total: 1250, paymentMode: "UPI", status: "Paid" },
  { id: 2, billNo: "INV-002", date: "2026-03-29", customer: "Priya Patel", items: 2, total: 890, paymentMode: "Cash", status: "Paid" },
  { id: 3, billNo: "INV-003", date: "2026-03-29", customer: "Amit Kumar", items: 6, total: 2340, paymentMode: "Split", status: "Pending" },
  { id: 4, billNo: "INV-004", date: "2026-03-28", customer: "Sneha Gupta", items: 1, total: 670, paymentMode: "Cash", status: "Paid" },
  { id: 5, billNo: "INV-005", date: "2026-03-28", customer: "Vikram Singh", items: 3, total: 3100, paymentMode: "UPI", status: "Pending" },
  { id: 6, billNo: "INV-006", date: "2026-03-27", customer: "Meera Joshi", items: 5, total: 1820, paymentMode: "Cash", status: "Paid" },
];

const columns = [
  { key: "billNo" as const, label: "Bill No.", render: (v: any) => <span className="font-display text-xs font-semibold">{v}</span> },
  { key: "date" as const, label: "Date" },
  { key: "customer" as const, label: "Customer" },
  { key: "items" as const, label: "Items", render: (v: any) => <span className="font-display">{v}</span> },
  { key: "total" as const, label: "Total", render: (v: any) => <span className="font-display font-bold">₹{Number(v).toLocaleString()}</span> },
  {
    key: "paymentMode" as const,
    label: "Payment",
    render: (v: any) => (
      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${v === "Cash" ? "bg-success/10 text-success" : v === "UPI" ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"}`}>
        {v}
      </span>
    ),
  },
  {
    key: "status" as const,
    label: "Status",
    render: (v: any) => (
      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${v === "Paid" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
        {v}
      </span>
    ),
  },
];

const Sales = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(() => initStore("sales", initialSales));
  const persist = (next: Sale[]) => { setData(next); saveStore("sales", next); };
  const todaySales = data.filter((s) => s.date === "2026-03-29" && !s.deleted);
  const todayTotal = todaySales.reduce((sum, s) => sum + s.total, 0);
  const paidTotal = todaySales.filter((s) => s.status === "Paid").reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Receipt className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Today's Orders</span></div>
          <p className="font-display text-2xl font-bold">{todaySales.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><IndianRupee className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Today's Revenue</span></div>
          <p className="font-display text-2xl font-bold">₹{todayTotal.toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Collected</span></div>
          <p className="font-display text-2xl font-bold text-success">₹{paidTotal.toLocaleString()}</p>
        </CardContent></Card>
      </div>
      <DataTable
        data={data}
        columns={columns}
        onEdit={(row) => navigate(`/sales/${row.id}/edit`)}
        onDelete={(id) => { persist(data.map((s) => (s.id === id ? { ...s, deleted: true } : s))); toast.success("Deleted"); }}
        onRestore={(id) => { persist(data.map((s) => (s.id === id ? { ...s, deleted: false } : s))); toast.success("Restored"); }}
      />
    </div>
  );
};

export default Sales;
