import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { initStore, saveStore } from "@/lib/store";
import { toast } from "sonner";

interface Customer {
  id: number;
  name: string;
  mobile: string;
  email: string;
  outstanding: number;
  totalOrders: number;
  deleted?: boolean;
}

const initialCustomers: Customer[] = [
  { id: 1, name: "Rahul Sharma", mobile: "9876543210", email: "rahul@email.com", outstanding: 1250, totalOrders: 24 },
  { id: 2, name: "Priya Patel", mobile: "9876543211", email: "priya@email.com", outstanding: 0, totalOrders: 18 },
  { id: 3, name: "Amit Kumar", mobile: "9876543212", email: "amit@email.com", outstanding: 3400, totalOrders: 42 },
  { id: 4, name: "Sneha Gupta", mobile: "9876543213", email: "sneha@email.com", outstanding: 670, totalOrders: 8 },
];

const columns = [
  { key: "name" as const, label: "Name" },
  { key: "mobile" as const, label: "Mobile", render: (v: any) => <span className="font-display text-xs">{v}</span> },
  { key: "email" as const, label: "Email" },
  { key: "totalOrders" as const, label: "Orders", render: (v: any) => <span className="font-display">{v}</span> },
  {
    key: "outstanding" as const,
    label: "Outstanding",
    render: (v: any) => (
      <span className={`font-display font-semibold ${Number(v) > 0 ? "text-destructive" : "text-accent"}`}>
        ₹{Number(v).toLocaleString()}
      </span>
    ),
  },
];

const Customers = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Customer[]>(() => initStore("customers", initialCustomers));

  const persist = (next: Customer[]) => { setData(next); saveStore("customers", next); };

  return (
    <DataTable
      data={data}
      columns={columns}
      onAdd={() => navigate("/customers/new")}
      onEdit={(row) => navigate(`/customers/${row.id}/edit`)}
      onDelete={(id) => { persist(data.map((c) => (c.id === id ? { ...c, deleted: true } : c))); toast.success("Deleted"); }}
      onRestore={(id) => { persist(data.map((c) => (c.id === id ? { ...c, deleted: false } : c))); toast.success("Restored"); }}
      addLabel="Add Customer"
    />
  );
};

export default Customers;
