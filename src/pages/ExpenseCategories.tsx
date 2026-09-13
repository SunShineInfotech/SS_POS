import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { toast } from "sonner";
import { ExpenseCategoryService, ExpenseCategory } from "@/services/expenseCategory.service";

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

const ExpenseCategories = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const company = getCompanyData();

  const columns = [
    { key: "expenses_categories_title", label: "Category Name" },
    { key: "c_date", label: "Created", render: (v: any) => v ? new Date(v).toLocaleDateString() : "-" },
  ];

  const fetchData = async () => {
    if (!company) {
      toast.error("Company data not found");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await ExpenseCategoryService.getList(company.company_id, company.franchise_id);
      if (res.status === "success" && res.data) {
        const mapped = res.data.map((item) => ({
          ...item,
          id: item.expenses_categories_id,
        }));
        setData(mapped);
      } else {
        toast.error(res.message || "Failed to fetch categories");
      }
    } catch (error) {
      console.error("Error fetching expense categories:", error);
      toast.error("Failed to fetch categories.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id: number) => {
    if (!company) return;
    try {
      const res = await ExpenseCategoryService.delete(id, company.company_id, company.franchise_id);
      if (res.status === "success") {
        setData((prev) => prev.filter((c) => Number(c.expenses_categories_id) !== id));
        toast.success(res.message || "Deleted");
      } else {
        toast.error(res.message || "Failed to delete");
      }
    } catch (error) {
      console.error("Error deleting:", error);
      toast.error("Failed to delete category.");
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading categories...</div>;
  }

  return (
    <DataTable
      data={data}
      columns={columns}
      onAdd={() => navigate("/expance-category/new")}
      onEdit={(row) => navigate(`/expance-category/${row.id}/edit`)}
      onDelete={(id) => handleDelete(id as number)}
      addLabel="Add Category"
      hideStatusToggle
    />
  );
};

export default ExpenseCategories;