import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UtensilsCrossed, Package, ShoppingBag, Users } from "lucide-react";

type TableStatus = "Free" | "Booked" | "Packed";
type TableType = "dine" | "parcel";

interface RestaurantTable {
  id: string;
  name: string;
  capacity: number;
  status: TableStatus;
  type: TableType;
}

const initialTables: RestaurantTable[] = [
  { id: "t1", name: "Table 1", capacity: 4, status: "Free", type: "dine" },
  { id: "t2", name: "Table 2", capacity: 2, status: "Booked", type: "dine" },
  { id: "t3", name: "Table 3", capacity: 6, status: "Free", type: "dine" },
  { id: "t4", name: "Table 4", capacity: 4, status: "Packed", type: "dine" },
  { id: "t5", name: "Table 5", capacity: 8, status: "Free", type: "dine" },
  { id: "t6", name: "Table 6", capacity: 4, status: "Booked", type: "dine" },
  { id: "vip1", name: "VIP Room 1", capacity: 10, status: "Free", type: "dine" },
  { id: "vip2", name: "VIP Room 2", capacity: 8, status: "Free", type: "dine" },
  { id: "p1", name: "Parcel 1", capacity: 0, status: "Free", type: "parcel" },
  { id: "p2", name: "Parcel 2", capacity: 0, status: "Booked", type: "parcel" },
];

const statusStyles: Record<TableStatus, string> = {
  Free: "bg-success/10 text-success border-success/30",
  Booked: "bg-destructive/10 text-destructive border-destructive/30",
  Packed: "bg-warning/15 text-warning border-warning/30",
};

const RestaurantTables = () => {
  const navigate = useNavigate();
  const [tables] = useState(initialTables);

  const dine = tables.filter((t) => t.type === "dine");
  const parcel = tables.filter((t) => t.type === "parcel");

  const counts = {
    free: tables.filter((t) => t.status === "Free").length,
    booked: tables.filter((t) => t.status === "Booked").length,
    packed: tables.filter((t) => t.status === "Packed").length,
  };

  const openTable = (t: RestaurantTable) => {
    navigate(`/restaurant-billing/${t.id}`, { state: { table: t } });
  };

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
          <p className="text-xs text-muted-foreground">Packed</p>
          <p className="font-display text-2xl font-bold text-warning">{counts.packed}</p>
        </Card>
      </div>

      {/* Dine-in */}
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

      {/* Parcel */}
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
    </div>
  );
};

export default RestaurantTables;
