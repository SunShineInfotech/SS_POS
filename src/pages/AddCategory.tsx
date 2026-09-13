// src/pages/AddCategory.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FormPage } from "@/components/shared/FormPage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Loader2, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { CategoryService } from "@/services/category.service";

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

const AddCategory = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const company = getCompanyData();

  const [form, setForm] = useState({
    category_name: "",
    category_status: 1 as 1 | 2,
  });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  // Only set when the category genuinely doesn't exist / the load
  // couldn't be completed. Lets us show a retry option instead of
  // silently bouncing the user back to the list on any hiccup.
  const [loadError, setLoadError] = useState<string | null>(null);

  // Validate ID on edit
  useEffect(() => {
    if (isEdit) {
      const numId = Number(id);
      if (isNaN(numId) || numId <= 0) {
        toast.error("Invalid category ID");
        navigate("/categories");
        return;
      }
    }
  }, [id, isEdit, navigate]);

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
      const res = await CategoryService.getCategory(
        Number(id),
        company.company_id,
        company.franchise_id
      );

      if (res.status === "success" && res.data) {
        setForm({
          category_name: res.data.category_name,
          category_status: res.data.category_status,
        });
      } else {
        // A clean "not found" response from the API — safe to bounce back.
        toast.error(res.message || "Category not found");
        navigate("/categories");
      }
    } catch (err: any) {
      console.error("Error loading category:", err);

      // Only auto-redirect for a genuine 404 (category really doesn't
      // exist). Any other failure (network drop, 500, DB hiccup, etc.)
      // should NOT silently send the user back to the list — show an
      // error and let them retry instead.
      if (err?.response?.status === 404) {
        toast.error(err.response?.data?.message || "Category not found");
        navigate("/categories");
        return;
      }

      const message =
        err?.response?.data?.message ||
        "Could not load this category. Please check your connection and try again.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  const save = async () => {
    if (!form.category_name.trim()) {
      return toast.error("Enter category name");
    }
    if (!company) {
      return toast.error("Company data missing");
    }

    setSaving(true);
    try {
      const payload = {
        company_id: company.company_id,
        franchise_id: company.franchise_id,
        category_name: form.category_name.trim(),
        category_status: form.category_status,
      };

      let res;
      if (isEdit) {
        res = await CategoryService.updateCategory(Number(id), payload);
      } else {
        res = await CategoryService.createCategory(payload);
      }

      if (res.status === "success") {
        toast.success(res.message);
        navigate("/categories");
      } else {
        // Stay on the form — duplicate name, validation error, etc.
        toast.error(res.message || "Failed to save category");
      }
    } catch (err: any) {
      console.error("Error saving category:", err);
      // Never navigate away on a failed save — the user's input would be lost.
      toast.error(
        err?.response?.data?.message || "Failed to save category. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saving) save();
  };

  const handleCancel = () => navigate("/categories");

  return (
    <>
      <div className="mx-auto w-full ">
        <Card className="border-border shadow-card">
          {/* ----- Title ----- */}
          <CardHeader className="flex flex-row items-start gap-3 border-b border-border pb-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FolderPlus className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="font-display text-lg">
                {isEdit ? "Edit Category" : "New Category"}
              </CardTitle>
              <CardDescription className="mt-0.5 text-xs">
                {isEdit
                  ? "Update the name or status of this category."
                  : "Categories help you group products for billing and reports."}
              </CardDescription>
            </div>
          </CardHeader>

          {loading ? (
            <CardContent className="py-10">
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading category...
              </div>
            </CardContent>
          ) : loadError ? (
            <>
              <CardContent className="space-y-4 pt-6">
                <p className="text-sm text-destructive">{loadError}</p>
              </CardContent>
              <CardFooter className="justify-end gap-2 border-t border-border pt-5">
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Back to Categories
                </Button>
                <Button type="button" onClick={loadCategory}>
                  Retry
                </Button>
              </CardFooter>
            </>
          ) : (
            /* ----- Form ----- */
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-5 pt-6">
                <div>
                  <Label htmlFor="category_name" className="text-xs font-semibold">
                    Category name
                  </Label>
                  <Input
                    id="category_name"
                    value={form.category_name}
                    onChange={(e) =>
                      setForm({ ...form, category_name: e.target.value })
                    }
                    className="mt-1.5"
                    placeholder="e.g. Beverages"
                    disabled={saving}
                    autoFocus
                  />
                </div>

                <div>
                  <Label className="mb-2 block text-xs font-semibold">Status</Label>
                  <RadioGroup
                    value={String(form.category_status)}
                    onValueChange={(val) =>
                      setForm({ ...form, category_status: Number(val) as 1 | 2 })
                    }
                    className="grid grid-cols-2 gap-3"
                  >
                    <label
                      htmlFor="active"
                      className={`flex cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-sm transition-colors ${form.category_status === 1
                          ? "border-primary bg-primary/5 text-primary font-medium"
                          : "border-border text-muted-foreground"
                        }`}
                    >
                      <RadioGroupItem value="1" id="active" disabled={saving} />
                      Active
                    </label>
                    <label
                      htmlFor="inactive"
                      className={`flex cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-sm transition-colors ${form.category_status === 2
                          ? "border-primary bg-primary/5 text-primary font-medium"
                          : "border-border text-muted-foreground"
                        }`}
                    >
                      <RadioGroupItem value="2" id="inactive" disabled={saving} />
                      Inactive
                    </label>
                  </RadioGroup>
                </div>
              </CardContent>

              {/* ----- Submit / Cancel ----- */}
              <CardFooter className="justify-end gap-2 border-t border-border pt-5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={saving}
                >
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
          )}
        </Card>
      </div>
    </>
  );
};

export default AddCategory;