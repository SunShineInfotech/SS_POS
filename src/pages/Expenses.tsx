import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpCircle, IndianRupee } from "lucide-react";
import { initStore, saveStore } from "@/lib/store";
import { toast } from "sonner";

interface Expense {
  id: number;
  date: string;
  category: string;
  description: string;
  amount: number;
  paymentMode: string;
  deleted?: boolean;
}

const initialExpenses: Expense[] = [
  { id: 1, date: "2026-03-29", category: "Rent", description: "Monthly shop rent", amount: 35000, paymentMode: "UPI" },
  { id: 2, date: "2026-03-29", category: "Utilities", description: "Electricity bill", amount: 8500, paymentMode: "UPI" },
  { id: 3, date: "2026-03-28", category: "Salary", description: "Staff salary advance", amount: 15000, paymentMode: "Cash" },
  { id: 4, date: "2026-03-27", category: "Maintenance", description: "AC servicing", amount: 3200, paymentMode: "Cash" },
  { id: 5, date: "2026-03-26", category: "Marketing", description: "Pamphlet printing", amount: 2500, paymentMode: "UPI" },
];

const columns = [
  { key: "date" as const, label: "Date" },
  { key: "category" as const, label: "Category", render: (v: any) => <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-destructive/10 text-destructive">{v}</span> },
  { key: "description" as const, label: "Description" },
  { key: "amount" as const, label: "Amount", render: (v: any) => <span className="font-display font-bold text-destructive">₹{Number(v).toLocaleString()}</span> },
  { key: "paymentMode" as const, label: "Payment Mode" },
];

const Expenses = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Expense[]>(() => initStore("expenses", initialExpenses));
  const persist = (next: Expense[]) => { setData(next); saveStore("expenses", next); };

  const totalExpenses = data.filter((e) => !e.deleted).reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><ArrowUpCircle className="h-4 w-4 text-destructive" /><span className="text-xs text-muted-foreground">Total Expenses</span></div>
          <p className="font-display text-2xl font-bold text-destructive">₹{totalExpenses.toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><IndianRupee className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Entries</span></div>
          <p className="font-display text-2xl font-bold">{data.filter((e) => !e.deleted).length}</p>
        </CardContent></Card>
      </div>
      <DataTable data={data} columns={columns}
        onAdd={() => navigate("/expenses/new")}
        onEdit={(row) => navigate(`/expenses/${row.id}/edit`)}
        addLabel="Add Expense"
        onDelete={(id) => { persist(data.map((e) => (e.id === id ? { ...e, deleted: true } : e))); toast.success("Deleted"); }}
        onRestore={(id) => { persist(data.map((e) => (e.id === id ? { ...e, deleted: false } : e))); toast.success("Restored"); }}
      />
    </div>
  );
};

export default Expenses;
