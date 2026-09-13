// src/pages/AddTable.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Loader2, Table2 } from "lucide-react";
import { toast } from "sonner";
import { TableService } from "@/services/table.service";
import { apiClient } from "@/services/api.config";

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

const STATUS_OPTIONS = [
  { value: "1", label: "Free" },
  { value: "2", label: "Occupied" },
  { value: "3", label: "Reserved" },
  { value: "4", label: "Out of Service" },
];

const CAPACITY_MIN = 1;
const CAPACITY_MAX = 20;

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

const AddTable = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const company = getCompanyData();

  const [form, setForm] = useState<TableForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [franchises, setFranchises] = useState<FranchiseOption[]>([]);

  const setField = <K extends keyof TableForm>(key: K, value: TableForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Load franchises (only the user's franchise if single)
  useEffect(() => {
    const loadFranchises = async () => {
      if (!company) return;
      try {
        const res = await apiClient.post('/franchise.php', {
          type: 2,
          company_id: company.company_id,
          franchise_id: company.franchise_id, // restrict to this franchise
        });
        if (res.data.status === "success") {
          const options = res.data.data.map((f: any) => ({
            id: f.franchise_id,
            name: f.franchise_name,
          }));
          setFranchises(options);
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

  // Load table data on edit
  const loadTable = async () => {
    if (!isEdit) return;
    if (!company) {
      setLoadError("Company data missing. Please sign in again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      const res = await TableService.getTable(
        Number(id),
        company.company_id,
        company.franchise_id
      );
      if (res.status === "success" && res.data) {
        const t = res.data;
        setForm({
          franchise_id: t.franchise_id ? String(t.franchise_id) : "",
          table_no: t.table_no || "",
          table_status: t.table_status ? String(t.table_status) : "1",
          table_capacity: Number(t.table_Capacity) || 4,
        });
      } else {
        toast.error(res.message || "Table not found");
        navigate("/tables");
      }
    } catch (err: any) {
      console.error("Error loading table:", err);
      if (err?.response?.status === 404) {
        toast.error(err.response?.data?.message || "Table not found");
        navigate("/tables");
        return;
      }
      const message =
        err?.response?.data?.message ||
        "Could not load this table. Please check your connection and try again.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  const save = async () => {
    if (!form.table_no.trim()) return toast.error("Enter table number");
    if (!form.franchise_id) return toast.error("Select a franchise");
    if (!company) return toast.error("Company data missing");

    setSaving(true);
    try {
      const payload = {
        company_id: company.company_id,
        franchise_id: Number(form.franchise_id),
        table_no: form.table_no.trim(),
        table_status: Number(form.table_status),
        table_capacity: Number(form.table_capacity),
      };

      let res;
      if (isEdit) {
        res = await TableService.updateTable(Number(id), payload);
      } else {
        res = await TableService.createTable(payload);
      }

      if (res.status === "success") {
        toast.success(res.message);
        navigate("/tables");
      } else {
        toast.error(res.message || "Failed to save table");
      }
    } catch (err: any) {
      console.error("Error saving table:", err);
      toast.error(
        err?.response?.data?.message || "Failed to save table. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saving) save();
  };

  const handleCancel = () => navigate("/tables");

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="border-border shadow-card">
          <CardContent className="py-10">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading table...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="border-border shadow-card">
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm text-destructive">{loadError}</p>
          </CardContent>
          <CardFooter className="justify-end gap-2 border-t border-border pt-5">
            <Button variant="outline" onClick={handleCancel}>
              Back to Tables
            </Button>
            <Button onClick={loadTable}>Retry</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Card className="border-border shadow-card">
        <CardHeader className="flex flex-row items-start gap-3 border-b border-border pb-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Table2 className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="font-display text-lg">
              {isEdit ? "Edit Table" : "New Table"}
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              {isEdit
                ? "Update table details and status."
                : "Add a new table to your restaurant."}
            </CardDescription>
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5 pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="table_no" className="text-xs font-semibold">
                  Table Number *
                </Label>
                <Input
                  id="table_no"
                  value={form.table_no}
                  onChange={(e) => setField("table_no", e.target.value)}
                  className="mt-1.5"
                  placeholder="e.g. T1"
                  disabled={saving}
                  required
                />
              </div>
              <div>
                <Label htmlFor="franchise" className="text-xs font-semibold">
                  Franchise *
                </Label>
                <Select
                  value={form.franchise_id}
                  onValueChange={(v) => setField("franchise_id", v)}
                  disabled={saving}
                >
                  <SelectTrigger id="franchise" className="mt-1.5">
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
                <Label htmlFor="status" className="text-xs font-semibold">
                  Status
                </Label>
                <Select
                  value={form.table_status}
                  onValueChange={(v) => setField("table_status", v)}
                  disabled={saving}
                >
                  <SelectTrigger id="status" className="mt-1.5">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
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
                <Label className="text-xs font-semibold">Table Capacity</Label>
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
                disabled={saving}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>{CAPACITY_MIN}</span>
                <span>{CAPACITY_MAX}</span>
              </div>
            </div>
          </CardContent>

          <CardFooter className="justify-end gap-2 border-t border-border pt-5">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="min-w-[110px]">
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Create table"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default AddTable;