import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { initStore, saveStore } from "@/lib/store";
import { toast } from "sonner";

interface Employee {
  id: number;
  name: string;
  mobile: string;
  emergencyContact: string;
  address: string;
  aadhaar: string;
  pan: string;
  franchise: string;
  status: string;
  deleted?: boolean;
}

const initialEmployees: Employee[] = [
  { id: 1, name: "Ravi Kumar", mobile: "9876500010", emergencyContact: "9876500011", address: "Delhi", aadhaar: "1234-5678-9012", pan: "ABCPK1234A", franchise: "Main Branch", status: "Active" },
  { id: 2, name: "Sunita Devi", mobile: "9876500012", emergencyContact: "9876500013", address: "Mumbai", aadhaar: "2345-6789-0123", pan: "DEFPL2345B", franchise: "Main Branch", status: "Active" },
  { id: 3, name: "Manoj Singh", mobile: "9876500014", emergencyContact: "9876500015", address: "Bangalore", aadhaar: "3456-7890-1234", pan: "GHIQM3456C", franchise: "Branch 2", status: "Active" },
  { id: 4, name: "Anjali Verma", mobile: "9876500016", emergencyContact: "9876500017", address: "Pune", aadhaar: "4567-8901-2345", pan: "JKLRN4567D", franchise: "Branch 2", status: "Inactive" },
];

const columns = [
  { key: "name" as const, label: "Name" },
  { key: "mobile" as const, label: "Mobile", render: (v: any) => <span className="font-display text-xs">{v}</span> },
  { key: "franchise" as const, label: "Franchise" },
  { key: "aadhaar" as const, label: "Aadhaar", render: (v: any) => <span className="font-display text-xs">{v}</span> },
  { key: "pan" as const, label: "PAN", render: (v: any) => <span className="font-display text-xs">{v}</span> },
  {
    key: "status" as const,
    label: "Status",
    render: (v: any) => (
      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${v === "Active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{v}</span>
    ),
  },
];

const Employees = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Employee[]>(() => initStore("employees", initialEmployees));
  const persist = (next: Employee[]) => { setData(next); saveStore("employees", next); };

  return (
    <DataTable
      data={data}
      columns={columns}
      onAdd={() => navigate("/employees/new")}
      onEdit={(row) => navigate(`/employees/${row.id}/edit`)}
      onDelete={(id) => { persist(data.map((e) => (e.id === id ? { ...e, deleted: true } : e))); toast.success("Deleted"); }}
      onRestore={(id) => { persist(data.map((e) => (e.id === id ? { ...e, deleted: false } : e))); toast.success("Restored"); }}
      addLabel="Add Employee"
    />
  );
};

export default Employees;
