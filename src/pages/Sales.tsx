import { useEffect, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { IndianRupee, TrendingUp, Receipt, Loader2 } from "lucide-react";
import { SellService } from "@/services/sell.service";
import EditInvoiceSheet from "./Editinvoicesheet";

interface Sale {
  id: number;
  billNo: string;
  date: string;
  customer: string;
  items: number;
  total: number;
  paymentMode: string;
  status: string;
  deleted?: boolean;
}

const getUserProfile = () =>
  JSON.parse(localStorage.getItem("company_data") || "{}");

const columns = [
  {
    key: "billNo" as const,
    label: "Bill No.",
    render: (v: any) => (
      <span className="font-display text-xs font-semibold">{v}</span>
    ),
  },
  { key: "date" as const, label: "Date" },
  { key: "customer" as const, label: "Customer" },
  {
    key: "items" as const,
    label: "Items",
    render: (v: any) => <span className="font-display">{v}</span>,
  },
  {
    key: "total" as const,
    label: "Total",
    render: (v: any) => (
      <span className="font-display font-bold">
        ₹{Number(v).toLocaleString()}
      </span>
    ),
  },
  {
    key: "paymentMode" as const,
    label: "Payment",
    render: (v: any) => (
      <span
        className={`px-2 py-0.5 rounded text-[10px] font-medium ${v === "Cash" ? "bg-success/10 text-success" : v === "UPI" ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"}`}
      >
        {v}
      </span>
    ),
  },
  {
    key: "status" as const,
    label: "Status",
    render: (v: any) => (
      <span
        className={`px-2 py-0.5 rounded text-[10px] font-medium ${v === "Paid" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}
      >
        {v}
      </span>
    ),
  },
];

const Sales = () => {
  const [data, setData] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const fetchSales = async () => {
    const userProfile = getUserProfile();
    if (!userProfile?.company_id || !userProfile?.franchise_id) {
      toast.error("Company data missing. Please sign in again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await SellService.getSales(
        userProfile.company_id,
        userProfile.franchise_id,
      );

      if (res.status === "success" && res.data) {
        const mapped: Sale[] = res.data.map((s) => ({
          id: Number(s.sell_id),
          billNo: s.sell_bill_number,
          date: s.sell_date,
          customer: s.sell_customer_name || "Walk-in",
          items: Number(s.item_count) || 0,
          total: Number(s.sell_total_amount) || 0,
          paymentMode: s.sell_payment_mode || "Cash",
          status: s.sell_payment_stauts || "Pending",
          deleted: s.is_deleted === "0",
        }));
        setData(mapped);
      } else {
        toast.error(res.message || "Failed to fetch sales");
      }
    } catch (error) {
      console.error("Error fetching sales:", error);
      toast.error("Failed to fetch sales. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  const today = new Date().toISOString().split("T")[0];
  const todaySales = data.filter((s) => s.date === today && !s.deleted);
  const todayTotal = todaySales.reduce((sum, s) => sum + s.total, 0);
  const paidTotal = todaySales
    .filter((s) => s.status === "Paid")
    .reduce((sum, s) => sum + s.total, 0);

  const handleDelete = async (id: number) => {
    const userProfile = getUserProfile();
    try {
      const res = await SellService.deleteSale(
        id,
        userProfile.company_id,
        userProfile.franchise_id,
      );
      if (res.status === "success") {
        setData((prev) =>
          prev.map((s) => (s.id === id ? { ...s, deleted: true } : s)),
        );
        toast.success("Deleted");
      } else {
        toast.error(res.message || "Failed to delete bill");
      }
    } catch (error) {
      console.error("Error deleting sale:", error);
      toast.error("Failed to delete bill. Please try again.");
    }
  };

  const handleRestore = async (id: number) => {
    const userProfile = getUserProfile();
    try {
      const res = await SellService.restoreSale(
        id,
        userProfile.company_id,
        userProfile.franchise_id,
      );
      if (res.status === "success") {
        setData((prev) =>
          prev.map((s) => (s.id === id ? { ...s, deleted: false } : s)),
        );
        toast.success("Restored");
      } else {
        toast.error(res.message || "Failed to restore bill");
      }
    } catch (error) {
      console.error("Error restoring sale:", error);
      toast.error("Failed to restore bill. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading sales...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Today's Orders
              </span>
            </div>
            <p className="font-display text-2xl font-bold">
              {todaySales.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Today's Revenue
              </span>
            </div>
            <p className="font-display text-2xl font-bold">
              ₹{todayTotal.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Collected</span>
            </div>
            <p className="font-display text-2xl font-bold text-success">
              ₹{paidTotal.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>
      <DataTable
        data={data}
        columns={columns}
        onEdit={(row) => {
          setEditingId(row.id);
          setEditOpen(true);
        }}
        onDelete={handleDelete}
        onRestore={handleRestore}
      />

      <EditInvoiceSheet
        sellId={editingId}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={fetchSales}
      />
    </div>
  );
};

export default Sales;
