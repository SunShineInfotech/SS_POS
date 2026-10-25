// src/pages/ProductForm.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Boxes,
  Check,
  ChevronsUpDown,
  IndianRupee,
  Loader2,
  Package,
  PackagePlus,
  Plus,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ProductService,
  ProductPayload,
  ProductType,
  calculateMrpWithGst,
} from "@/services/product.service";

// Form section wrapper: heading + description + grid of fields
const FormSection = ({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <section className="rounded-xl border border-border p-4">
    <div className="mb-4 flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && (
        <span className="text-xs text-muted-foreground">— {description}</span>
      )}
    </div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  </section>
);

// Compact pill-style radio option
const PillOption = ({
  id,
  value,
  label,
  checked,
  disabled,
}: {
  id: string;
  value: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
}) => (
  <label
    htmlFor={id}
    className={cn(
      "flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors",
      checked
        ? "border-primary bg-primary/5 font-medium text-primary"
        : "border-border text-muted-foreground hover:bg-muted/50",
    )}
  >
    <RadioGroupItem
      value={value}
      id={id}
      disabled={disabled}
      className="h-3.5 w-3.5"
    />
    {label}
  </label>
);

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

interface CategoryOption {
  category_id: number;
  category_name: string;
}

// VITE_API_URL ".../v1_api/" pe end hota hai
const CATEGORY_API = `${import.meta.env.VITE_API_URL}category.php`;

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

  // Category dropdown + "add new category" dialog
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [catSearch, setCatSearch] = useState("");
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catSaving, setCatSaving] = useState(false);

  const selectedCategory = categories.find(
    (c) => c.category_id === Number(formData.product_cat_id),
  );

  // MRP = Base Price + CGST amount + SGST amount (auto-calculated, read-only)
  const gst = calculateMrpWithGst(
    Number(formData.product_base_price),
    Number(formData.product_cgst),
    Number(formData.product_sgst),
  );

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
        company.franchise_id,
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
            `${import.meta.env.VITE_API_URL?.replace("/v1_api/", "")}/${p.product_image}`,
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

  // ---------------------------------------------------------------------------
  // Category helpers
  // ---------------------------------------------------------------------------
  const selectCategory = (catId: number) =>
    setFormData((prev) => ({ ...prev, product_cat_id: catId }));

  const loadCategories = async (): Promise<CategoryOption[]> => {
    if (!company) return [];
    setCatLoading(true);
    try {
      const res = await axios.post(CATEGORY_API, {
        type: 2,
        company_id: company.company_id,
        franchise_id: company.franchise_id,
      });
      const list: CategoryOption[] =
        res.data?.status === "success" && Array.isArray(res.data.data)
          ? res.data.data.map((c: any) => ({
              category_id: Number(c.category_id),
              category_name: c.category_name,
            }))
          : [];
      setCategories(list);
      return list;
    } catch (err) {
      console.error("Error loading categories:", err);
      toast.error("Could not load categories");
      return [];
    } finally {
      setCatLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCategoryDialog = () => {
    setNewCatName(catSearch.trim()); // search me jo type kiya wo prefill
    setCatOpen(false); // pehle popover band, phir dialog
    setCatDialogOpen(true);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCatName.trim();
    if (!name) return toast.error("Category name is required");
    if (!company) return toast.error("Company data missing");

    // Already exist karti hai to wahi select kar do
    const existing = categories.find(
      (c) => c.category_name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      selectCategory(existing.category_id);
      toast.info("Category already exists, selected it for you");
      setCatDialogOpen(false);
      setCatSearch("");
      return;
    }

    setCatSaving(true);
    try {
      const res = await axios.post(CATEGORY_API, {
        type: 1,
        company_id: company.company_id,
        franchise_id: company.franchise_id,
        category_name: name,
        category_status: 1,
      });

      if (res.data?.status === "success") {
        const newId = Number(res.data.category_id);
        setCategories((prev) => [
          { category_id: newId, category_name: name },
          ...prev,
        ]);
        selectCategory(newId); // default selected
        toast.success(res.data.message || "Category added");
        setCatDialogOpen(false);
        setNewCatName("");
        setCatSearch("");
      } else {
        toast.error(res.data?.message || "Failed to add category");
      }
    } catch (err: any) {
      console.error("Error adding category:", err);
      // 409 = server pe duplicate mila -> list refresh karke wahi select kar do
      if (err?.response?.status === 409) {
        const list = await loadCategories();
        const dup = list.find(
          (c) => c.category_name.toLowerCase() === name.toLowerCase(),
        );
        if (dup) {
          selectCategory(dup.category_id);
          setCatDialogOpen(false);
          setCatSearch("");
        }
      }
      toast.error(
        err?.response?.data?.message ||
          "Failed to add category. Please try again.",
      );
    } finally {
      setCatSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Form handlers
  // ---------------------------------------------------------------------------
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
        product_mrp_with_gst: gst.mrp,
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
        err?.response?.data?.message ||
          "Failed to save product. Please try again.",
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
              {/* ===================== Product Details ===================== */}
              <FormSection
                icon={Package}
                title="Product Details"
                description="Basic information"
              >
                <div className="sm:col-span-2">
                  <Label
                    htmlFor="product_name"
                    className="text-xs font-semibold"
                  >
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

                {/* Category (searchable + "Add new category") */}
                <div className="sm:col-span-2">
                  <Label className="text-xs font-semibold">Category *</Label>
                  <div className="mt-1.5">
                    <Popover open={catOpen} onOpenChange={setCatOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={catOpen}
                          disabled={saving}
                          className="w-full justify-between font-normal"
                        >
                          <span
                            className={cn(
                              "truncate",
                              !selectedCategory && "text-muted-foreground",
                            )}
                          >
                            {selectedCategory
                              ? selectedCategory.category_name
                              : "Select a category"}
                          </span>
                          {catLoading ? (
                            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
                          ) : (
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          )}
                        </Button>
                      </PopoverTrigger>

                      <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] p-0"
                        align="start"
                      >
                        <Command>
                          <CommandInput
                            placeholder="Search category..."
                            value={catSearch}
                            onValueChange={setCatSearch}
                          />
                          <CommandList>
                            <CommandEmpty>No category found.</CommandEmpty>
                            <CommandGroup>
                              {categories.map((c) => (
                                <CommandItem
                                  key={c.category_id}
                                  value={`${c.category_name} ${c.category_id}`}
                                  onSelect={() => {
                                    selectCategory(c.category_id);
                                    setCatOpen(false);
                                    setCatSearch("");
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      Number(formData.product_cat_id) ===
                                        c.category_id
                                        ? "opacity-100"
                                        : "opacity-0",
                                    )}
                                  />
                                  {c.category_name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>

                        {/* Hamesha visible, search match ho ya na ho */}
                        <div className="border-t border-border p-1">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={openCategoryDialog}
                            className="w-full justify-start gap-2 text-sm font-medium text-primary hover:text-primary"
                          >
                            <Plus className="h-4 w-4" />
                            {catSearch.trim()
                              ? `Add "${catSearch.trim()}" as new category`
                              : "Add new category"}
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Shop-only fields (franchise_type === 1) */}
                {franchiseType === 1 && (
                  <>
                    <div>
                      <Label
                        htmlFor="product_variant_name"
                        className="text-xs font-semibold"
                      >
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
                      <Label
                        htmlFor="product_sku"
                        className="text-xs font-semibold"
                      >
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
                      <Label
                        htmlFor="product_hsn_code"
                        className="text-xs font-semibold"
                      >
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
                  </>
                )}

                <div className={franchiseType === 1 ? "" : "sm:col-span-2"}>
                  <Label
                    htmlFor="product_image"
                    className="text-xs font-semibold"
                  >
                    Image
                  </Label>
                  <div className="mt-1.5 flex items-center gap-3">
                    <Input
                      id="product_image"
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      disabled={saving}
                    />
                    {imagePreview && (
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="h-10 w-10 shrink-0 rounded-md border object-cover"
                      />
                    )}
                  </div>
                </div>
              </FormSection>

              {/* ===================== Amount ===================== */}
              <FormSection
                icon={IndianRupee}
                title="Amount"
                description="Pricing & GST"
              >
                <div>
                  <Label
                    htmlFor="product_base_price"
                    className="text-xs font-semibold"
                  >
                    Base Price
                  </Label>
                  <Input
                    id="product_base_price"
                    name="product_base_price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.product_base_price || ""}
                    onChange={handleChange}
                    placeholder="0.00"
                    disabled={saving}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="product_cgst"
                    className="text-xs font-semibold"
                  >
                    CGST %
                  </Label>
                  <Input
                    id="product_cgst"
                    name="product_cgst"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.product_cgst || ""}
                    onChange={handleChange}
                    placeholder="0"
                    disabled={saving}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="product_sgst"
                    className="text-xs font-semibold"
                  >
                    SGST %
                  </Label>
                  <Input
                    id="product_sgst"
                    name="product_sgst"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.product_sgst || ""}
                    onChange={handleChange}
                    placeholder="0"
                    disabled={saving}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="product_mrp_with_gst"
                    className="text-xs font-semibold"
                  >
                    MRP (with GST)
                  </Label>
                  <Input
                    id="product_mrp_with_gst"
                    name="product_mrp_with_gst"
                    type="number"
                    value={gst.mrp.toFixed(2)}
                    readOnly
                    disabled
                    className="mt-1.5 bg-muted font-semibold"
                  />
                </div>

                {/* Breakup of the auto-calculated MRP */}
                <p className="text-[11px] text-muted-foreground sm:col-span-2 lg:col-span-4">
                  ₹{gst.base.toFixed(2)} + CGST ₹{gst.cgstAmount.toFixed(2)} +
                  SGST ₹{gst.sgstAmount.toFixed(2)} ={" "}
                  <span className="font-semibold text-foreground">
                    ₹{gst.mrp.toFixed(2)}
                  </span>
                </p>

                {franchiseType === 1 && (
                  <>
                    <div>
                      <Label
                        htmlFor="product_igst"
                        className="text-xs font-semibold"
                      >
                        IGST %
                      </Label>
                      <Input
                        id="product_igst"
                        name="product_igst"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.product_igst || ""}
                        onChange={handleChange}
                        placeholder="0"
                        disabled={saving}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor="product_final_amount"
                        className="text-xs font-semibold"
                      >
                        Final Amount
                      </Label>
                      <Input
                        id="product_final_amount"
                        name="product_final_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.product_final_amount || ""}
                        onChange={handleChange}
                        placeholder="0.00"
                        disabled={saving}
                        className="mt-1.5"
                      />
                    </div>
                  </>
                )}
              </FormSection>

              {/* ===================== Inventory (shop only) ===================== */}
              {franchiseType === 1 && (
                <FormSection icon={Boxes} title="Inventory">
                  <div>
                    <Label
                      htmlFor="product_stock"
                      className="text-xs font-semibold"
                    >
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
                    <Label
                      htmlFor="product_weight"
                      className="text-xs font-semibold"
                    >
                      Weight
                    </Label>
                    <Input
                      id="product_weight"
                      name="product_weight"
                      type="number"
                      step="1.00"
                      value={formData.product_weight || ""}
                      onChange={handleChange}
                      placeholder="e.g. 500g"
                      disabled={saving}
                      className="mt-1.5"
                    />
                  </div>
                </FormSection>
              )}

              {/* ===================== Settings ===================== */}
              <FormSection icon={Settings2} title="Settings">
                <div className="sm:col-span-1 lg:col-span-2">
                  <Label className="mb-2 block text-xs font-semibold">
                    Status
                  </Label>
                  <RadioGroup
                    value={String(formData.product_is_active)}
                    onValueChange={(val) =>
                      setFormData((prev) => ({
                        ...prev,
                        product_is_active: Number(val) as 1 | 2,
                      }))
                    }
                    className="flex flex-wrap gap-2"
                  >
                    <PillOption
                      id="p-active"
                      value="1"
                      label="Active"
                      checked={formData.product_is_active === 1}
                      disabled={saving}
                    />
                    <PillOption
                      id="p-inactive"
                      value="2"
                      label="Inactive"
                      checked={formData.product_is_active === 2}
                      disabled={saving}
                    />
                  </RadioGroup>
                </div>

                <div className="sm:col-span-1 lg:col-span-2">
                  <Label className="mb-2 block text-xs font-semibold">
                    Product Type
                  </Label>
                  <RadioGroup
                    value={String(formData.product_type)}
                    onValueChange={(val) =>
                      setFormData((prev) => ({
                        ...prev,
                        product_type: Number(val) as ProductType,
                      }))
                    }
                    className="flex flex-wrap gap-2"
                  >
                    <PillOption
                      id="p-sales"
                      value="1"
                      label="Sales"
                      checked={formData.product_type === 1}
                      disabled={saving}
                    />
                    <PillOption
                      id="p-purchase"
                      value="2"
                      label="Purchase"
                      checked={formData.product_type === 2}
                      disabled={saving}
                    />
                    <PillOption
                      id="p-both"
                      value="3"
                      label="Both"
                      checked={formData.product_type === 3}
                      disabled={saving}
                    />
                  </RadioGroup>
                </div>
              </FormSection>
            </CardContent>
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
                  "Create product"
                )}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>

      {/* Add new category dialog (form ke bahar, taaki product form submit na ho) */}
      <Dialog
        open={catDialogOpen}
        onOpenChange={(o) => !catSaving && setCatDialogOpen(o)}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleAddCategory} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Add new category</DialogTitle>
              <DialogDescription>
                Save hote hi ye category is product ke liye select ho jayegi.
              </DialogDescription>
            </DialogHeader>

            <div>
              <Label
                htmlFor="new_category_name"
                className="text-xs font-semibold"
              >
                Category Name *
              </Label>
              <Input
                id="new_category_name"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Beverages"
                disabled={catSaving}
                autoFocus
                className="mt-1.5"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCatDialogOpen(false)}
                disabled={catSaving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={catSaving}
                className="min-w-[110px]"
              >
                {catSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Add category"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductForm;
