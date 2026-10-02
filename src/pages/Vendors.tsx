// src/pages/Vendors.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowUpRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VendorService, Vendor } from "@/services/vendor.service";
import {
  LoaderStyles,
  LoadingOverlay,
  TableSkeleton,
  TopProgressBar,
} from "@/components/Loader";

const getCompanyData = () => {
  try {
    const raw = localStorage.getItem("company_data");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const inr = (n: number) =>
  `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const Vendors = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Vendor[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  /** Opens Purchase Payment with this vendor already selected */
  const openPayments = useCallback(
    (vendorId: string | number) =>
      navigate(`/purchase-payments?vendor=${vendorId}`),
    [navigate],
  );

  const columns: any = useMemo(
    () => [
      { key: "vendor_name", label: "Name" },
      { key: "vendor_mobile_no", label: "Mobile" },
      { key: "vendor_city_name", label: "City", render: (v: any) => v || "-" },
      {
        key: "vendor_gst_number",
        label: "GST Number",
        render: (v: any) => v || "-",
      },
      {
        key: "vendor_wallet",
        label: "Outstanding",
        render: (v: any, row: any) => {
          const amount = Number(v || 0);
          const vendorId = row?.vendor_id ?? row?.id;
          return (
            <button
              type="button"
              onClick={(e) => {
                // Don't trigger the row's own click (edit) in the table
                e.stopPropagation();
                if (vendorId) openPayments(vendorId);
              }}
              title="Open purchase payments for this vendor"
              aria-label={`Outstanding ${inr(amount)}. Open purchase payments for ${row?.vendor_name ?? "this vendor"}`}
              className={cn(
                "group inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-display text-xs font-semibold tabular-nums transition-all hover:shadow-sm active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                amount > 0 &&
                  "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400",
                amount < 0 &&
                  "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400",
                amount === 0 &&
                  "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {amount < 0 ? `${inr(-amount)} advance` : inr(amount)}
              <ArrowUpRight className="h-3.5 w-3.5 opacity-60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
            </button>
          );
        },
      },
    ],
    [openPayments],
  );

  const fetchVendors = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      const company = getCompanyData();
      if (!company) {
        toast.error("Company data not found. Please sign in again.");
        setInitialLoading(false);
        return;
      }

      if (mode === "refresh") setRefreshing(true);
      else setInitialLoading(true);
      setError("");

      try {
        const res = await VendorService.getVendors(
          company.company_id,
          company.franchise_id,
        );
        if (res.status === "success" && res.data) {
          setData(res.data.map((item) => ({ ...item, id: item.vendor_id })));
          if (mode === "refresh") toast.success("Vendor list updated");
        } else {
          const msg = res.message || "Couldn't load vendors";
          setError(msg);
          toast.error(msg);
        }
      } catch (err) {
        console.error("Error fetching vendors:", err);
        setError("Couldn't load vendors. Check your connection and try again.");
        toast.error("Couldn't load vendors. Try again.");
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchVendors("initial");
  }, [fetchVendors]);

  const handleDelete = async (id: number) => {
    const company = getCompanyData();
    if (!company) return;
    try {
      const res = await VendorService.deleteVendor(
        id,
        company.company_id,
        company.franchise_id,
      );
      if (res.status === "success") {
        setData((prev) => prev.filter((v) => Number(v.vendor_id) !== id));
        toast.success(res.message || "Vendor deleted");
      } else {
        toast.error(res.message || "Couldn't delete the vendor");
      }
    } catch (err) {
      console.error("Error deleting:", err);
      toast.error("Couldn't delete the vendor. Try again.");
    }
  };

  const busy = initialLoading || refreshing;
  const count = data.length;
  const totalOutstanding = data.reduce(
    (s, v: any) => s + Math.max(Number(v.vendor_wallet || 0), 0),
    0,
  );

  return (
    <div className="space-y-4">
      <LoaderStyles />

      {/* Toolbar: count, total outstanding, reload */}
      <div className="flex flex-wrap items-center gap-3">
        {/* <p className="text-sm text-muted-foreground">
          {initialLoading ? (
            "Loading vendors…"
          ) : (
            <>
              {count} {count === 1 ? "vendor" : "vendors"}
              {totalOutstanding > 0 && (
                <>
                  , total outstanding{" "}
                  <span className="font-display font-semibold text-foreground">
                    {inr(totalOutstanding)}
                  </span>
                </>
              )}
            </>
          )}
        </p> */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fetchVendors("refresh")}
          disabled={busy}
          className="ml-auto h-9 gap-1.5 rounded-full"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          {refreshing ? "Reloading…" : "Reload"}
        </Button>
      </div>

      {initialLoading ? (
        <TableSkeleton />
      ) : error && count === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 px-6 py-10 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fetchVendors("refresh")}
            className="gap-1.5"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        </div>
      ) : (
        <div className="relative" aria-busy={refreshing}>
          <TopProgressBar active={refreshing} />
          <div
            className={cn(
              "transition-opacity duration-200",
              refreshing && "pointer-events-none opacity-60",
            )}
          >
            <DataTable
              data={data}
              columns={columns}
              onAdd={() => navigate("/vendors/new")}
              onEdit={(row) => navigate(`/vendors/${row.id}`)}
              onDelete={(id) => handleDelete(id as number)}
              addLabel="Add Vendor"
              hideStatusToggle
            />
          </div>
          <LoadingOverlay active={refreshing} label="Reloading vendors…" />
        </div>
      )}
    </div>
  );
};

export default Vendors;
