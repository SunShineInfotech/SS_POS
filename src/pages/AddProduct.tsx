// src/pages/ProductForm.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { ProductService, ProductPayload, ProductType } from "@/services/product.service";
import { CategoryCombobox } from "@/components/shared/CategoryCombobox";

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

const ProductForm = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const company = getCompanyData();
  const franchiseType = company?.franchise_type || 1;
  const isEdit = Boolean(id);

  const [formData, setFormData] = useState<Partial<ProductPayload>>({
    product_cat_id: 0,
    product_name: "",
    product_variant_name: "",
    product_base_price: 0,
    product_cgst: 0,
    product_sgst: 0,
    product_igst: 0,
    product_mrp_with_gst: 0,
    product_final_amount: 0,
    product_hsn_code: "",
    product_sku: "",
    product_is_active: 1,
    product_weight: "",
    product_stock: 0,
    product_type: 1,
    product_image: "",
  });

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");

  // Validate ID on edit
  useEffect(() => {
    if (isEdit) {
      const numId = Number(id);
      if (isNaN(numId) || numId <= 0) {
        toast.error("Invalid product ID");
        navigate("/products");
      }
    }
  }, [id, isEdit, navigate]);

  const loadProduct = async () => {
    if (!isEdit) return;
    if (!company) {
      setLoadError("Company data missing. Please sign in again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      const res = await ProductService.getProduct(
        Number(id),
        company.company_id,
        company.franchise_id
      );

      if (res.status === "success" && res.data) {
        const p = res.data;
        setFormData({
          product_cat_id: Number(p.product_cat_id),
          product_name: p.product_name,
          product_variant_name: p.product_variant_name || "",
          product_base_price: Number(p.product_base_price),
          product_cgst: Number(p.product_cgst),
          product_sgst: Number(p.product_sgst),
          product_igst: Number(p.product_igst),
          product_mrp_with_gst: Number(p.product_mrp_with_gst),
          product_final_amount: Number(p.product_final_amount),
          product_hsn_code: p.product_hsn_code || "",
          product_sku: p.product_sku || "",
          product_is_active: p.product_is_active,
          product_weight: p.product_weight || "",
          product_stock: Number(p.product_stock),
          product_type: Number(p.product_type) as ProductType,
          product_image: p.product_image || "",
        });
        if (p.product_image) {
          setImagePreview(
            `${import.meta.env.VITE_API_URL?.replace("/v1_api/", "")}${p.product_image}`
          );
        }
      } else {
        toast.error(res.message || "Product not found");
        navigate("/products");
      }
    } catch (err: any) {
      console.error("Error loading product:", err);
      if (err?.response?.status === 404) {
        toast.error(err.response?.data?.message || "Product not found");
        navigate("/products");
        return;
      }
      const message =
        err?.response?.data?.message ||
        "Could not load this product. Please check your connection and try again.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "number" || name.includes("price") || name.includes("gst")
          ? parseFloat(value) || 0
          : value,
    }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
        setFormData((prev) => ({
          ...prev,
          product_image: reader.result as string,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const save = async () => {
    if (!formData.product_name?.trim()) {
      return toast.error("Product name is required");
    }
    if (!formData.product_cat_id) {
      return toast.error("Select a category");
    }
    if (!company) {
      return toast.error("Company data missing");
    }

    setSaving(true);
    try {
      const payload: Omit<ProductPayload, "type"> = {
        company_id: company.company_id,
        franchise_id: company.franchise_id,
        product_cat_id: Number(formData.product_cat_id),
        product_name: formData.product_name.trim(),
        product_variant_name: formData.product_variant_name || "",
        product_base_price: Number(formData.product_base_price),
        product_cgst: Number(formData.product_cgst),
        product_sgst: Number(formData.product_sgst),
        product_igst: Number(formData.product_igst),
        product_mrp_with_gst: Number(formData.product_mrp_with_gst),
        product_final_amount: Number(formData.product_final_amount),
        product_hsn_code: formData.product_hsn_code || "",
        product_sku: formData.product_sku || "",
        product_is_active: formData.product_is_active as 1 | 2,
        product_weight: formData.product_weight || "",
        product_stock: Number(formData.product_stock),
        product_type: Number(formData.product_type) as ProductType,
        product_image: formData.product_image || "",
      };

      let res;
      if (isEdit) {
        const numericId = Number(id);
        if (isNaN(numericId) || numericId <= 0) {
          toast.error("Invalid product ID");
          return;
        }
        res = await ProductService.updateProduct(numericId, payload);
      } else {
        res = await ProductService.createProduct(payload);
      }

      if (res.status === "success") {
        toast.success(res.message);
        navigate("/products");
      } else {
        toast.error(res.message || "Failed to save product");
      }
    } catch (err: any) {
      console.error("Error saving product:", err);
      toast.error(
        err?.response?.data?.message || "Failed to save product. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saving) save();
  };

  const handleCancel = () => navigate("/products");

  return (
    <div className="mx-auto w-full ">
      <Card className="border-border shadow-card">
        <CardHeader className="flex flex-row items-start gap-3 border-b border-border pb-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PackagePlus className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="font-display text-lg">
              {isEdit ? "Edit Product" : "New Product"}
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              {isEdit
                ? "Update product details, pricing, and stock."
                : "Add a new product to your inventory."}
            </CardDescription>
          </div>
        </CardHeader>

        {loading ? (
          <CardContent className="py-10">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading product...
            </div>
          </CardContent>
        ) : loadError ? (
          <>
            <CardContent className="space-y-4 pt-6">
              <p className="text-sm text-destructive">{loadError}</p>
            </CardContent>
            <CardFooter className="justify-end gap-2 border-t border-border pt-5">
              <Button variant="outline" onClick={handleCancel}>
                Back to Products
              </Button>
              <Button onClick={loadProduct}>Retry</Button>
            </CardFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-5 pt-6">
              {/* ------------------------------------------------------------------
                  Common fields (visible for both Shop and Restaurant)
              ------------------------------------------------------------------ */}
              <div>
                <Label className="text-xs font-semibold">Category *</Label>
                <div className="mt-1.5">
                  <CategoryCombobox
                    companyId={company?.company_id || ""}
                    franchiseId={company?.franchise_id || ""}
                    value={Number(formData.product_cat_id) || 0}
                    onChange={(catId) =>
                      setFormData((prev) => ({ ...prev, product_cat_id: catId }))
                    }
                    disabled={saving}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="product_name" className="text-xs font-semibold">
                  Product Name *
                </Label>
                <Input
                  id="product_name"
                  name="product_name"
                  value={formData.product_name || ""}
                  onChange={handleChange}
                  placeholder="e.g. Classic Coffee"
                  disabled={saving}
                  required
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="product_image" className="text-xs font-semibold">
                  Image
                </Label>
                <Input
                  id="product_image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  disabled={saving}
                  className="mt-1.5"
                />
                {imagePreview && (
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="mt-2 h-20 w-20 rounded-lg border object-cover"
                  />
                )}
              </div>

              <div>
                <Label htmlFor="product_mrp_with_gst" className="text-xs font-semibold">
                  MRP (with GST)
                </Label>
                <Input
                  id="product_mrp_with_gst"
                  name="product_mrp_with_gst"
                  type="number"
                  step="0.01"
                  value={formData.product_mrp_with_gst || ""}
                  onChange={handleChange}
                  disabled={saving}
                  className="mt-1.5"
                />
              </div>

              {/* Status */}
              <div>
                <Label className="mb-2 block text-xs font-semibold">Status</Label>
                <RadioGroup
                  value={String(formData.product_is_active)}
                  onValueChange={(val) =>
                    setFormData((prev) => ({
                      ...prev,
                      product_is_active: Number(val) as 1 | 2,
                    }))
                  }
                  className="grid grid-cols-2 gap-3"
                >
                  <label
                    htmlFor="p-active"
                    className={`flex cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-sm transition-colors ${
                      formData.product_is_active === 1
                        ? "border-primary bg-primary/5 text-primary font-medium"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <RadioGroupItem value="1" id="p-active" disabled={saving} />
                    Active
                  </label>
                  <label
                    htmlFor="p-inactive"
                    className={`flex cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-sm transition-colors ${
                      formData.product_is_active === 2
                        ? "border-primary bg-primary/5 text-primary font-medium"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <RadioGroupItem value="2" id="p-inactive" disabled={saving} />
                    Inactive
                  </label>
                </RadioGroup>
              </div>

              {/* Product Type */}
              <div>
                <Label className="mb-2 block text-xs font-semibold">Product Type</Label>
                <RadioGroup
                  value={String(formData.product_type)}
                  onValueChange={(val) =>
                    setFormData((prev) => ({
                      ...prev,
                      product_type: Number(val) as ProductType,
                    }))
                  }
                  className="grid grid-cols-3 gap-3"
                >
                  <label
                    htmlFor="p-sales"
                    className={`flex cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-sm transition-colors ${
                      formData.product_type === 1
                        ? "border-primary bg-primary/5 text-primary font-medium"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <RadioGroupItem value="1" id="p-sales" disabled={saving} />
                    Sales
                  </label>
                  <label
                    htmlFor="p-purchase"
                    className={`flex cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-sm transition-colors ${
                      formData.product_type === 2
                        ? "border-primary bg-primary/5 text-primary font-medium"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <RadioGroupItem value="2" id="p-purchase" disabled={saving} />
                    Purchase
                  </label>
                  <label
                    htmlFor="p-both"
                    className={`flex cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-sm transition-colors ${
                      formData.product_type === 3
                        ? "border-primary bg-primary/5 text-primary font-medium"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <RadioGroupItem value="3" id="p-both" disabled={saving} />
                    Both
                  </label>
                </RadioGroup>
              </div>

              {/* ------------------------------------------------------------------
                  Shop-only fields (franchise_type === 1)
              ------------------------------------------------------------------ */}
              {franchiseType === 1 && (
                <>
                  <div>
                    <Label htmlFor="product_variant_name" className="text-xs font-semibold">
                      Variant Name
                    </Label>
                    <Input
                      id="product_variant_name"
                      name="product_variant_name"
                      value={formData.product_variant_name || ""}
                      onChange={handleChange}
                      placeholder="e.g. Large"
                      disabled={saving}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="product_sku" className="text-xs font-semibold">
                      SKU
                    </Label>
                    <Input
                      id="product_sku"
                      name="product_sku"
                      value={formData.product_sku || ""}
                      onChange={handleChange}
                      placeholder="e.g. COF-001"
                      disabled={saving}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="product_hsn_code" className="text-xs font-semibold">
                      HSN Code
                    </Label>
                    <Input
                      id="product_hsn_code"
                      name="product_hsn_code"
                      value={formData.product_hsn_code || ""}
                      onChange={handleChange}
                      placeholder="e.g. 2101"
                      disabled={saving}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="product_base_price" className="text-xs font-semibold">
                      Base Price
                    </Label>
                    <Input
                      id="product_base_price"
                      name="product_base_price"
                      type="number"
                      step="0.01"
                      value={formData.product_base_price || ""}
                      onChange={handleChange}
                      disabled={saving}
                      className="mt-1.5"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="product_cgst" className="text-xs font-semibold">
                        CGST %
                      </Label>
                      <Input
                        id="product_cgst"
                        name="product_cgst"
                        type="number"
                        step="0.01"
                        value={formData.product_cgst || ""}
                        onChange={handleChange}
                        disabled={saving}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="product_sgst" className="text-xs font-semibold">
                        SGST %
                      </Label>
                      <Input
                        id="product_sgst"
                        name="product_sgst"
                        type="number"
                        step="0.01"
                        value={formData.product_sgst || ""}
                        onChange={handleChange}
                        disabled={saving}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="product_igst" className="text-xs font-semibold">
                        IGST %
                      </Label>
                      <Input
                        id="product_igst"
                        name="product_igst"
                        type="number"
                        step="0.01"
                        value={formData.product_igst || ""}
                        onChange={handleChange}
                        disabled={saving}
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="product_final_amount" className="text-xs font-semibold">
                      Final Amount
                    </Label>
                    <Input
                      id="product_final_amount"
                      name="product_final_amount"
                      type="number"
                      step="0.01"
                      value={formData.product_final_amount || ""}
                      onChange={handleChange}
                      disabled={saving}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="product_stock" className="text-xs font-semibold">
                      Opening Stock
                    </Label>
                    <Input
                      id="product_stock"
                      name="product_stock"
                      type="number"
                      step="0.01"
                      value={formData.product_stock || ""}
                      onChange={handleChange}
                      disabled={saving}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="product_weight" className="text-xs font-semibold">
                      Weight
                    </Label>
                    <Input
                      id="product_weight"
                      name="product_weight"
                      value={formData.product_weight || ""}
                      onChange={handleChange}
                      placeholder="e.g. 500g"
                      disabled={saving}
                      className="mt-1.5"
                    />
                  </div>
                </>
              )}
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
                  "Create product"
                )}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
};

export default ProductForm;