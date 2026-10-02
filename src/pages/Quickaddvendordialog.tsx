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
import { Textarea } from "@/components/ui/textarea";
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

export interface CreatedVendor {
  id: string;
  name: string;
  mobile: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  onCreated: (vendor: CreatedVendor) => void;
}

interface VendorForm {
  name: string;
  mobile: string;
  email: string;
  gst: string;
  stateId: string;
  city: string;
  address: string;
}

const EMPTY: VendorForm = {
  name: "",
  mobile: "",
  email: "",
  gst: "",
  stateId: "",
  city: "",
  address: "",
};

const GST_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const QuickAddVendorDialog = ({
  open,
  onOpenChange,
  defaultName = "",
  onCreated,
}: Props) => {
  const [form, setForm] = useState<VendorForm>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [states, setStates] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset every time the dialog opens
  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, name: defaultName });
      setErrors({});
    }
  }, [open, defaultName]);

  // Load states once, on first open
  useEffect(() => {
    if (!open || states.length) return;
    const loadStates = async () => {
      try {
        const u = getUserProfile();
        const res = await axios.post(`${API_URL}state.php`, {
          type: 2,
          company_id: u.company_id,
        });
        if (res.data.status === "success") {
          setStates(
            res.data.data.map((s: any) => ({
              id: String(s.state_id),
              name: s.state_name,
            })),
          );
        }
      } catch (err) {
        console.error("Error loading states:", err);
      }
    };
    loadStates();
  }, [open, states.length]);

  const set = <K extends keyof VendorForm>(key: K, value: VendorForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Enter the vendor name";
    if (form.mobile && !/^\d{10}$/.test(form.mobile))
      e.mobile = "Mobile number must be 10 digits";
    if (form.email && !EMAIL_REGEX.test(form.email.trim()))
      e.email = "Enter a valid email";
    if (form.gst && !GST_REGEX.test(form.gst))
      e.gst = "Enter a valid 15-character GSTIN";
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
      const res = await axios.post(`${API_URL}vendor.php`, {
        type: 1,
        company_id: u.company_id,
        franchise_id: u.franchise_id,
        vendor_name: form.name.trim(),
        vendor_mobile_no: form.mobile,
        vendor_email_id: form.email.trim(),
        vendor_state_id: form.stateId ? Number(form.stateId) : 0,
        vendor_city_name: form.city.trim(),
        vendor_address: form.address.trim(),
        vendor_gst_number: form.gst,
        vendor_wallet: 0,
      });

      if (res.data.status === "success") {
        onCreated({
          id: String(res.data.vendor_id),
          name: form.name.trim(),
          mobile: form.mobile,
        });
        toast.success("Vendor added");
        onOpenChange(false);
      } else {
        toast.error(res.data.message || "Couldn't add the vendor");
      }
    } catch (err: any) {
      console.error("Error adding vendor:", err);
      toast.error(
        err?.response?.data?.message ||
          "Couldn't add the vendor. Check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add vendor</DialogTitle>
          <DialogDescription>
            The new vendor is selected on this bill once saved.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="qv-name" className="text-xs">
              Vendor name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="qv-name"
              autoFocus
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Fresh Farm Supplies"
              className={cn("mt-1", errors.name && "border-destructive")}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          <div>
            <Label htmlFor="qv-mobile" className="text-xs">
              Mobile number
            </Label>
            <Input
              id="qv-mobile"
              inputMode="numeric"
              maxLength={10}
              value={form.mobile}
              onChange={(e) =>
                set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              placeholder="9876543210"
              className={cn("mt-1", errors.mobile && "border-destructive")}
            />
            {errors.mobile && (
              <p className="mt-1 text-xs text-destructive">{errors.mobile}</p>
            )}
          </div>

          <div>
            <Label htmlFor="qv-email" className="text-xs">
              Email
            </Label>
            <Input
              id="qv-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="vendor@example.com"
              className={cn("mt-1", errors.email && "border-destructive")}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-destructive">{errors.email}</p>
            )}
          </div>

          <div>
            <Label htmlFor="qv-gst" className="text-xs">
              GST number
            </Label>
            <Input
              id="qv-gst"
              maxLength={15}
              value={form.gst}
              onChange={(e) =>
                set("gst", e.target.value.toUpperCase().replace(/\s/g, ""))
              }
              placeholder="24ABCDE1234F1Z5"
              className={cn("mt-1", errors.gst && "border-destructive")}
            />
            {errors.gst && (
              <p className="mt-1 text-xs text-destructive">{errors.gst}</p>
            )}
          </div>

          <div>
            <Label className="text-xs">State</Label>
            <Select
              value={form.stateId}
              onValueChange={(v) => set("stateId", v)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {states.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="qv-city" className="text-xs">
              City
            </Label>
            <Input
              id="qv-city"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="Ahmedabad"
              className="mt-1"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="qv-address" className="text-xs">
              Address
            </Label>
            <Textarea
              id="qv-address"
              rows={2}
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              className="mt-1"
            />
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
            Add vendor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
