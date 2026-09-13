// src/pages/Categories.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { toast } from "sonner";
import { CategoryService } from "@/services/category.service";
import { Category } from "@/services/category.types";

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

const Categories = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Category[]>([]);
  const company = getCompanyData();

  const columns = [
    { key: "category_name", label: "Name" },
    {
      key: "category_status",
      label: "Status",
      render: (value: any) => {
        const status = Number(value);
        return (
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-medium ${
              status === 1
                ? "bg-accent/10 text-accent"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {status === 1 ? "Active" : "Inactive"}
          </span>
        );
      },
    },
  ];

  const fetchCategories = async () => {
    if (!company) {
      toast.error("Company data not found");
      return;
    }
    try {
      const res = await CategoryService.getCategories(
        company.company_id,
        company.franchise_id
      );
      if (res.status === "success" && res.data) {
        // ✅ Map category_id → id for DataTable
        const mapped = res.data.map((item) => ({
          ...item,
          id: item.category_id,
        }));
        setData(mapped);
      } else {
        toast.error(res.message || "Failed to fetch categories");
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
      toast.error("Failed to fetch categories.");
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleDelete = async (id: number) => {
    if (!company) return;
    try {
      const res = await CategoryService.deleteCategory(
        id,
        company.company_id,
        company.franchise_id
      );
      if (res.status === "success") {
        setData((prev) => prev.filter((c) => Number(c.category_id) !== id));
        toast.success(res.message || "Deleted");
      } else {
        toast.error(res.message || "Failed to delete");
      }
    } catch (error) {
      console.error("Error deleting:", error);
      toast.error("Failed to delete category.");
    }
  };

  return (
    <DataTable
      data={data}
      columns={columns}
      onAdd={() => navigate("/categories/new")}
      onEdit={(row) => navigate(`/categories/${row.id}`)} // row.id is now category_id
      onDelete={(id) => handleDelete(id as number)}
      addLabel="Add Category"
      hideStatusToggle
    />
  );
};

export default Categories;