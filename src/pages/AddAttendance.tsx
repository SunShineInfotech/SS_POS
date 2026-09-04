import { useNavigate } from "react-router-dom";
import { FormPage } from "@/components/shared/FormPage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRecordForm } from "@/hooks/useRecordForm";
import { toast } from "sonner";

const AddAttendance = () => {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const { form, setForm, isEdit, persist } = useRecordForm("attendance", { date: today, employee: "Ravi Kumar", checkIn: "", lunchStart: "", lunchEnd: "", checkOut: "" });

  const save = () => {
    if (!form.employee) return toast.error("Select employee");
    const status = form.checkIn === "" ? "Absent" : form.checkIn > "09:10" ? "Late" : "Present";
    persist();
    toast.success(isEdit ? "Attendance updated" : "Attendance added");
    navigate("/attendance");
  };

  return (
    <FormPage title="Mark Attendance" onSave={save} backTo="/attendance">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <div><Label className="text-xs">Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1" /></div>
        <div>
          <Label className="text-xs">Employee</Label>
          <Select value={form.employee} onValueChange={(v) => setForm({ ...form, employee: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Ravi Kumar">Ravi Kumar</SelectItem>
              <SelectItem value="Sunita Devi">Sunita Devi</SelectItem>
              <SelectItem value="Manoj Singh">Manoj Singh</SelectItem>
              <SelectItem value="Anjali Verma">Anjali Verma</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Check In</Label><Input type="time" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} className="mt-1" /></div>
        <div><Label className="text-xs">Check Out</Label><Input type="time" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} className="mt-1" /></div>
        <div><Label className="text-xs">Lunch Start</Label><Input type="time" value={form.lunchStart} onChange={(e) => setForm({ ...form, lunchStart: e.target.value })} className="mt-1" /></div>
        <div><Label className="text-xs">Lunch End</Label><Input type="time" value={form.lunchEnd} onChange={(e) => setForm({ ...form, lunchEnd: e.target.value })} className="mt-1" /></div>
      </div>
    </FormPage>
  );
};

export default AddAttendance;
