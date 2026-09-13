import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UtensilsCrossed, Package, ShoppingBag, Users } from "lucide-react";
import { toast } from "sonner";
import { TableService, Table } from "@/services/table.service";

type TableStatus = "Free" | "Booked" | "Packed" | "Out of Service";
type TableType = "dine" | "parcel";

interface RestaurantTable {
  id: string;
  name: string;
  capacity: number;
  status: TableStatus;
  type: TableType;
  raw: Table;
}

const getCompanyData = () => {
  const raw = localStorage.getItem("company_data");
  return raw ? JSON.parse(raw) : null;
};

// Map API status (1-4) to UI labels
const statusMap: Record<number, TableStatus> = {
  1: "Free",
  2: "Booked",
  3: "Booked", // Reserved → treat as Booked
  4: "Out of Service",
};

const statusStyles: Record<TableStatus, string> = {
  Free: "bg-success/10 text-success border-success/30",
  Booked: "bg-destructive/10 text-destructive border-destructive/30",
  Packed: "bg-warning/15 text-warning border-warning/30",
  "Out of Service": "bg-muted/20 text-muted-foreground border-muted/30",
};

const RestaurantTables = () => {
  const navigate = useNavigate();
  const company = useMemo(() => getCompanyData(), []); // ✅ memoize to prevent infinite loops
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTables = async () => {
      if (!company) {
        setError("Company data not found");
        setLoading(false);
        return;
      }

      try {
        const res = await TableService.getTables(company.company_id, company.franchise_id);
        if (res.status === "success" && res.data) {
          const mapped = res.data.map((t) => {
            const isParcel =
              t.table_no.toLowerCase().startsWith("p") ||
              t.table_no.toLowerCase().includes("parcel");
            return {
              id: t.table_id,
              name: t.table_no,
              capacity: t.table_Capacity || 0,
              status: statusMap[t.table_status] || "Free",
              type: isParcel ? "parcel" : "dine",
              raw: t,
            };
          });
          setTables(mapped);
        } else {
          toast.error(res.message || "Failed to fetch tables");
          setError(res.message || "Failed to fetch tables");
        }
      } catch (err) {
        console.error("Error fetching tables:", err);
        toast.error("Could not load tables");
        setError("Could not load tables");
      } finally {
        setLoading(false);
      }
    };

    fetchTables();
  }, [company]); // now stable, runs only once

  const dine = tables.filter((t) => t.type === "dine");
  const parcel = tables.filter((t) => t.type === "parcel");

  const counts = {
    free: tables.filter((t) => t.status === "Free").length,
    booked: tables.filter((t) => t.status === "Booked").length,
    packed: tables.filter((t) => t.status === "Packed" || t.status === "Out of Service").length,
  };

  const openTable = (t: RestaurantTable) => {
    navigate(`/restaurant-billing/${t.id}`, { state: { table: t } });
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading tables...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 text-sm text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No tables found. Please add tables from the Tables page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 border-l-4 border-l-success bg-gradient-to-br from-success/5 to-transparent">
          <p className="text-xs text-muted-foreground">Free</p>
          <p className="font-display text-2xl font-bold text-success">{counts.free}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-destructive bg-gradient-to-br from-destructive/5 to-transparent">
          <p className="text-xs text-muted-foreground">Booked</p>
          <p className="font-display text-2xl font-bold text-destructive">{counts.booked}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-warning bg-gradient-to-br from-warning/10 to-transparent">
          <p className="text-xs text-muted-foreground">Packed / OOS</p>
          <p className="font-display text-2xl font-bold text-warning">{counts.packed}</p>
        </Card>
      </div>

      {/* Dine-in */}
      {dine.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-base font-bold tracking-tight flex items-center gap-2">
              <UtensilsCrossed className="h-4 w-4 text-primary" />
              Dine-In Tables
            </h2>
            <Badge variant="outline" className="text-[10px]">{dine.length} tables</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {dine.map((t) => (
              <button
                key={t.id}
                onClick={() => openTable(t)}
                className={`group relative p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.02] hover:shadow-lg ${statusStyles[t.status]}`}
              >
                <div className="flex items-start justify-between">
                  <UtensilsCrossed className="h-5 w-5 opacity-70" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{t.status}</span>
                </div>
                <p className="font-display text-base font-bold mt-3">{t.name}</p>
                <p className="text-[11px] flex items-center gap-1 mt-1 opacity-80">
                  <Users className="h-3 w-3" /> {t.capacity} seats
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Parcel */}
      {parcel.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-base font-bold tracking-tight flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-accent" />
              Parcel / Takeaway
            </h2>
            <Badge variant="outline" className="text-[10px]">{parcel.length} counters</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {parcel.map((t) => (
              <button
                key={t.id}
                onClick={() => openTable(t)}
                className={`group relative p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.02] hover:shadow-lg ${statusStyles[t.status]}`}
              >
                <div className="flex items-start justify-between">
                  <Package className="h-5 w-5 opacity-70" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{t.status}</span>
                </div>
                <p className="font-display text-base font-bold mt-3">{t.name}</p>
                <p className="text-[11px] mt-1 opacity-80">Takeaway counter</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RestaurantTables;