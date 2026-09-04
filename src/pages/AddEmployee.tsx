import { useNavigate } from "react-router-dom";
import { FormPage } from "@/components/shared/FormPage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRecordForm } from "@/hooks/useRecordForm";
import { toast } from "sonner";

const AddEmployee = () => {
  const navigate = useNavigate();
  const { form, setForm, isEdit, persist } = useRecordForm("employees", { name: "", mobile: "", emergencyContact: "", address: "", aadhaar: "", pan: "", franchise: "Main Branch", status: "Active" });

  const save = () => {
    if (!form.name.trim()) return toast.error("Enter name");
    persist();
    toast.success(isEdit ? "Employee updated" : "Employee added");
    navigate("/employees");
  };

  return (
    <FormPage title={isEdit ? "Edit Employee" : "Add Employee"} onSave={save} backTo="/employees">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        <div className="md:col-span-2"><Label className="text-xs">Full Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
        <div><Label className="text-xs">Mobile</Label><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="mt-1" /></div>
        <div><Label className="text-xs">Emergency Contact</Label><Input value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} className="mt-1" /></div>
        <div><Label className="text-xs">Aadhaar</Label><Input value={form.aadhaar} onChange={(e) => setForm({ ...form, aadhaar: e.target.value })} className="mt-1" /></div>
        <div><Label className="text-xs">PAN</Label><Input value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} className="mt-1" /></div>
        <div>
          <Label className="text-xs">Franchise</Label>
          <Select value={form.franchise} onValueChange={(v) => setForm({ ...form, franchise: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Main Branch">Main Branch</SelectItem>
              <SelectItem value="Branch 2">Branch 2</SelectItem>
              <SelectItem value="Branch 3">Branch 3</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2"><Label className="text-xs">Address</Label><Textarea rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" /></div>
      </div>
    </FormPage>
  );
};

export default AddEmployee;
