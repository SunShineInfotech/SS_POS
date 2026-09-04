import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { toast } from "sonner";
import axios from "axios";

interface Product {
  id: number;
  name: string;
  sku: string;
  final_amount: number;
  stock: number;
  is_active: number;
}

const columns = [
  { key: "name" as const, label: "Name" },
  { key: "sku" as const, label: "SKU" },
  {
    key: "final_amount" as const,
    label: "Price",
    render: (value: any) => `₹${Number(value || 0).toFixed(2)}`,
  },
  // { key: "stock" as const, label: "Stock" },
  {
    key: "is_active" as const,
    label: "Status",
    render: (value: any) => (
      <span
        className={`px-2 py-0.5 rounded text-[10px] font-medium ${
          Number(value) === 1
            ? "bg-accent/10 text-accent"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {Number(value) === 1 ? "Active" : "Inactive"}
      </span>
    ),
  },
];

const API_URL =
  import.meta.env.VITE_API_URL || "https://sunshineproduct.in/POS/v1_api/";

const getUserProfile = () =>
  JSON.parse(localStorage.getItem("company_data") || "{}");

const Products = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Product[]>([]);

  const fetchProducts = async () => {
    try {
      const userProfile = getUserProfile();
      const res = await axios.post(`${API_URL}product.php`, {
        type: 2,
        company_id: userProfile.company_id,
        franchise_id: userProfile.franchise_id,
      });

      console.log("Fetch Products Response:", res.data);
      if (res.data.status === "success") {
        const tempData = res.data.data.map((item: any) => ({
          id: item.product_id,
          name: item.product_name,
          sku: item.category_name,
          final_amount: item.product_final_amount,
          // stock: item.product_stock,
          is_active: item.product_is_active,
        }));
        setData(tempData);
      } else {
        toast.error(res.data.message || "Failed to fetch products");
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Failed to fetch products. Please try again.");
    }
  };

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (id: number) => {
    const userProfile = getUserProfile();
    try {
      const res = await axios.post(`${API_URL}product.php`, {
        type: 4,
        company_id: userProfile.company_id,
        franchise_id: userProfile.franchise_id,
        product_id: id,
      });

      if (res.data.status === "success") {
        setData((prev) => prev.filter((p) => p.id !== id));
        toast.success(res.data.message || "Deleted");
      } else {
        toast.error(res.data.message || "Failed to delete product");
      }
    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error("Failed to delete product. Please try again.");
    }
  };

  return (
    <DataTable
      data={data}
      columns={columns}
      onAdd={() => navigate("/products/new")}
      onEdit={(row) => navigate(`/products/${row.id}`)}
      onDelete={(id) => handleDelete(id as number)}
      addLabel="Add Product"
      hideStatusToggle
    />
  );
};

export default Products;
