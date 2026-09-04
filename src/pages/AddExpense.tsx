import { useNavigate } from "react-router-dom";
import { FormPage } from "@/components/shared/FormPage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRecordForm } from "@/hooks/useRecordForm";
import { toast } from "sonner";

const expenseCategories = ["Rent", "Utilities", "Salary", "Maintenance", "Marketing", "Transport", "Miscellaneous"];

const AddExpense = () => {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const { form, setForm, isEdit, persist } = useRecordForm("expenses", { date: today, category: "Rent", description: "", amount: 0, paymentMode: "Cash" });

  const save = () => {
    if (!form.description.trim()) return toast.error("Enter description");
    persist();
    toast.success(isEdit ? "Expense updated" : "Expense added");
    navigate("/expenses");
  };

  return (
    <FormPage title={isEdit ? "Edit Expense" : "Add Expense"} onSave={save} backTo="/expenses">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <div><Label className="text-xs">Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1" /></div>
        <div>
          <Label className="text-xs">Category</Label>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {expenseCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Amount (₹)</Label><Input type="number" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className="mt-1" /></div>
        <div>
          <Label className="text-xs">Payment Mode</Label>
          <Select value={form.paymentMode} onValueChange={(v) => setForm({ ...form, paymentMode: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Cash">Cash</SelectItem>
              <SelectItem value="UPI">UPI</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2"><Label className="text-xs">Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" /></div>
      </div>
    </FormPage>
  );
};

export default AddExpense;
