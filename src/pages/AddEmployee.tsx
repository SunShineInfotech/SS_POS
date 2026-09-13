// src/pages/EmployeeForm.tsx
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
import { Loader2, Users, Lock } from "lucide-react";
import { toast } from "sonner";
import { EmployeeService } from "@/services/employee.service";
import { FranchiseMultiSelect } from "@/components/shared/FranchiseMultiSelect";
import { ChangePasswordModal } from "@/components/shared/ChangePasswordModal";

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

const EmployeeForm = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const company = getCompanyData();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    employee_name: "",
    employee_mobile: "",
    employee_email: "",
    employee_salary_monthly: "",
    employee_joining_date: "",
    employee_status: "1",
    employee_franchisy_multiple_ids: "",
    employee_password: "",
  });

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Change Password modal state
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [employeeName, setEmployeeName] = useState("");

  const setField = (key: string, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));

  const loadEmployee = async () => {
    if (!isEdit) return;
    if (!company) {
      setLoadError("Company data missing. Please sign in again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      const res = await EmployeeService.getEmployee(Number(id), company.company_id);
      if (res.status === "success" && res.data) {
        const e = res.data;
        setForm({
          employee_name: e.employee_name || "",
          employee_mobile: e.employee_mobile || "",
          employee_email: e.employee_email || "",
          employee_salary_monthly: e.employee_salary_monthly?.toString() || "",
          employee_joining_date: e.employee_joining_date || "",
          employee_status: e.employee_status?.toString() || "1",
          employee_franchisy_multiple_ids: e.employee_franchisy_multiple_ids || "",
          employee_password: "",
        });
        setEmployeeId(Number(e.employee_id));
        setEmployeeName(e.employee_name || "");
      } else {
        toast.error(res.message || "Employee not found");
        navigate("/employees");
      }
    } catch (err: any) {
      console.error("Error loading employee:", err);
      if (err?.response?.status === 404) {
        toast.error(err.response?.data?.message || "Employee not found");
        navigate("/employees");
        return;
      }
      const message =
        err?.response?.data?.message ||
        "Could not load this employee. Please check your connection and try again.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployee();
  }, [id, isEdit]);

  const save = async () => {
    if (!form.employee_name.trim()) return toast.error("Enter employee name");
    if (!form.employee_mobile.trim()) return toast.error("Enter mobile number");
    if (!company) return toast.error("Company data missing");

    // Validate password on create
    if (!isEdit && !form.employee_password.trim()) {
      return toast.error("Password is required for new employee");
    }
    if (form.employee_password && form.employee_password.length < 6) {
      return toast.error("Password must be at least 6 characters");
    }

    setSaving(true);
    try {
      const payload: any = {
        company_id: company.company_id,
        employee_name: form.employee_name.trim(),
        employee_mobile: form.employee_mobile.trim(),
        employee_email: form.employee_email.trim(),
        employee_salary: Number(form.employee_salary_monthly) || 0,
        employee_joining_date: form.employee_joining_date,
        employee_status: Number(form.employee_status),
        employee_franchisy_multiple_ids: form.employee_franchisy_multiple_ids,
      };

      // Only send password if provided (for update, it's optional)
      if (form.employee_password) {
        payload.employee_password = form.employee_password;
      }

      let res;
      if (isEdit) {
        res = await EmployeeService.updateEmployee(Number(id), payload);
      } else {
        res = await EmployeeService.createEmployee(payload);
      }

      if (res.status === "success") {
        toast.success(res.message);
        navigate("/employees");
      } else {
        toast.error(res.message || "Failed to save employee");
      }
    } catch (err: any) {
      console.error("Error saving employee:", err);
      toast.error(
        err?.response?.data?.message || "Failed to save employee. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saving) save();
  };

  const handleCancel = () => navigate("/employees");

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="border-border shadow-card">
          <CardContent className="py-10">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading employee...
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
              Back to Employees
            </Button>
            <Button onClick={loadEmployee}>Retry</Button>
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
            <Users className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="font-display text-lg">
              {isEdit ? "Edit Employee" : "New Employee"}
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              {isEdit
                ? "Update employee details."
                : "Add a new employee to your team."}
            </CardDescription>
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5 pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name" className="text-xs font-semibold">
                  Full Name *
                </Label>
                <Input
                  id="name"
                  value={form.employee_name}
                  onChange={(e) => setField("employee_name", e.target.value)}
                  className="mt-1.5"
                  disabled={saving}
                  required
                />
              </div>
              <div>
                <Label htmlFor="mobile" className="text-xs font-semibold">
                  Mobile Number *
                </Label>
                <Input
                  id="mobile"
                  value={form.employee_mobile}
                  onChange={(e) =>
                    setField("employee_mobile", e.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  className="mt-1.5"
                  placeholder="10-digit mobile"
                  maxLength={10}
                  disabled={saving}
                  required
                />
              </div>
              <div>
                <Label htmlFor="email" className="text-xs font-semibold">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={form.employee_email}
                  onChange={(e) => setField("employee_email", e.target.value)}
                  className="mt-1.5"
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="salary" className="text-xs font-semibold">
                  Monthly Salary
                </Label>
                <Input
                  id="salary"
                  type="number"
                  step="0.01"
                  value={form.employee_salary_monthly}
                  onChange={(e) => setField("employee_salary_monthly", e.target.value)}
                  className="mt-1.5"
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="joining_date" className="text-xs font-semibold">
                  Joining Date
                </Label>
                <Input
                  id="joining_date"
                  type="date"
                  value={form.employee_joining_date}
                  onChange={(e) => setField("employee_joining_date", e.target.value)}
                  className="mt-1.5"
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="status" className="text-xs font-semibold">
                  Status
                </Label>
                <Select
                  value={form.employee_status}
                  onValueChange={(v) => setField("employee_status", v)}
                  disabled={saving}
                >
                  <SelectTrigger id="status" className="mt-1.5">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Active</SelectItem>
                    <SelectItem value="2">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!isEdit && (
                <div>
                  <Label htmlFor="password" className="text-xs font-semibold">
                    Password *
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={form.employee_password}
                    onChange={(e) => setField("employee_password", e.target.value)}
                    className="mt-1.5"
                    placeholder="Min 6 characters"
                    disabled={saving}
                    required={!isEdit}
                  />
                </div>
              )}
              {isEdit && (
                <div>
                  <Label className="text-xs font-semibold">Password</Label>
                  <div className="mt-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setChangePasswordOpen(true)}
                      className="gap-2"
                    >
                      <Lock className="h-4 w-4" />
                      Change Password
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Franchises */}
            <div>
              <Label className="text-xs font-semibold">Franchises</Label>
              <div className="mt-1.5">
                <FranchiseMultiSelect
                  companyId={company?.company_id || ""}
                  value={form.employee_franchisy_multiple_ids}
                  onChange={(ids) => setField("employee_franchisy_multiple_ids", ids)}
                  disabled={saving}
                />
              </div>
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
                "Create employee"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Change Password Modal (for edit page) */}
      {isEdit && employeeId && (
        <ChangePasswordModal
          open={changePasswordOpen}
          onOpenChange={setChangePasswordOpen}
          employeeId={employeeId}
          employeeName={employeeName}
          companyId={company?.company_id || ""}
          onSuccess={() => {
            // Optionally refresh or show a toast
            toast.info("Password updated successfully");
          }}
        />
      )}
    </div>
  );
};

export default EmployeeForm;