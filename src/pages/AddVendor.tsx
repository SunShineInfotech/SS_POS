// src/pages/AddVendor.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { VendorService } from "@/services/vendor.service";
import { apiClient } from "@/services/api.config";

interface StateOption {
  id: number;
  name: string;
}

interface VendorForm {
  name: string;
  mobile_no: string;
  email_id: string;
  state_id: string;
  city_name: string;
  address: string;
  gst_number: string;
  wallet: string;
}

const EMPTY_FORM: VendorForm = {
  name: "",
  mobile_no: "",
  email_id: "",
  state_id: "",
  city_name: "",
  address: "",
  gst_number: "",
  wallet: "0",
};

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

const AddVendor = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const company = getCompanyData();

  const [form, setForm] = useState<VendorForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [states, setStates] = useState<StateOption[]>([]);

  const setField = <K extends keyof VendorForm>(key: K, value: VendorForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Load states (once)
  useEffect(() => {
    const loadStates = async () => {
      if (!company) return;
      try {
        const res = await apiClient.post('/state.php', {
          type: 2,
          company_id: company.company_id,
        });
        if (res.data.status === "success") {
          setStates(
            res.data.data.map((s: any) => ({
              id: s.state_id,
              name: s.state_name,
            }))
          );
        }
      } catch (err) {
        console.error("Error loading states:", err);
      }
    };
    loadStates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only once

  // Load vendor data on edit
  const loadVendor = async () => {
    if (!isEdit) return;
    if (!company) {
      setLoadError("Company data missing. Please sign in again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      const res = await VendorService.getVendor(
        Number(id),
        company.company_id,
        company.franchise_id
      );
      if (res.status === "success" && res.data) {
        const v = res.data;
        setForm({
          name: v.vendor_name || "",
          mobile_no: v.vendor_mobile_no || "",
          email_id: v.vendor_email_id || "",
          state_id: v.vendor_state_id ? String(v.vendor_state_id) : "",
          city_name: v.vendor_city_name || "",
          address: v.vendor_address || "",
          gst_number: v.vendor_gst_number || "",
          wallet: v.vendor_wallet?.toString() || "0",
        });
      } else {
        toast.error(res.message || "Vendor not found");
        navigate("/vendors");
      }
    } catch (err: any) {
      console.error("Error loading vendor:", err);
      if (err?.response?.status === 404) {
        toast.error(err.response?.data?.message || "Vendor not found");
        navigate("/vendors");
        return;
      }
      const message =
        err?.response?.data?.message ||
        "Could not load this vendor. Please check your connection and try again.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVendor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]); // only when id or isEdit changes

  const save = async () => {
    if (!form.name.trim()) return toast.error("Enter vendor name");
    if (!form.mobile_no.trim()) return toast.error("Enter mobile number");
    if (!form.state_id) return toast.error("Select a state");
    if (!company) return toast.error("Company data missing");

    setSaving(true);
    try {
      // Build payload – wallet is omitted on update
      const payload: any = {
        company_id: company.company_id,
        franchise_id: company.franchise_id,
        vendor_name: form.name.trim(),
        vendor_mobile_no: form.mobile_no.trim(),
        vendor_email_id: form.email_id.trim(),
        vendor_state_id: Number(form.state_id),
        vendor_city_name: form.city_name.trim(),
        vendor_address: form.address.trim(),
        vendor_gst_number: form.gst_number.trim().toUpperCase(),
      };

      // Only add wallet on create
      if (!isEdit) {
        payload.vendor_wallet = Number(form.wallet) || 0;
      }

      let res;
      if (isEdit) {
        res = await VendorService.updateVendor(Number(id), payload);
      } else {
        res = await VendorService.createVendor(payload);
      }

      if (res.status === "success") {
        toast.success(res.message);
        navigate("/vendors");
      } else {
        toast.error(res.message || "Failed to save vendor");
      }
    } catch (err: any) {
      console.error("Error saving vendor:", err);
      toast.error(
        err?.response?.data?.message || "Failed to save vendor. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saving) save();
  };

  const handleCancel = () => navigate("/vendors");

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="border-border shadow-card">
          <CardContent className="py-10">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading vendor...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="border-border shadow-card">
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm text-destructive">{loadError}</p>
          </CardContent>
          <CardFooter className="justify-end gap-2 border-t border-border pt-5">
            <Button variant="outline" onClick={handleCancel}>
              Back to Vendors
            </Button>
            <Button onClick={loadVendor}>Retry</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full ">
      <Card className="border-border shadow-card">
        <CardHeader className="flex flex-row items-start gap-3 border-b border-border pb-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="font-display text-lg">
              {isEdit ? "Edit Vendor" : "New Vendor"}
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              {isEdit
                ? "Update vendor details."
                : "Add a new vendor to your system."}
            </CardDescription>
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5 pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name" className="text-xs font-semibold">
                  Vendor Name *
                </Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  className="mt-1.5"
                  disabled={saving}
                  required
                />
              </div>
              <div>
                <Label htmlFor="mobile_no" className="text-xs font-semibold">
                  Mobile Number *
                </Label>
                <Input
                  id="mobile_no"
                  value={form.mobile_no}
                  onChange={(e) =>
                    setField("mobile_no", e.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  className="mt-1.5"
                  placeholder="10-digit mobile number"
                  maxLength={10}
                  disabled={saving}
                  required
                />
              </div>
              <div>
                <Label htmlFor="email_id" className="text-xs font-semibold">
                  Email ID
                </Label>
                <Input
                  id="email_id"
                  type="email"
                  value={form.email_id}
                  onChange={(e) => setField("email_id", e.target.value)}
                  className="mt-1.5"
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="gst_number" className="text-xs font-semibold">
                  GST Number
                </Label>
                <Input
                  id="gst_number"
                  value={form.gst_number}
                  onChange={(e) => setField("gst_number", e.target.value.toUpperCase())}
                  className="mt-1.5"
                  placeholder="e.g. 24ABCDE1234F1Z5"
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="state_id" className="text-xs font-semibold">
                  State *
                </Label>
                <Select
                  value={form.state_id}
                  onValueChange={(v) => setField("state_id", v)}
                  disabled={saving}
                >
                  <SelectTrigger id="state_id" className="mt-1.5">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="city_name" className="text-xs font-semibold">
                  City
                </Label>
                <Input
                  id="city_name"
                  value={form.city_name}
                  onChange={(e) => setField("city_name", e.target.value)}
                  className="mt-1.5"
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="wallet" className="text-xs font-semibold">
                  Wallet Balance
                </Label>
                <Input
                  id="wallet"
                  type="number"
                  step="0.01"
                  value={form.wallet}
                  onChange={(e) => setField("wallet", e.target.value)}
                  className="mt-1.5"
                  disabled={isEdit || saving}
                  title={isEdit ? "Wallet balance cannot be changed after creation" : ""}
                />
                {isEdit && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Wallet balance is set once during creation.
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="address" className="text-xs font-semibold">
                Address
              </Label>
              <Textarea
                id="address"
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
                className="mt-1.5"
                rows={3}
                disabled={saving}
              />
            </div>
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
                "Create vendor"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default AddVendor;