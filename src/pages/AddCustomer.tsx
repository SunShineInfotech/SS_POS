import { useNavigate } from "react-router-dom";
import { FormPage } from "@/components/shared/FormPage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRecordForm } from "@/hooks/useRecordForm";
import { toast } from "sonner";

const AddCustomer = () => {
  const navigate = useNavigate();
  const { form, setForm, isEdit, persist } = useRecordForm("customers", { name: "", mobile: "", email: "" });

  const save = () => {
    if (!form.name.trim()) return toast.error("Enter name");
    persist();
    toast.success(isEdit ? "Customer updated" : "Customer added");
    navigate("/customers");
  };

  return (
    <FormPage title={isEdit ? "Edit Customer" : "Add Customer"} onSave={save} backTo="/customers">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <div className="md:col-span-2">
          <Label className="text-xs">Name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Mobile</Label>
          <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" />
        </div>
      </div>
    </FormPage>
  );
};

export default AddCustomer;
