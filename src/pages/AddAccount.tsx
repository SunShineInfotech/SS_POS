import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AccountService } from "@/services/account.service";

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

// Get user data for financial year
const getUserData = () => {
  const raw = localStorage.getItem("user_data");
  return raw ? JSON.parse(raw) : null;
};

const ACCOUNT_TYPES = [
  { value: 1, label: "Bank" },
  { value: 2, label: "Cash" },
  { value: 3, label: "UPI/Wallet" },
];

interface AccountForm {
  account_name: string;
  account_type: number;
  account_ifsc: string;
  account_number: string;
  account_branch_name: string;
  account_holder_name: string;
  account_gst_number: string;
  opening_balance: number;
}

const EMPTY_FORM: AccountForm = {
  account_name: "",
  account_type: 1,
  account_ifsc: "",
  account_number: "",
  account_branch_name: "",
  account_holder_name: "",
  account_gst_number: "",
  opening_balance: 0,
};

const AddAccount = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const company = getCompanyData();
  const user = getUserData();

  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const setField = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const loadAccount = async () => {
    if (!isEdit) return;
    if (!company) {
      setLoadError("Company data missing. Please sign in again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const res = await AccountService.getOne(Number(id), company.company_id, company.franchise_id);
      if (res.status === "success" && res.data) {
        const a = res.data;
        setForm({
          account_name: a.account_name || "",
          account_type: a.account_type || 1,
          account_ifsc: a.account_ifsc || "",
          account_number: a.account_number || "",
          account_branch_name: a.account_branch_name || "",
          account_holder_name: a.account_holder_name || "",
          account_gst_number: a.account_gst_number || "",
          opening_balance: 0, // not used on edit
        });
      } else {
        toast.error(res.message || "Account not found");
        navigate("/account");
      }
    } catch (err: any) {
      console.error("Error loading account:", err);
      const message = err?.response?.data?.message || "Could not load account.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccount();
  }, [id, isEdit]);

  const save = async () => {
    if (!form.account_name.trim()) return toast.error("Account name is required");
    if (!company) return toast.error("Company data missing");
    // if (!user?.financialYear) return toast.error("Financial year not found");

    setSaving(true);
    try {
      // For edit, exclude opening_balance and financial_year_id
      if (isEdit) {
        const payload = {
          company_id: company.company_id,
          franchise_id: company.franchise_id,
          account_name: form.account_name.trim(),
          account_type: form.account_type,
          account_ifsc: form.account_ifsc.trim(),
          account_number: form.account_number.trim(),
          account_branch_name: form.account_branch_name.trim(),
          account_holder_name: form.account_holder_name.trim(),
          account_gst_number: form.account_gst_number.trim(),
        };
        const res = await AccountService.update(Number(id), payload);
        if (res.status === "success") {
          toast.success(res.message);
          navigate("/account");
        } else {
          toast.error(res.message || "Failed to save");
        }
      } else {
        // Create with opening balance
        const payload = {
          company_id: company.company_id,
          franchise_id: company.franchise_id,
          financial_year_id: Number(user.financialYear?.split('-')[0] || new Date().getFullYear()), // extract year or use current
          account_name: form.account_name.trim(),
          account_type: form.account_type,
          account_ifsc: form.account_ifsc.trim(),
          account_number: form.account_number.trim(),
          account_branch_name: form.account_branch_name.trim(),
          account_holder_name: form.account_holder_name.trim(),
          account_gst_number: form.account_gst_number.trim(),
          opening_balance: form.opening_balance || 0,
        };
        const res = await AccountService.create(payload);
        if (res.status === "success") {
          toast.success(res.message);
          navigate("/account");
        } else {
          toast.error(res.message || "Failed to save");
        }
      }
    } catch (err: any) {
      console.error("Error saving account:", err);
      toast.error(err?.response?.data?.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saving) save();
  };

  const handleCancel = () => navigate("/account");

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="border-border shadow-card">
          <CardContent className="py-10">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading account...
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
            <Button variant="outline" onClick={handleCancel}>Back</Button>
            <Button onClick={loadAccount}>Retry</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Card className="border-border shadow-card">
        <CardHeader className="flex flex-row items-start gap-3 border-b border-border pb-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="font-display text-lg">
              {isEdit ? "Edit Account" : "New Account"}
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              {isEdit ? "Update account details." : "Add a new bank, cash, or UPI/wallet account."}
            </CardDescription>
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5 pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="account_name" className="text-xs font-semibold">
                  Account Name *
                </Label>
                <Input
                  id="account_name"
                  value={form.account_name}
                  onChange={(e) => setField("account_name", e.target.value)}
                  className="mt-1.5"
                  placeholder="e.g. HDFC Current Account"
                  disabled={saving}
                  required
                />
              </div>
              <div>
                <Label htmlFor="account_type" className="text-xs font-semibold">
                  Account Type *
                </Label>
                <Select
                  value={String(form.account_type)}
                  onValueChange={(v) => setField("account_type", Number(v))}
                  disabled={saving}
                >
                  <SelectTrigger id="account_type" className="mt-1.5">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={String(type.value)}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="account_holder_name" className="text-xs font-semibold">
                  Holder Name
                </Label>
                <Input
                  id="account_holder_name"
                  value={form.account_holder_name}
                  onChange={(e) => setField("account_holder_name", e.target.value)}
                  className="mt-1.5"
                  placeholder="John Doe"
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="account_number" className="text-xs font-semibold">
                  Account Number
                </Label>
                <Input
                  id="account_number"
                  value={form.account_number}
                  onChange={(e) => setField("account_number", e.target.value)}
                  className="mt-1.5"
                  placeholder="1234567890"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="account_ifsc" className="text-xs font-semibold">
                  IFSC Code
                </Label>
                <Input
                  id="account_ifsc"
                  value={form.account_ifsc}
                  onChange={(e) => setField("account_ifsc", e.target.value)}
                  className="mt-1.5"
                  placeholder="HDFC0001234"
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="account_branch_name" className="text-xs font-semibold">
                  Branch Name
                </Label>
                <Input
                  id="account_branch_name"
                  value={form.account_branch_name}
                  onChange={(e) => setField("account_branch_name", e.target.value)}
                  className="mt-1.5"
                  placeholder="Main Branch"
                  disabled={saving}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="account_gst_number" className="text-xs font-semibold">
                GST Number (if applicable)
              </Label>
              <Input
                id="account_gst_number"
                value={form.account_gst_number}
                onChange={(e) => setField("account_gst_number", e.target.value)}
                className="mt-1.5"
                placeholder="22AAAAA0000A1Z5"
                disabled={saving}
              />
            </div>

            {/* Opening Balance – only for new account */}
            {!isEdit && (
              <div className="border-t border-border pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="opening_balance" className="text-xs font-semibold">
                      Opening Balance (₹)
                    </Label>
                    <Input
                      id="opening_balance"
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.opening_balance}
                      onChange={(e) => setField("opening_balance", parseFloat(e.target.value) || 0)}
                      className="mt-1.5"
                      placeholder="0.00"
                      disabled={saving}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      This will be recorded as a Credit transaction.
                    </p>
                  </div>
                </div>
              </div>
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
                "Create account"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default AddAccount;