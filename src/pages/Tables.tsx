import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "@/components/shared/DataTable";
import { toast } from "sonner";
import axios from "axios";

interface TableRow {
  id: number;
  table_no: string;
  franchise_name: string;
  table_status: number;
  table_capacity: number;
}

const STATUS_LABELS: Record<number, { label: string; className: string }> = {
  1: { label: "Available", className: "bg-accent/10 text-accent" },
  2: { label: "Occupied", className: "bg-destructive/10 text-destructive" },
  3: { label: "Reserved", className: "bg-amber-500/10 text-amber-600" },
  4: { label: "Out of Service", className: "bg-muted text-muted-foreground" },
};

const columns = [
  { key: "table_no" as const, label: "Table No" },
  { key: "franchise_name" as const, label: "Franchise" },
  {
    key: "table_capacity" as const,
    label: "Capacity",
    render: (value: any) =>
      `${value ?? 0} ${Number(value) === 1 ? "seat" : "seats"}`,
  },
  {
    key: "table_status" as const,
    label: "Status",
    render: (value: any) => {
      const status = STATUS_LABELS[Number(value)] || STATUS_LABELS[1];
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

const API_URL =
  import.meta.env.VITE_API_URL || "https://sunshineproduct.in/POS/v1_api/";

const getUserProfile = () =>
  JSON.parse(localStorage.getItem("company_data") || "{}");

const Tables = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<TableRow[]>([]);

  const fetchTables = async () => {
    try {
      const userProfile = getUserProfile();
      const res = await axios.post(`${API_URL}table_master.php`, {
        type: 2,
        company_id: userProfile.company_id,
        franchise_id: userProfile.franchise_id,
      });

      console.log("Fetch Tables Response:", res.data);
      if (res.data.status === "success") {
        const tempData = res.data.data.map((item: any) => ({
          id: item.table_id,
          table_no: item.table_no,
          franchise_name: item.franchise_name,
          table_status: item.table_status,
          table_capacity: item.table_Capacity,
        }));
        setData(tempData);
      } else {
        toast.error(res.data.message || "Failed to fetch tables");
      }
    } catch (error) {
      console.error("Error fetching tables:", error);
      toast.error("Failed to fetch tables. Please try again.");
    }
  };

  useEffect(() => {
    fetchTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (id: number) => {
    const userProfile = getUserProfile();
    try {
      const res = await axios.post(`${API_URL}table_master.php`, {
        type: 4,
        company_id: userProfile.company_id,
        franchise_id: userProfile.franchise_id,
        table_id: id,
      });

      if (res.data.status === "success") {
        setData((prev) => prev.filter((t) => t.id !== id));
        toast.success(res.data.message || "Deleted");
      } else {
        toast.error(res.data.message || "Failed to delete table");
      }
    } catch (error) {
      console.error("Error deleting table:", error);
      toast.error("Failed to delete table. Please try again.");
    }
  };

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
