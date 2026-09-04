import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FormPage } from "@/components/shared/FormPage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import axios from "axios";
import { Check, ChevronsUpDown, ImagePlus, Plus, X } from "lucide-react";

interface CategoryOption {
  id: number;
  name: string;
}

interface ProductForm {
  reference_code: string;
  cat_id: string;
  name: string;
  variant_name: string;
  image: string; // base64 (new upload) or existing stored path
  base_price: string;
  cgst: string;
  sgst: string;
  igst: string;
  mrp_with_gst: string;
  final_amount: string;
  hsn_code: string;
  sku: string;
  is_main: boolean;
  priority: string;
  is_active: boolean;
  weight: string;
  stock: string;
  unit: string;
  code: string;
  type: string;
}

const EMPTY_FORM: ProductForm = {
  reference_code: "",
  cat_id: "",
  name: "",
  variant_name: "",
  image: "",
  base_price: "",
  cgst: "",
  sgst: "",
  igst: "",
  mrp_with_gst: "",
  final_amount: "",
  hsn_code: "",
  sku: "",
  is_main: false,
  priority: "0",
  is_active: true,
  weight: "",
  stock: "",
  unit: "",
  code: "",
  type: "",
};

const PRODUCT_TYPE_OPTIONS = [
  { value: "1", label: "Sales Only" },
  { value: "2", label: "Purchase Only" },
  { value: "3", label: "Both" },
];

const API_URL =
  import.meta.env.VITE_API_URL || "https://sunshineproduct.in/POS/v1_api/";
const IMAGE_BASE_URL =
  import.meta.env.VITE_IMAGE_BASE_URL ||
  "https://sunshineproduct.in/POS/v1_api/";

const getUserProfile = () =>
  JSON.parse(localStorage.getItem("company_data") || "{}");

const AddProduct = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [imagePreview, setImagePreview] = useState<string>("");

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  const setField = <K extends keyof ProductForm>(
    key: K,
    value: ProductForm[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  const loadCategories = async () => {
    try {
      const userProfile = getUserProfile();
      const res = await axios.post(`${API_URL}category.php`, {
        type: 2,
        company_id: userProfile.company_id,
        franchise_id: userProfile.franchise_id,
      });
      if (res.data.status === "success") {
        setCategories(
          res.data.data.map((c: any) => ({
            id: c.category_id,
            name: c.category_name,
          })),
        );
      }
    } catch (err) {
      console.error("Error loading categories:", err);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (!isEdit) return;

    const loadProduct = async () => {
      try {
        const userProfile = getUserProfile();
        const res = await axios.post(`${API_URL}product.php`, {
          type: 5,
          company_id: userProfile.company_id,
          franchise_id: userProfile.franchise_id,
          product_id: id,
        });

        if (res.data.status === "success") {
          const p = res.data.data;
          setForm({
            reference_code: p.product_reference_code || "",
            cat_id: p.product_cat_id ? String(p.product_cat_id) : "",
            name: p.product_name || "",
            variant_name: p.product_variant_name || "",
            image: p.product_image || "",
            base_price: p.product_base_price ?? "",
            cgst: p.product_cgst ?? "",
            sgst: p.product_sgst ?? "",
            igst: p.product_igst ?? "",
            mrp_with_gst: p.product_mrp_with_gst ?? "",
            final_amount: p.product_final_amount ?? "",
            hsn_code: p.product_hsn_code || "",
            sku: p.product_sku || "",
            is_main: Number(p.product_is_main) === 1,
            priority: String(p.product_priority ?? "0"),
            is_active: Number(p.product_is_active) === 1,
            weight: p.product_weight || "",
            stock: p.product_stock ?? "",
            unit: p.product_unit_it || "",
            code: p.product_code || "",
            type: p.product_type || "",
          });
          if (p.product_image)
            setImagePreview(`${IMAGE_BASE_URL}${p.product_image}`);
        } else {
          toast.error(res.data.message || "Product not found");
          navigate("/products");
        }
      } catch (err) {
        console.error("Error loading product:", err);
        toast.error("Failed to load product. Please try again.");
        navigate("/products");
      } finally {
        setLoading(false);
      }
    };
    loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/"))
      return toast.error("Please select a valid image file");
    if (file.size > 2 * 1024 * 1024)
      return toast.error("Image must be under 2MB");

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setField("image", base64);
      setImagePreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setField("image", "");
    setImagePreview("");
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return toast.error("Enter category name");

    setSavingCategory(true);
    try {
      const userProfile = getUserProfile();
      const res = await axios.post(`${API_URL}category.php`, {
        type: 1,
        company_id: userProfile.company_id,
        franchise_id: userProfile.franchise_id,
        category_name: newCategoryName.trim(),
      });

      if (res.data.status === "success") {
        const newCat: CategoryOption = {
          id: res.data.brand_id,
          name: newCategoryName.trim(),
        };
        setCategories((prev) => [...prev, newCat]);
        setField("cat_id", String(newCat.id));
        toast.success(res.data.message || "Category added");
        setNewCategoryName("");
        setCategoryModalOpen(false);
      } else {
        toast.error(res.data.message || "Failed to add category");
      }
    } catch (err) {
      console.error("Error adding category:", err);
      toast.error("Failed to add category. Please try again.");
    } finally {
      setSavingCategory(false);
    }
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Enter product name");
    if (!form.cat_id) return toast.error("Select a category");

    const userProfile = getUserProfile();

    try {
      const res = await axios.post(`${API_URL}product.php`, {
        type: isEdit ? 3 : 1,
        company_id: userProfile.company_id,
        franchise_id: userProfile.franchise_id,
        ...(isEdit && { product_id: id }),
        product_reference_code: form.reference_code,
        product_cat_id: form.cat_id,
        product_name: form.name,
        product_variant_name: form.variant_name,
        product_image: form.image,
        product_base_price: form.base_price || 0,
        product_cgst: form.cgst || 0,
        product_sgst: form.sgst || 0,
        product_igst: form.igst || 0,
        product_mrp_with_gst: form.mrp_with_gst || 0,
        product_final_amount: form.final_amount || 0,
        product_hsn_code: form.hsn_code,
        product_sku: form.sku,
        product_is_main: form.is_main ? 1 : 0,
        product_priority: form.priority || 0,
        product_is_active: form.is_active ? 1 : 0,
        product_weight: form.weight,
        product_stock: form.stock || 0,
        product_unit_it: form.unit,
        product_code: form.code,
        product_type: form.type,
      });

      if (res.data.status === "success") {
        toast.success(res.data.message);
        navigate("/products");
      } else {
        toast.error(res.data.message || "Failed to save product");
      }
    } catch (err) {
      console.error("Error saving product:", err);
      toast.error("Failed to save product. Please try again.");
    }
  };

  if (loading) {
    return (
      <FormPage title="Edit Product" onSave={() => {}} backTo="/products">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </FormPage>
    );
  }

  const selectedCategoryName = categories.find(
    (c) => String(c.id) === form.cat_id,
  )?.name;

  return (
    <FormPage
      title={isEdit ? "Edit Product" : "Add Product"}
      onSave={save}
      backTo="/products"
    >
      <div className="max-w-2xl space-y-6">
        <div>
          <Label className="text-xs">Product Image</Label>
          <div className="mt-1 flex items-center gap-3">
            {imagePreview ? (
              <div className="relative h-20 w-20 rounded-lg overflow-hidden border border-border">
                <img
                  src={imagePreview}
                  alt="Product"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="h-20 w-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
                <ImagePlus className="h-5 w-5 text-muted-foreground" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />
              </label>
            )}
            {imagePreview && (
              <label className="text-xs text-primary font-medium cursor-pointer">
                Change image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />
              </label>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Product Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Variant Name</Label>
            <Input
              value={form.variant_name}
              onChange={(e) => setField("variant_name", e.target.value)}
              className="mt-1"
              placeholder="e.g. Red / XL"
            />
          </div>

          <div>
            <Label className="text-xs">Category *</Label>
            <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={categoryOpen}
                  className="mt-1 w-full justify-between font-normal"
                >
                  {selectedCategoryName || "Select category"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Search category..." />
                  <CommandList>
                    <CommandEmpty>No category found.</CommandEmpty>
                    <CommandGroup>
                      {categories.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.name}
                          onSelect={() => {
                            setField("cat_id", String(c.id));
                            setCategoryOpen(false);
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${
                              form.cat_id === String(c.id)
                                ? "opacity-100"
                                : "opacity-0"
                            }`}
                          />
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          setCategoryOpen(false);
                          setCategoryModalOpen(true);
                        }}
                        className="text-primary font-medium cursor-pointer"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Category
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label className="text-xs">Reference Code</Label>
            <Input
              value={form.reference_code}
              onChange={(e) => setField("reference_code", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">SKU</Label>
            <Input
              value={form.sku}
              onChange={(e) => setField("sku", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Product Code</Label>
            <Input
              value={form.code}
              onChange={(e) => setField("code", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">HSN Code</Label>
            <Input
              value={form.hsn_code}
              onChange={(e) => setField("hsn_code", e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Product Type</Label>
            <RadioGroup
              value={form.type}
              onValueChange={(v) => setField("type", v)}
              className="mt-2 flex flex-wrap gap-4"
            >
              {PRODUCT_TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  htmlFor={`type-${opt.value}`}
                  className="flex items-center gap-2 text-xs font-medium cursor-pointer"
                >
                  <RadioGroupItem value={opt.value} id={`type-${opt.value}`} />
                  {opt.label}
                </label>
              ))}
            </RadioGroup>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="font-display text-sm font-semibold mb-3">
            Pricing & Tax
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Base Price</Label>
              <Input
                type="number"
                value={form.base_price}
                onChange={(e) => setField("base_price", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">CGST (%)</Label>
              <Input
                type="number"
                value={form.cgst}
                onChange={(e) => setField("cgst", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">SGST (%)</Label>
              <Input
                type="number"
                value={form.sgst}
                onChange={(e) => setField("sgst", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">IGST (%)</Label>
              <Input
                type="number"
                value={form.igst}
                onChange={(e) => setField("igst", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">MRP (with GST)</Label>
              <Input
                type="number"
                value={form.mrp_with_gst}
                onChange={(e) => setField("mrp_with_gst", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Final Amount</Label>
              <Input
                type="number"
                value={form.final_amount}
                onChange={(e) => setField("final_amount", e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="font-display text-sm font-semibold mb-3">Inventory</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Stock</Label>
              <Input
                type="number"
                value={form.stock}
                onChange={(e) => setField("stock", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Unit</Label>
              <Input
                value={form.unit}
                onChange={(e) => setField("unit", e.target.value)}
                className="mt-1"
                placeholder="e.g. pcs / kg"
              />
            </div>
            <div>
              <Label className="text-xs">Weight</Label>
              <Input
                value={form.weight}
                onChange={(e) => setField("weight", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Input
                type="number"
                value={form.priority}
                onChange={(e) => setField("priority", e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4 flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_main}
              onChange={(e) => setField("is_main", e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Main Product
          </label>
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setField("is_active", e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Active
          </label>
        </div>
      </div>

      <Dialog open={categoryModalOpen} onOpenChange={setCategoryModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Category Name</Label>
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. Beverages"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCategory();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCategoryModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddCategory}
              disabled={savingCategory}
            >
              {savingCategory ? "Saving..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FormPage>
  );
};

export default AddProduct;
