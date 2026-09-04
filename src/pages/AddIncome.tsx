import { useNavigate } from "react-router-dom";
import { FormPage } from "@/components/shared/FormPage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRecordForm } from "@/hooks/useRecordForm";
import { toast } from "sonner";

const AddIncome = () => {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const { form, setForm, isEdit, persist } = useRecordForm("income", { date: today, category: "Sales", description: "", amount: 0, paymentMode: "Cash" });

  const save = () => {
    if (!form.description.trim()) return toast.error("Enter description");
    persist();
    toast.success(isEdit ? "Income updated" : "Income added");
    navigate("/income");
  };

  return (
    <FormPage title={isEdit ? "Edit Income" : "Add Income"} onSave={save} backTo="/income">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <div><Label className="text-xs">Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1" /></div>
        <div>
          <Label className="text-xs">Category</Label>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Sales">Sales</SelectItem>
              <SelectItem value="Catering">Catering</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
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
              <SelectItem value="Mixed">Mixed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2"><Label className="text-xs">Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" /></div>
      </div>
    </FormPage>
  );
};

export default AddIncome;
