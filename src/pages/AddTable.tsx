import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FormPage } from "@/components/shared/FormPage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import axios from "axios";

interface FranchiseOption {
  id: number;
  name: string;
}

interface TableForm {
  franchise_id: string;
  table_no: string;
  table_status: string;
  table_capacity: number;
}

const EMPTY_FORM: TableForm = {
  franchise_id: "",
  table_no: "",
  table_status: "1",
  table_capacity: 4,
};

// NOTE: no separate status master table was provided, so these are
// hardcoded. Update the labels/values here if your actual statuses differ.
const TABLE_STATUS_OPTIONS = [
  { value: "1", label: "Available" },
  { value: "2", label: "Occupied" },
  { value: "3", label: "Reserved" },
  { value: "4", label: "Out of Service" },
];

// Slider bounds for seating capacity — adjust if your largest table seats
// more than 20.
const CAPACITY_MIN = 1;
const CAPACITY_MAX = 20;

const API_URL =
  import.meta.env.VITE_API_URL || "https://sunshineproduct.in/POS/v1_api/";

const getUserProfile = () =>
  JSON.parse(localStorage.getItem("company_data") || "{}");

const AddTable = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<TableForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [franchises, setFranchises] = useState<FranchiseOption[]>([]);

  const setField = <K extends keyof TableForm>(key: K, value: TableForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    const loadFranchises = async () => {
      try {
        const userProfile = getUserProfile();
        // Restricted to the franchise the logged-in user belongs to.
        const res = await axios.post(`${API_URL}franchise.php`, {
          type: 2,
          company_id: userProfile.company_id,
          franchise_id: userProfile.franchise_id,
        });
        if (res.data.status === "success") {
          const options = res.data.data.map((f: any) => ({
            id: f.franchise_id,
            name: f.franchise_name,
          }));
          setFranchises(options);
          // Only one franchise is ever returned for a non-edit form, so
          // default-select it.
          if (!isEdit && options.length === 1) {
            setField("franchise_id", String(options[0].id));
          }
        }
      } catch (err) {
        console.error("Error loading franchises:", err);
      }
    };
    loadFranchises();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isEdit) return;

    const loadTable = async () => {
      try {
        const userProfile = getUserProfile();
        const res = await axios.post(`${API_URL}table_master.php`, {
          type: 5,
          company_id: userProfile.company_id,
          franchise_id: userProfile.franchise_id,
          table_id: id,
        });

        if (res.data.status === "success") {
          const t = res.data.data;
          setForm({
            franchise_id: t.franchise_id ? String(t.franchise_id) : "",
            table_no: t.table_no || "",
            table_status: t.table_status ? String(t.table_status) : "1",
            table_capacity: t.table_Capacity ? Number(t.table_Capacity) : 4,
          });
        } else {
          toast.error(res.data.message || "Table not found");
          navigate("/tables");
        }
      } catch (err) {
        console.error("Error loading table:", err);
        toast.error("Failed to load table. Please try again.");
        navigate("/tables");
      } finally {
        setLoading(false);
      }
    };
    loadTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const save = async () => {
    if (!form.table_no.trim()) return toast.error("Enter table number");
    if (!form.franchise_id) return toast.error("Select a franchise");

    const userProfile = getUserProfile();

    try {
      const res = await axios.post(`${API_URL}table_master.php`, {
        type: isEdit ? 3 : 1,
        company_id: userProfile.company_id,
        franchise_id: form.franchise_id,
        ...(isEdit && { table_id: id }),
        table_no: form.table_no,
        table_status: form.table_status,
        table_capacity: form.table_capacity,
      });

      if (res.data.status === "success") {
        toast.success(res.data.message);
        navigate("/tables");
      } else {
        toast.error(res.data.message || "Failed to save table");
      }
    } catch (err) {
      console.error("Error saving table:", err);
      toast.error("Failed to save table. Please try again.");
    }
  };

  if (loading) {
    return (
      <FormPage title="Edit Table" onSave={() => {}} backTo="/tables">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </FormPage>
    );
  }

  return (
    <FormPage
      title={isEdit ? "Edit Table" : "Add Table"}
      onSave={save}
      backTo="/tables"
    >
      <div className="max-w-2xl space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Table Number *</Label>
            <Input
              value={form.table_no}
              onChange={(e) => setField("table_no", e.target.value)}
              className="mt-1"
              placeholder="e.g. T1"
            />
          </div>
          <div>
            <Label className="text-xs">Franchise *</Label>
            <Select
              value={form.franchise_id}
              onValueChange={(v) => setField("franchise_id", v)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select franchise" />
              </SelectTrigger>
              <SelectContent>
                {franchises.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select
              value={form.table_status}
              onValueChange={(v) => setField("table_status", v)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {TABLE_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs">Table Capacity</Label>
            <span className="text-sm font-semibold text-primary">
              {form.table_capacity}{" "}
              {form.table_capacity === 1 ? "seat" : "seats"}
            </span>
          </div>
          <Slider
            value={[form.table_capacity]}
            onValueChange={([v]) => setField("table_capacity", v)}
            min={CAPACITY_MIN}
            max={CAPACITY_MAX}
            step={1}
            className="mt-2"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>{CAPACITY_MIN}</span>
            <span>{CAPACITY_MAX}</span>
          </div>
        </div>
      </div>
    </FormPage>
  );
};

export default AddTable;
