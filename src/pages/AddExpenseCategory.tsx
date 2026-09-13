import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Loader2, FolderTree } from "lucide-react";
import { toast } from "sonner";
import { ExpenseCategoryService } from "@/services/expenseCategory.service";

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

const AddExpenseCategory = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const company = getCompanyData();

  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCategory = async () => {
    if (!isEdit) return;
    if (!company) {
      setLoadError("Company data missing. Please sign in again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const res = await ExpenseCategoryService.getOne(
        Number(id),
        company.company_id,
        company.franchise_id
      );
      if (res.status === "success" && res.data) {
        setTitle(res.data.expenses_categories_title);
      } else {
        toast.error(res.message || "Category not found");
        navigate("/expance-category");
      }
    } catch (err: any) {
      console.error("Error loading category:", err);
      const message = err?.response?.data?.message || "Could not load category.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategory();
  }, [id, isEdit]);

  const save = async () => {
    if (!title.trim()) return toast.error("Category name is required");
    if (!company) return toast.error("Company data missing");

    setSaving(true);
    try {
      const payload = {
        company_id: company.company_id,
        franchise_id: company.franchise_id,
        expenses_categories_title: title.trim(),
      };

      let res;
      if (isEdit) {
        res = await ExpenseCategoryService.update(Number(id), payload);
      } else {
        res = await ExpenseCategoryService.create(payload);
      }

      if (res.status === "success") {
        toast.success(res.message);
        navigate("/expance-category");
      } else {
        toast.error(res.message || "Failed to save");
      }
    } catch (err: any) {
      console.error("Error saving category:", err);
      toast.error(err?.response?.data?.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saving) save();
  };

  const handleCancel = () => navigate("/expance-category");

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="border-border shadow-card">
          <CardContent className="py-10">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading category...
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
            <Button variant="outline" onClick={handleCancel}>Back</Button>
            <Button onClick={loadCategory}>Retry</Button>
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
            <FolderTree className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="font-display text-lg">
              {isEdit ? "Edit Expense Category" : "New Expense Category"}
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              {isEdit ? "Update the category name." : "Add a new expense category."}
            </CardDescription>
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5 pt-6">
            <div>
              <Label htmlFor="title" className="text-xs font-semibold">
                Category Name *
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1.5"
                placeholder="e.g. Rent, Utilities, Salaries"
                disabled={saving}
                required
              />
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
                "Create category"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default AddExpenseCategory;