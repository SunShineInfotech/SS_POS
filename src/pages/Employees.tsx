// src/pages/Employees.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { toast } from "sonner";
import { EmployeeService, Employee } from "@/services/employee.service";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { ChangePasswordModal } from "@/components/shared/ChangePasswordModal";

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

const Employees = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const company = getCompanyData();

  // Change Password modal state
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const columns = [
    { key: "employee_name", label: "Name" },
    { key: "employee_mobile", label: "Mobile" },
    { key: "employee_email", label: "Email" },
    { key: "franchise_names", label: "Franchises", render: (v: any) => v || "-" },
    {
      key: "employee_salary_monthly",
      label: "Salary",
      render: (v: any) => `₹${Number(v || 0).toFixed(2)}`,
    },
    {
      key: "employee_status",
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

  const fetchEmployees = async () => {
    if (!company) {
      toast.error("Company data not found");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await EmployeeService.getEmployees(company.company_id);
      if (res.status === "success" && res.data) {
        const mapped = res.data.map((item) => ({
          ...item,
          id: item.employee_id,
        }));
        setData(mapped);
      } else {
        toast.error(res.message || "Failed to fetch employees");
      }
    } catch (error) {
      console.error("Error fetching employees:", error);
      toast.error("Failed to fetch employees.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleDelete = async (id: number) => {
    if (!company) return;
    try {
      const res = await EmployeeService.deleteEmployee(id, company.company_id);
      if (res.status === "success") {
        setData((prev) => prev.filter((e) => Number(e.employee_id) !== id));
        toast.success(res.message || "Deleted");
      } else {
        toast.error(res.message || "Failed to delete");
      }
    } catch (error) {
      console.error("Error deleting:", error);
      toast.error("Failed to delete employee.");
    }
  };

  const openChangePassword = (employee: Employee) => {
    setSelectedEmployee(employee);
    setChangePasswordOpen(true);
  };

  // Custom actions: Change Password button (lock icon)
  const customActions = (row: any) => (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => openChangePassword(row)}
      title="Change Password"
    >
      <Lock className="h-4 w-4" />
    </Button>
  );

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading employees...</div>;
  }

  return (
    <>
      <DataTable
        data={data}
        columns={columns}
        onAdd={() => navigate("/employees/new")}
        onEdit={(row) => navigate(`/employees/${row.id}/edit`)}
        onDelete={(id) => handleDelete(id as number)}
        addLabel="Add Employee"
        customActions={customActions}
      />

      <ChangePasswordModal
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
        employeeId={Number(selectedEmployee?.employee_id)}
        employeeName={selectedEmployee?.employee_name || ""}
        companyId={company?.company_id || ""}
        onSuccess={fetchEmployees}
      />
    </>
  );
};

export default Employees;