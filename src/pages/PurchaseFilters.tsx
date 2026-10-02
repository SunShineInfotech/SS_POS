import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DatePicker } from "./Datepicker";
import { SearchableSelect } from "./Searchableselect";
import { PRESETS, type PurchaseDataState } from "./Usepurchasedata";

interface Props {
  f: PurchaseDataState;
  /** Extra buttons shown on the right of the preset chips */
  actions?: ReactNode;
  /** Short result summary, e.g. "12 purchases" */
  resultText?: string;
}

export const PurchaseFilters = ({ f, actions, resultText }: Props) => (
  <div className="space-y-3 rounded-2xl border border-border bg-card p-3 md:p-4">
    <div className="flex items-center gap-2">
      <div className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => f.applyPreset(p.key)}
            aria-pressed={f.preset === p.key}
            className={cn(
              "h-9 shrink-0 touch-manipulation rounded-full border px-4 text-sm font-medium transition-all active:scale-95",
              f.preset === p.key
                ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
        <span
          className={cn(
            "flex h-9 shrink-0 items-center rounded-full border px-4 text-sm font-medium",
            f.preset === "custom"
              ? "border-primary bg-primary/10 text-primary"
              : "border-dashed border-border text-muted-foreground",
          )}
        >
          Custom range
        </span>
      </div>
      {actions && <div className="hidden shrink-0 md:block">{actions}</div>}
    </div>

    <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_1fr_1.4fr]">
      <FilterField label="Start date">
        <DatePicker
          value={f.from}
          onChange={f.onFromChange}
          placeholder="Any date"
          disableFuture
          className="h-11 text-base md:h-10 md:text-sm"
        />
      </FilterField>
      <FilterField label="End date">
        <DatePicker
          value={f.to}
          onChange={f.onToChange}
          placeholder="Any date"
          disableFuture
          className="h-11 text-base md:h-10 md:text-sm"
        />
      </FilterField>
      <div className="col-span-2 md:col-span-1">
        <FilterField label="Vendor">
          <SearchableSelect
            value={f.vendorId}
            onChange={f.setVendorId}
            options={f.vendorOptions}
            placeholder="All vendors"
            searchPlaceholder="Search vendor"
            emptyText="No vendor found"
            className="h-11 text-base md:h-10 md:text-sm"
          />
        </FilterField>
      </div>
    </div>

    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className="flex min-w-0 items-center gap-1.5">
        {f.loading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
        <span className="truncate">
          {resultText && !f.initialLoading && (
            <span className="font-semibold text-foreground">
              {resultText},{" "}
            </span>
          )}
          {f.rangeLabel}
          {f.selectedVendorName && `, ${f.selectedVendorName}`}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-3">
        {!f.isDefault && (
          <button
            type="button"
            onClick={f.resetFilters}
            className="font-semibold text-primary hover:underline"
          >
            Clear filters
          </button>
        )}
        {actions && <div className="md:hidden">{actions}</div>}
      </div>
    </div>
  </div>
);

const FilterField = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div className="min-w-0">
    <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
    {children}
  </div>
);
