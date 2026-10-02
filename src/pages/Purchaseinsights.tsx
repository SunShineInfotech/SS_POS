import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PurchaseFilters } from "./PurchaseFilters";
import { PurchaseKpis } from "./Purchasekpis";
import {
  KpiSkeleton,
  LoaderStyles,
  TopProgressBar,
} from "./../components/Loader";
import { usePurchaseData } from "./Usepurchasedata";

const PurchaseInsights = () => {
  const navigate = useNavigate();
  const f = usePurchaseData("all");

  return (
    <div className="space-y-4">
      <LoaderStyles />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate("/purchases")}
          aria-label="Back to purchases"
          className="-ml-2 flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full hover:bg-muted active:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-bold">
            Purchase Insights
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            Spend, GST and vendor summary
          </p>
        </div>
      </div>

      <PurchaseFilters
        f={f}
        resultText={`${f.data.length} ${f.data.length === 1 ? "bill" : "bills"}`}
      />

      {f.initialLoading ? (
        <KpiSkeleton />
      ) : f.error && f.data.length === 0 ? (
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
          <PurchaseKpis
            data={f.data}
            loading={f.loading}
            rangeLabel={f.rangeLabel}
            selectedVendorName={f.selectedVendorName}
            onPickVendor={f.pickVendorByName}
          />
        </div>
      )}
    </div>
  );
};

export default PurchaseInsights;
