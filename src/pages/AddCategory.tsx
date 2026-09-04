import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FormPage } from "@/components/shared/FormPage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import axios from "axios";

const AddCategory = () => {
  const navigate = useNavigate();
  const { id } = useParams(); // "/categories/new" -> id undefined, "/categories/5" -> id = "5"
  const isEdit = Boolean(id);

  const [form, setForm] = useState({ name: "" });
  const [loading, setLoading] = useState(isEdit);

  const API_URL =
    import.meta.env.VITE_API_URL || "https://sunshineproduct.in/POS/v1_api/";

  const getUserProfile = () =>
    JSON.parse(localStorage.getItem("company_data") || "{}");

  // Edit mode hai toh single record fetch karo
  useEffect(() => {
    if (!isEdit) return;

    const loadCategory = async () => {
      try {
        const userProfile = getUserProfile();
        const res = await axios.post(`${API_URL}category.php`, {
          type: 5,
          company_id: userProfile.company_id,
          franchise_id: userProfile.franchise_id,
          category_id: id,
        });

        if (res.data.status === "success") {
          setForm({ name: res.data.data.category_name });
        } else {
          toast.error(res.data.message || "Category not found");
          navigate("/categories");
        }
      } catch (err) {
        console.error("Error loading category:", err);
        toast.error("Failed to load category. Please try again.");
        navigate("/categories");
      } finally {
        setLoading(false);
      }
    };
    loadCategory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const save = async () => {
    if (!form.name.trim()) return toast.error("Enter name");

    const userProfile = getUserProfile();

    try {
      const res = await axios.post(`${API_URL}category.php`, {
        type: isEdit ? 3 : 1,
        company_id: userProfile.company_id,
        franchise_id: userProfile.franchise_id,
        category_name: form.name,
        ...(isEdit && { category_id: id }),
      });

      if (res.data.status === "success") {
        toast.success(res.data.message);
        navigate("/categories");
      } else {
        toast.error(res.data.message || "Failed to save category");
      }
    } catch (err) {
      console.error("Error saving category:", err);
      toast.error("Failed to save category. Please try again.");
    }
  };

  if (loading) {
    return (
      <FormPage title="Edit Category" onSave={() => {}} backTo="/categories">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </FormPage>
    );
  }

  return (
    <FormPage
      title={isEdit ? "Edit Category" : "Add Category"}
      onSave={save}
      backTo="/categories"
    >
      <div className="max-w-md">
        <Label className="text-xs">Name</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="mt-1"
        />
      </div>
    </FormPage>
  );
};

export default AddCategory;
