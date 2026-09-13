// src/pages/Products.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { toast } from "sonner";
import { ProductService, Product } from "@/services/product.service";

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

const Products = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Product[]>([]);
  const company = getCompanyData();
  const franchiseType = company?.franchise_type || 1;

  const columns = [
    { key: "product_name", label: "Name" },
    {
      key: "category_name",
      label: "Category",
      render: (v: any) => v || "N/A",
    },
    {
      key: "product_image",
      label: "Image",
      render: (v: any) =>
        v ? (
          <img src={`${v}`} alt="" className="h-8 w-8 rounded object-cover" />
        ) : (
          <span className="text-xs text-muted-foreground">No image</span>
        ),
    },
    {
      key: "product_final_amount",
      label: "Price",
      render: (v: any) => `₹${Number(v || 0).toFixed(2)}`,
    },
    {
      key: "product_is_active",
      label: "Status",
      render: (v: any) => {
        const status = Number(v);
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

  // Add extra columns for Shop
  if (franchiseType === 1) {
    columns.push(
      { key: "product_sku", label: "SKU", render: (v: any) => v || "-" },
      { key: "product_hsn_code", label: "HSN", render: (v: any) => v || "-" },
      {
        key: "product_stock",
        label: "Stock",
        render: (v: any) => Number(v || 0).toFixed(0),
      },
    );
  } else {
    // Restaurant: show product type
    columns.push({
      key: "product_type",
      label: "Type",
      render: (v: any) => {
        const types: Record<number, string> = {
          1: "Sales",
          2: "Purchase",
          3: "Both",
        };
        return types[Number(v)] || "-";
      },
    });
  }

  const fetchProducts = async () => {
    if (!company) {
      toast.error("Company data not found");
      return;
    }
    try {
      const res = await ProductService.getProducts(
        company.company_id,
        company.franchise_id,
      );
      if (res.status === "success" && res.data) {
        // Map product_id → id for DataTable
        const mapped = res.data.map((item) => ({
          ...item,
          id: item.product_id,
        }));
        setData(mapped);
      } else {
        toast.error(res.message || "Failed to fetch products");
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Failed to fetch products.");
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleDelete = async (id: number) => {
    if (!company) return;
    try {
      const res = await ProductService.deleteProduct(
        id,
        company.company_id,
        company.franchise_id,
      );
      if (res.status === "success") {
        setData((prev) => prev.filter((p) => Number(p.product_id) !== id));
        toast.success(res.message || "Deleted");
      } else {
        toast.error(res.message || "Failed to delete");
      }
    } catch (error) {
      console.error("Error deleting:", error);
      toast.error("Failed to delete product.");
    }
  };

  return (
    <DataTable
      data={data}
      columns={columns}
      onAdd={() => navigate("/products/new")}
      onEdit={(row) => navigate(`/products/${row.id}`)} // row.id = product_id
      onDelete={(id) => handleDelete(id as number)}
      addLabel="Add Product"
      hideStatusToggle
    />
  );
};

export default Products;
