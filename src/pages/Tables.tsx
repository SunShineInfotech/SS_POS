// src/pages/Tables.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { toast } from "sonner";
import { TableService, Table } from "@/services/table.service";

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

const STATUS_LABELS: Record<number, { label: string; className: string }> = {
  1: { label: "Free", className: "bg-accent/10 text-accent" },
  2: { label: "Occupied", className: "bg-destructive/10 text-destructive" },
  3: { label: "Reserved", className: "bg-amber-500/10 text-amber-600" },
  4: { label: "Out of Service", className: "bg-muted text-muted-foreground" },
};

const Tables = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const company = getCompanyData();

  const columns = [
    { key: "table_no", label: "Table No" },
    { key: "franchise_name", label: "Franchise", render: (v: any) => v || "-" },
    {
      key: "table_Capacity",
      label: "Capacity",
      render: (v: any) => `${v ?? 0} ${Number(v) === 1 ? "seat" : "seats"}`,
    },
    {
      key: "table_status",
      label: "Status",
      render: (v: any) => {
        const status = STATUS_LABELS[Number(v)] || STATUS_LABELS[1];
        return (
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-medium ${status.className}`}
          >
            {status.label}
          </span>
        );
      },
    },
  ];

  const fetchTables = async () => {
    if (!company) {
      toast.error("Company data not found");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await TableService.getTables(company.company_id, company.franchise_id);
      if (res.status === "success" && res.data) {
        const mapped = res.data.map((item) => ({
          ...item,
          id: item.table_id,
        }));
        setData(mapped);
      } else {
        toast.error(res.message || "Failed to fetch tables");
      }
    } catch (error) {
      console.error("Error fetching tables:", error);
      toast.error("Failed to fetch tables.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  const handleDelete = async (id: number) => {
    if (!company) return;
    try {
      const res = await TableService.deleteTable(id, company.company_id, company.franchise_id);
      if (res.status === "success") {
        setData((prev) => prev.filter((t) => Number(t.table_id) !== id));
        toast.success(res.message || "Deleted");
      } else {
        toast.error(res.message || "Failed to delete");
      }
    } catch (error) {
      console.error("Error deleting:", error);
      toast.error("Failed to delete table.");
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading tables...</div>;
  }

  return (
    <DataTable
      data={data}
      columns={columns}
      onAdd={() => navigate("/tables/new")}
      onEdit={(row) => navigate(`/tables/${row.id}`)}
      onDelete={(id) => handleDelete(id as number)}
      addLabel="Add Table"
      hideStatusToggle
    />
  );
};

export default Tables;