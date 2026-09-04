import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { saveStore } from "@/lib/store";
import { toast } from "sonner";
import axios from "axios";

interface Category {
  id: number;
  company_id?: number;
  frenchise_id?: number;
  name: string;
  deleted?: boolean;
}

const columns = [{ key: "name" as const, label: "Name" }];

const Categories = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Category[]>([]);
  const persist = (next: Category[]) => {
    setData(next);
    saveStore("categories", next);
  };

  const API_URL =
    import.meta.env.VITE_API_URL || "https://sunshineproduct.in/POS/v1_api/";

  const getUserProfile = () =>
    JSON.parse(localStorage.getItem("company_data") || "{}");

  const fetchCategories = async () => {
    try {
      const userProfile = getUserProfile();
      const res = await axios.post(`${API_URL}category.php`, {
        type: 2,
        company_id: userProfile.company_id,
        franchise_id: userProfile.franchise_id,
      });

      if (res.data.status === "success") {
        const activeOnly = res.data.data.filter(
          (item: any) => item.is_deleted === "1" || item.is_deleted === 1,
        );

        let tempData = activeOnly.map((item: any) => ({
          id: item.category_id,
          company_id: item.company_id,
          frenchise_id: item.franchise_id,
          name: item.category_name,
          deleted: false,
        }));
        persist(tempData); // local store bhi sync rakho
      } else {
        toast.error(res.data.message || "Failed to fetch categories");
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
      toast.error("Failed to fetch categories. Please try again.");
    }
  };

  useEffect(() => {
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (id: number) => {
    const userProfile = getUserProfile();
    try {
      const res = await axios.post(`${API_URL}category.php`, {
        type: 4,
        company_id: userProfile.company_id,
        franchise_id: userProfile.franchise_id,
        category_id: id,
      });

      if (res.data.status === "success") {
        persist(data.filter((c) => c.id !== id));
        toast.success(res.data.message || "Deleted");
      } else {
        toast.error(res.data.message || "Failed to delete category");
      }
    } catch (error) {
      console.error("Error deleting category:", error);
      toast.error("Failed to delete category. Please try again.");
    }
  };

  return (
    <DataTable
      data={data}
      columns={columns}
      onAdd={() => navigate("/categories/new")}
      onEdit={(row) => navigate(`/categories/${row.id}`)}
      onDelete={(id) => handleDelete(id as number)}
      addLabel="Add Category"
      hideStatusToggle
    />
  );
};

export default Categories;
