// src/components/shared/CategoryCombobox.tsx
import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CategoryService } from "@/services/category.service";
import { Category } from "@/services/category.types";

interface CategoryComboboxProps {
  companyId: string;
  franchiseId: string;
  value: number; // selected category_id, 0 = none selected
  onChange: (categoryId: number) => void;
  disabled?: boolean;
}

export function CategoryCombobox({
  companyId,
  franchiseId,
  value,
  onChange,
  disabled,
}: CategoryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const loadCategories = async () => {
    if (!companyId || !franchiseId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await CategoryService.getCategories(companyId, franchiseId);
      if (res.status === "success" && res.data) {
        setCategories(res.data);
      } else {
        setLoadFailed(true);
      }
    } catch (err) {
      console.error("Error loading categories:", err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, franchiseId]);

  const selected = categories.find((c) => Number(c.category_id) === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className="w-full justify-between font-normal"
        >
          {loading ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading categories...
            </span>
          ) : selected ? (
            selected.category_name
          ) : (
            <span className="text-muted-foreground">Select a category</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search categories..." />
          <CommandList>
            {loadFailed ? (
              <div className="space-y-2 p-3 text-center text-sm">
                <p className="text-destructive">Could not load categories.</p>
                <Button type="button" size="sm" variant="outline" onClick={loadCategories}>
                  Retry
                </Button>
              </div>
            ) : (
              <>
                <CommandEmpty>No category found.</CommandEmpty>
                <CommandGroup>
                  {categories.map((category) => {
                    const catId = Number(category.category_id);
                    return (
                      <CommandItem
                        key={category.category_id}
                        value={category.category_name}
                        onSelect={() => {
                          onChange(catId);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            value === catId ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {category.category_name}
                        {Number(category.category_status) === 2 && (
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            Inactive
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}