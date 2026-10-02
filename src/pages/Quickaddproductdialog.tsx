import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const API_URL =
  import.meta.env.VITE_API_URL || "https://sunshineproduct.in/POS/v1_api/";

const getUserProfile = () =>
  JSON.parse(localStorage.getItem("company_data") || "{}");

/** Product shape used by the purchase form */
export interface PurchaseProduct {
  id: string;
  name: string;
  sku: string;
  mrp: number;
  price: number; // excl. GST
  gst: number; // total GST %
}

/** Maps a tbl_product row from product.php into PurchaseProduct */
export const toPurchaseProduct = (p: any): PurchaseProduct => {
  const igst = Number(p.product_igst) || 0;
  const gst =
    igst > 0
      ? igst
      : (Number(p.product_cgst) || 0) + (Number(p.product_sgst) || 0);
  return {
    id: String(p.product_id),
    name: p.product_name,
    sku: p.product_sku || "",
    mrp: Number(p.product_mrp_with_gst) || 0,
    price: Number(p.product_base_price) || 0,
    gst,
  };
};

// product_type = 2 → purchase item (matches product.php type 7 filter)
const PURCHASE_PRODUCT_TYPE = 2;
const GST_SLABS = ["0", "5", "12", "18", "28"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  onCreated: (product: PurchaseProduct) => void;
}

interface ProductForm {
  name: string;
  categoryId: string;
  sku: string;
  hsn: string;
  price: string;
  gst: string;
  mrp: string;
}

const EMPTY: ProductForm = {
  name: "",
  categoryId: "",
  sku: "",
  hsn: "",
  price: "",
  gst: "0",
  mrp: "",
};

const decimal = (v: string) =>
  v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export const QuickAddProductDialog = ({
  open,
  onOpenChange,
  defaultName = "",
  onCreated,
}: Props) => {
  const [form, setForm] = useState<ProductForm>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, name: defaultName });
      setErrors({});
    }
  }, [open, defaultName]);

  useEffect(() => {
    if (!open || categories.length) return;
    const loadCategories = async () => {
      try {
        const u = getUserProfile();
        const res = await axios.post(`${API_URL}category.php`, {
          type: 2,
          company_id: u.company_id,
          franchise_id: u.franchise_id,
        });
        if (res.data.status === "success") {
          setCategories(
            res.data.data.map((c: any) => ({
              id: String(c.category_id),
              name: c.category_name,
            })),
          );
        }
      } catch (err) {
        console.error("Error loading categories:", err);
      }
    };
    loadCategories();
  }, [open, categories.length]);

  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const priceWithGst = round2(num(form.price) * (1 + num(form.gst) / 100));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Enter the product name";
    if (num(form.price) <= 0) e.price = "Enter the purchase price";
    if (num(form.mrp) <= 0) e.mrp = "Enter the MRP";
    return e;
  };

  const submit = async () => {
    if (saving) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const u = getUserProfile();
      const gst = num(form.gst);
      const payload = {
        type: 1,
        company_id: u.company_id,
        franchise_id: u.franchise_id,
        product_cat_id: form.categoryId ? Number(form.categoryId) : 0,
        product_name: form.name.trim(),
        product_image: "",
        product_base_price: num(form.price),
        product_cgst: gst / 2,
        product_sgst: gst / 2,
        product_igst: 0,
        product_mrp_with_gst: num(form.mrp),
        product_final_amount: priceWithGst,
        product_hsn_code: form.hsn.trim(),
        product_sku: form.sku.trim(),
        product_is_active: 1,
        product_weight: "",
        product_stock: 0,
        product_type: PURCHASE_PRODUCT_TYPE,
      };

      const res = await axios.post(`${API_URL}product.php`, payload);

      if (res.data.status === "success") {
        onCreated({
          id: String(res.data.product_id),
          name: payload.product_name,
          sku: payload.product_sku,
          mrp: payload.product_mrp_with_gst,
          price: payload.product_base_price,
          gst,
        });
        toast.success("Product added");
        onOpenChange(false);
      } else {
        toast.error(res.data.message || "Couldn't add the product");
      }
    } catch (err: any) {
      console.error("Error adding product:", err);
      toast.error(
        err?.response?.data?.message ||
          "Couldn't add the product. Check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add product</DialogTitle>
          <DialogDescription>
            Saved as a purchase item and filled into this row.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="qp-name" className="text-xs">
              Product name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="qp-name"
              autoFocus
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Cooking Oil (1L)"
              className={cn("mt-1", errors.name && "border-destructive")}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          <div>
            <Label className="text-xs">Category</Label>
            <Select
              value={form.categoryId}
              onValueChange={(v) => set("categoryId", v)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="qp-sku" className="text-xs">
              SKU
            </Label>
            <Input
              id="qp-sku"
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
              placeholder="Optional"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="qp-hsn" className="text-xs">
              HSN code
            </Label>
            <Input
              id="qp-hsn"
              inputMode="numeric"
              value={form.hsn}
              onChange={(e) => set("hsn", e.target.value.replace(/\D/g, ""))}
              placeholder="Optional"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">GST %</Label>
            <Select value={form.gst} onValueChange={(v) => set("gst", v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GST_SLABS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="qp-price" className="text-xs">
              Purchase price (excl. GST){" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="qp-price"
              inputMode="decimal"
              value={form.price}
              onChange={(e) => set("price", decimal(e.target.value))}
              placeholder="0.00"
              className={cn("mt-1", errors.price && "border-destructive")}
            />
            {errors.price ? (
              <p className="mt-1 text-xs text-destructive">{errors.price}</p>
            ) : (
              num(form.price) > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  ₹{priceWithGst.toFixed(2)} incl. GST
                </p>
              )
            )}
          </div>

          <div>
            <Label htmlFor="qp-mrp" className="text-xs">
              MRP <span className="text-destructive">*</span>
            </Label>
            <Input
              id="qp-mrp"
              inputMode="decimal"
              value={form.mrp}
              onChange={(e) => set("mrp", decimal(e.target.value))}
              placeholder="0.00"
              className={cn("mt-1", errors.mrp && "border-destructive")}
            />
            {errors.mrp && (
              <p className="mt-1 text-xs text-destructive">{errors.mrp}</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
