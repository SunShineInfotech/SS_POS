// src/components/shared/FranchiseMultiSelect.tsx
import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { apiClient } from "@/services/api.config";

interface Franchise {
  franchise_id: string;
  franchise_name: string;
}

interface FranchiseMultiSelectProps {
  companyId: string;
  value: string; // comma-separated IDs
  onChange: (ids: string) => void;
  disabled?: boolean;
}

export function FranchiseMultiSelect({
  companyId,
  value,
  onChange,
  disabled,
}: FranchiseMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const selectedIds = value ? value.split(",").filter(Boolean) : [];

  const loadFranchises = async () => {
    if (!companyId) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await apiClient.post('/franchise.php', {
        type: 2,
        company_id: companyId,
        // Assuming franchise.php has type 2 to fetch all active franchises for company
      });
      if (res.data.status === "success" && res.data.data) {
        setFranchises(res.data.data);
      } else {
        setLoadFailed(true);
      }
    } catch (err) {
      console.error("Error loading franchises:", err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFranchises();
  }, [companyId]);

  const toggleSelection = (franchiseId: string) => {
    const current = new Set(selectedIds);
    if (current.has(franchiseId)) {
      current.delete(franchiseId);
    } else {
      current.add(franchiseId);
    }
    onChange(Array.from(current).join(","));
  };

  const removeSelection = (franchiseId: string) => {
    const current = selectedIds.filter((id) => id !== franchiseId);
    onChange(current.join(","));
  };

  const selectedFranchises = franchises.filter((f) => selectedIds.includes(f.franchise_id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className="w-full justify-between h-auto min-h-10"
        >
          {loading ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading...
            </span>
          ) : selectedFranchises.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selectedFranchises.map((f) => (
                <Badge key={f.franchise_id} variant="secondary" className="text-xs">
                  {f.franchise_name}
                  {!disabled && (
                    <button
                      type="button"
                      className="ml-1 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSelection(f.franchise_id);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">Select franchises</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search franchises..." />
          <CommandEmpty>
            {loadFailed ? (
              <div className="p-3 text-center text-sm">
                <p className="text-destructive">Could not load franchises.</p>
                <Button type="button" size="sm" variant="outline" onClick={loadFranchises} className="mt-2">
                  Retry
                </Button>
              </div>
            ) : (
              "No franchise found."
            )}
          </CommandEmpty>
          <CommandGroup>
            {franchises.map((f) => (
              <CommandItem
                key={f.franchise_id}
                value={f.franchise_name}
                onSelect={() => toggleSelection(f.franchise_id)}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    selectedIds.includes(f.franchise_id) ? "opacity-100" : "opacity-0"
                  )}
                />
                {f.franchise_name}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}