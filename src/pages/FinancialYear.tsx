import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api"; // your wrapper
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CheckCircle } from "lucide-react";

interface FinancialYear {
  financial_year_id: number;
  company_id: string;
  franchise_id: string;
  financial_year_title: string;
  start_date: string;
  end_date: string;
  is_current: number;
  is_deleted: number;
  c_date: string;
  u_date: string;
}

export default function FinancialYearPage() {
  const { user, companyData } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FinancialYear | null>(null);
  const [form, setForm] = useState({ title: "", is_current: 0 });

  const companyId = companyData?.company_id || user?.companyId;
  const franchiseId = companyData?.franchise_id || user?.franchiseId;

  // ---------- Fetch years ----------
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["financial-years", companyId, franchiseId],
    queryFn: async () => {
      const res = await apiRequest("financial_year.php", {
        type: 2,
        company_id: companyId,
        franchise_id: franchiseId,
      });
      return res.data as FinancialYear[];
    },
    enabled: !!companyId && !!franchiseId,
  });

  // ---------- Ensure current year exists (auto-insert) ----------
  useEffect(() => {
    if (!companyId || !franchiseId) return;
    // Get current year from user context (e.g., "2026-27")
    const currentYearTitle = user?.financialYear; // from pos_auth_user
    if (!currentYearTitle) return;

    const exists = data?.some((y) => y.financial_year_title === currentYearTitle);
    if (!exists && !isLoading) {
      // Auto-insert
      apiRequest("financial_year.php", {
        type: 1,
        company_id: companyId,
        franchise_id: franchiseId,
        financial_year_title: currentYearTitle,
        is_current: 1, // make it current
      })
        .then(() => {
          toast.success(`Financial year ${currentYearTitle} created`);
          refetch();
        })
        .catch(() => toast.error("Failed to auto-create financial year"));
    }
  }, [data, companyId, franchiseId, isLoading, refetch, user?.financialYear]);

  // ---------- Mutations ----------
  const addMutation = useMutation({
    mutationFn: (payload: any) =>
      apiRequest("financial_year.php", { type: 1, ...payload }),
    onSuccess: () => {
      toast.success("Financial year added");
      queryClient.invalidateQueries({ queryKey: ["financial-years"] });
      setOpen(false);
      setForm({ title: "", is_current: 0 });
    },
    onError: () => toast.error("Failed to add year"),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: any) =>
      apiRequest("financial_year.php", { type: 3, ...payload }),
    onSuccess: () => {
      toast.success("Updated");
      queryClient.invalidateQueries({ queryKey: ["financial-years"] });
      setOpen(false);
      setEditing(null);
    },
    onError: () => toast.error("Update failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("financial_year.php", {
        type: 4,
        financial_year_id: id,
        company_id: companyId,
        franchise_id: franchiseId,
      }),
    onSuccess: () => {
      toast.success("Deleted");
      queryClient.invalidateQueries({ queryKey: ["financial-years"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  const setCurrentMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("financial_year.php", {
        type: 6,
        financial_year_id: id,
        company_id: companyId,
        franchise_id: franchiseId,
      }),
    onSuccess: () => {
      toast.success("Current year updated");
      queryClient.invalidateQueries({ queryKey: ["financial-years"] });
    },
    onError: () => toast.error("Failed to set current"),
  });

  const handleSubmit = () => {
    if (!form.title) return toast.error("Title is required");
    const payload = {
      company_id: companyId,
      franchise_id: franchiseId,
      financial_year_title: form.title,
      is_current: form.is_current ? 1 : 0,
    };
    if (editing) {
      updateMutation.mutate({ ...payload, financial_year_id: editing.financial_year_id });
    } else {
      addMutation.mutate(payload);
    }
  };

  const openEdit = (year: FinancialYear) => {
    setEditing(year);
    setForm({ title: year.financial_year_title, is_current: year.is_current });
    setOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ title: "", is_current: 0 });
    setOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Financial Years</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Add Year
        </Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>End Date</TableHead>
              <TableHead>Current</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center">Loading…</TableCell>
              </TableRow>
            ) : data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No financial years found
                </TableCell>
              </TableRow>
            ) : (
              data?.map((year) => (
                <TableRow key={year.financial_year_id}>
                  <TableCell className="font-medium">{year.financial_year_title}</TableCell>
                  <TableCell>{new Date(year.start_date).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(year.end_date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {year.is_current === 1 ? (
                      <Badge variant="default" className="bg-green-500">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    {year.is_current !== 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCurrentMutation.mutate(year.financial_year_id)}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openEdit(year)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (confirm("Delete this year?")) {
                          deleteMutation.mutate(year.financial_year_id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} Financial Year</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Title (e.g., 2026-27)</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="2026-27"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_current"
                checked={form.is_current === 1}
                onCheckedChange={(checked) =>
                  setForm({ ...form, is_current: checked ? 1 : 0 })
                }
              />
              <Label htmlFor="is_current">Set as current</Label>
            </div>
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={addMutation.isPending || updateMutation.isPending}
            >
              {addMutation.isPending || updateMutation.isPending
                ? "Saving…"
                : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}