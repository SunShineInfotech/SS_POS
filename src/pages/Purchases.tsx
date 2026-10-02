import { useNavigate } from "react-router-dom";
import { AlertCircle, BarChart3, RefreshCw } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { DataTable } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PurchaseFilters } from "./PurchaseFilters";
import {
  LoaderStyles,
  LoadingOverlay,
  TableSkeleton,
  TopProgressBar,
} from "./../components/Loader";
import {
  inr,
  prettyDate,
  usePurchaseData,
  type Purchase,
} from "./Usepurchasedata";

const API_URL =
  import.meta.env.VITE_API_URL || "https://sunshineproduct.in/POS/v1_api/";

const getUserProfile = () =>
  JSON.parse(localStorage.getItem("company_data") || "{}");

// ---------- Table columns ----------

const columns = [
  {
    key: "billNo" as const,
    label: "Bill No.",
    render: (v: any) => (
      <span className="font-display text-xs font-semibold">{v}</span>
    ),
  },
  {
    key: "date" as const,
    label: "Date",
    render: (v: any) => (
      <span className="whitespace-nowrap">{prettyDate(v)}</span>
    ),
  },
  {
    key: "vendor" as const,
    label: "Vendor",
    render: (v: any, row: Purchase) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{v}</div>
        {row?.vendorMobile && (
          <div className="text-[11px] text-muted-foreground">
            {row.vendorMobile}
          </div>
        )}
      </div>
    ),
  },
  {
    key: "items" as const,
    label: "Items",
    render: (v: any) => <span className="font-display">{v}</span>,
  },
  {
    key: "subtotal" as const,
    label: "Subtotal",
    render: (v: any) => <span className="font-display">{inr(Number(v))}</span>,
  },
  {
    key: "gst" as const,
    label: "GST",
    render: (v: any) => (
      <span className="font-display text-xs">{inr(Number(v))}</span>
    ),
  },
  {
    key: "discount" as const,
    label: "Discount",
    render: (v: any) =>
      Number(v) > 0 ? (
        <span className="font-display text-xs text-destructive">
          -{inr(Number(v))}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">-</span>
      ),
  },
  {
    key: "total" as const,
    label: "Total",
    render: (v: any) => (
      <span className="font-display font-bold">{inr(Number(v))}</span>
    ),
  },
];

// ---------- Component ----------

const Purchases = () => {
  const navigate = useNavigate();
  const f = usePurchaseData("all");

  const handleDelete = async (id: number) => {
    try {
      const u = getUserProfile();
      const res = await axios.post(`${API_URL}purchase.php`, {
        type: 4,
        company_id: u.company_id,
        franchise_id: u.franchise_id,
        purchase_id: id,
      });
      if (res.data.status === "success") {
        f.setData((d) => d.filter((p) => p.id !== id));
        toast.success("Purchase deleted");
      } else {
        toast.error(res.data.message || "Couldn't delete the purchase");
      }
    } catch (err: any) {
      console.error("Error deleting purchase:", err);
      toast.error(
        err?.response?.data?.message || "Couldn't delete the purchase",
      );
    }
  };

  const count = f.data.length;

  return (
    <div className="space-y-4">
      <LoaderStyles />

      <PurchaseFilters
        f={f}
        resultText={`${count} ${count === 1 ? "purchase" : "purchases"}`}
        // actions={
        //   <Button
        //     type="button"
        //     variant="outline"
        //     size="sm"
        //     onClick={() => navigate("/purchases/insights")}
        //     className="h-9 gap-1.5 rounded-full"
        //   >
        //     <BarChart3 className="h-4 w-4" />
        //     Insights
        //   </Button>
        // }
      />

      {f.initialLoading ? (
        <TableSkeleton />
      ) : f.error && count === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 px-6 py-10 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium">{f.error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={f.reload}
            className="gap-1.5"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        </div>
      ) : (
        <div className="relative" aria-busy={f.loading}>
          <TopProgressBar active={f.loading} />
          <div
            className={cn(
              "transition-opacity duration-200",
              f.loading && "pointer-events-none opacity-60",
            )}
          >
            <DataTable
              data={f.data}
              columns={columns}
              onAdd={() => navigate("/purchases/new")}
              onEdit={(row) => navigate(`/purchases/${row.id}/edit`)}
              addLabel="Add Purchase"
              onDelete={(id) => handleDelete(Number(id))}
            />
          </div>
          <LoadingOverlay active={f.loading} label="Updating purchases…" />
        </div>
      )}
    </div>
  );
};

export default Purchases;
