// src/pages/Products.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { toast } from "sonner";
import { ProductService, Product } from "@/services/product.service";
import {
  ImagePreviewModal,
  PreviewImage,
} from "@/components/shared/ImagePreviewModal";

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

const Products = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Product[]>([]);
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const company = getCompanyData();
  const franchiseType = company?.franchise_type || 1;

  const columns: any = [
    { key: "product_name", label: "Name" },
    {
      key: "category_name",
      label: "Category",
      render: (v: any) => v || "N/A",
    },
    {
      key: "product_image",
      label: "Image",
      render: (v: any, row: any) =>
        v ? (
          <button
            type="button"
            onClick={(e) => {
              // Mobile card click opens edit — don't trigger that
              e.stopPropagation();
              setPreviewImage({
                src: `${v}`,
                title: row.product_name,
                subtitle: row.category_name || undefined,
              });
            }}
            className="block rounded transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
            aria-label={`View image of ${row.product_name}`}
          >
            <img
              src={`${v}`}
              alt=""
              className="h-8 w-8 cursor-zoom-in rounded object-cover"
            />
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">No image</span>
        ),
    },
    {
      key: "product_mrp_with_gst",
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
    <>
      <DataTable
        data={data}
        columns={columns}
        onAdd={() => navigate("/products/new")}
        onEdit={(row) => navigate(`/products/${row.id}`)} // row.id = product_id
        onDelete={(id) => handleDelete(id as number)}
        addLabel="Add Product"
        hideStatusToggle
      />

      {/* Rendered outside the table so clicks inside the popup don't bubble to row/card handlers */}
      <ImagePreviewModal
        image={previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </>
  );
};

export default Products;
