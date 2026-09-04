import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FormPage } from "@/components/shared/FormPage";
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
import { toast } from "sonner";
import axios from "axios";

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

const API_URL =
  import.meta.env.VITE_API_URL || "https://sunshineproduct.in/POS/v1_api/";

const getUserProfile = () =>
  JSON.parse(localStorage.getItem("company_data") || "{}");

const AddVendor = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<VendorForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [states, setStates] = useState<StateOption[]>([]);

  const setField = <K extends keyof VendorForm>(key: K, value: VendorForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    const loadStates = async () => {
      try {
        const userProfile = getUserProfile();
        const res = await axios.post(`${API_URL}state.php`, {
          type: 2,
          company_id: userProfile.company_id,
        });
        if (res.data.status === "success") {
          setStates(
            res.data.data.map((s: any) => ({
              id: s.state_id,
              name: s.state_name,
            })),
          );
        }
      } catch (err) {
        console.error("Error loading states:", err);
      }
    };
    loadStates();
  }, []);

  useEffect(() => {
    if (!isEdit) return;

    const loadVendor = async () => {
      try {
        const userProfile = getUserProfile();
        const res = await axios.post(`${API_URL}vendor.php`, {
          type: 5,
          company_id: userProfile.company_id,
          franchise_id: userProfile.franchise_id,
          vendor_id: id,
        });

        if (res.data.status === "success") {
          const v = res.data.data;
          setForm({
            name: v.vendor_name || "",
            mobile_no: v.vendor_mobile_no || "",
            email_id: v.vendor_email_id || "",
            state_id: v.vendor_state_id ? String(v.vendor_state_id) : "",
            city_name: v.vendor_city_name || "",
            address: v.vendor_address || "",
            gst_number: v.vendor_gst_number || "",
            wallet: v.vendor_wallet ?? "0",
          });
        } else {
          toast.error(res.data.message || "Vendor not found");
          navigate("/vendors");
        }
      } catch (err) {
        console.error("Error loading vendor:", err);
        toast.error("Failed to load vendor. Please try again.");
        navigate("/vendors");
      } finally {
        setLoading(false);
      }
    };
    loadVendor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const save = async () => {
    if (!form.name.trim()) return toast.error("Enter vendor name");
    if (!form.mobile_no.trim()) return toast.error("Enter mobile number");
    if (!form.state_id) return toast.error("Select a state");

    const userProfile = getUserProfile();

    try {
      const res = await axios.post(`${API_URL}vendor.php`, {
        type: isEdit ? 3 : 1,
        company_id: userProfile.company_id,
        franchise_id: userProfile.franchise_id,
        ...(isEdit && { vendor_id: id }),
        vendor_name: form.name,
        vendor_mobile_no: form.mobile_no,
        vendor_email_id: form.email_id,
        vendor_state_id: form.state_id,
        vendor_city_name: form.city_name,
        vendor_address: form.address,
        vendor_gst_number: form.gst_number,
        vendor_wallet: form.wallet || 0,
      });

      if (res.data.status === "success") {
        toast.success(res.data.message);
        navigate("/vendors");
      } else {
        toast.error(res.data.message || "Failed to save vendor");
      }
    } catch (err) {
      console.error("Error saving vendor:", err);
      toast.error("Failed to save vendor. Please try again.");
    }
  };

  if (loading) {
    return (
      <FormPage title="Edit Vendor" onSave={() => {}} backTo="/vendors">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </FormPage>
    );
  }

  return (
    <FormPage
      title={isEdit ? "Edit Vendor" : "Add Vendor"}
      onSave={save}
      backTo="/vendors"
    >
      <div className="max-w-2xl space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Vendor Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Mobile Number *</Label>
            <Input
              value={form.mobile_no}
              onChange={(e) => setField("mobile_no", e.target.value)}
              className="mt-1"
              placeholder="10-digit mobile number"
              maxLength={10}
            />
          </div>
          <div>
            <Label className="text-xs">Email ID</Label>
            <Input
              type="email"
              value={form.email_id}
              onChange={(e) => setField("email_id", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">GST Number</Label>
            <Input
              value={form.gst_number}
              onChange={(e) =>
                setField("gst_number", e.target.value.toUpperCase())
              }
              className="mt-1"
              placeholder="e.g. 24ABCDE1234F1Z5"
            />
          </div>
          <div>
            <Label className="text-xs">State *</Label>
            <Select
              value={form.state_id}
              onValueChange={(v) => setField("state_id", v)}
            >
              <SelectTrigger className="mt-1">
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
            <Label className="text-xs">City</Label>
            <Input
              value={form.city_name}
              onChange={(e) => setField("city_name", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Wallet Balance</Label>
            <Input
              type="number"
              value={form.wallet}
              onChange={(e) => setField("wallet", e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">Address</Label>
          <Textarea
            value={form.address}
            onChange={(e) => setField("address", e.target.value)}
            className="mt-1"
            rows={3}
          />
        </div>
      </div>
    </FormPage>
  );
};

export default AddVendor;
