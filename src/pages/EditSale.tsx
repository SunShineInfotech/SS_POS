import { useNavigate } from "react-router-dom";
import { FormPage } from "@/components/shared/FormPage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRecordForm } from "@/hooks/useRecordForm";
import { toast } from "sonner";

const EditSale = () => {
  const navigate = useNavigate();
  const { form, setForm, isEdit, persist } = useRecordForm("sales", {
    billNo: "",
    date: new Date().toISOString().slice(0, 10),
    customer: "",
    items: 1,
    total: 0,
    paymentMode: "Cash",
    status: "Paid",
  });

  const save = () => {
    if (!form.billNo.trim()) return toast.error("Enter bill number");
    persist();
    toast.success(isEdit ? "Sale updated" : "Sale added");
    navigate("/sales");
  };

  return (
    <FormPage title={isEdit ? "Edit Sale" : "Add Sale"} onSave={save} backTo="/sales">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <div>
          <Label className="text-xs">Bill No.</Label>
          <Input value={form.billNo} onChange={(e) => setForm({ ...form, billNo: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Date</Label>
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Customer</Label>
          <Input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Items</Label>
          <Input type="number" value={form.items || ""} onChange={(e) => setForm({ ...form, items: Number(e.target.value) })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Total (₹)</Label>
          <Input type="number" value={form.total || ""} onChange={(e) => setForm({ ...form, total: Number(e.target.value) })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Payment Mode</Label>
          <Select value={form.paymentMode} onValueChange={(v) => setForm({ ...form, paymentMode: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Cash">Cash</SelectItem>
              <SelectItem value="UPI">UPI</SelectItem>
              <SelectItem value="Card">Card</SelectItem>
              <SelectItem value="Split">Split</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Paid">Paid</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </FormPage>
  );
};

export default EditSale;
