import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowDownCircle, IndianRupee } from "lucide-react";
import { initStore, saveStore } from "@/lib/store";
import { toast } from "sonner";

interface IncomeItem {
  id: number;
  date: string;
  category: string;
  description: string;
  amount: number;
  paymentMode: string;
  deleted?: boolean;
}

const initialIncome: IncomeItem[] = [
  { id: 1, date: "2026-03-29", category: "Sales", description: "Daily POS sales", amount: 24580, paymentMode: "Mixed" },
  { id: 2, date: "2026-03-28", category: "Catering", description: "Corporate event catering", amount: 45000, paymentMode: "UPI" },
  { id: 3, date: "2026-03-27", category: "Sales", description: "Daily POS sales", amount: 18200, paymentMode: "Mixed" },
  { id: 4, date: "2026-03-26", category: "Other", description: "Scrap sale", amount: 3500, paymentMode: "Cash" },
];

const columns = [
  { key: "date" as const, label: "Date" },
  { key: "category" as const, label: "Category", render: (v: any) => <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">{v}</span> },
  { key: "description" as const, label: "Description" },
  { key: "amount" as const, label: "Amount", render: (v: any) => <span className="font-display font-bold text-success">₹{Number(v).toLocaleString()}</span> },
  { key: "paymentMode" as const, label: "Payment Mode" },
];

const Income = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<IncomeItem[]>(() => initStore("income", initialIncome));
  const persist = (next: IncomeItem[]) => { setData(next); saveStore("income", next); };

  const totalIncome = data.filter((i) => !i.deleted).reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><ArrowDownCircle className="h-4 w-4 text-success" /><span className="text-xs text-muted-foreground">Total Income</span></div>
          <p className="font-display text-2xl font-bold text-success">₹{totalIncome.toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><IndianRupee className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Entries</span></div>
          <p className="font-display text-2xl font-bold">{data.filter((i) => !i.deleted).length}</p>
        </CardContent></Card>
      </div>
      <DataTable data={data} columns={columns}
        onAdd={() => navigate("/income/new")}
        onEdit={(row) => navigate(`/income/${row.id}/edit`)}
        addLabel="Add Income"
        onDelete={(id) => { persist(data.map((i) => (i.id === id ? { ...i, deleted: true } : i))); toast.success("Deleted"); }}
        onRestore={(id) => { persist(data.map((i) => (i.id === id ? { ...i, deleted: false } : i))); toast.success("Restored"); }}
      />
    </div>
  );
};

export default Income;
