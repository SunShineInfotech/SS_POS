import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  ChevronUp,
  ChevronDown,
  Download,
  Plus,
  Trash2,
  RotateCcw,
  Pencil,
} from "lucide-react";

interface Column<T> {
  key: keyof T;
  label: string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
}

interface DataTableProps<T extends { id: number | string; deleted?: boolean }> {
  data: T[];
  columns: Column<T>[];
  onAdd?: () => void;
  onEdit?: (item: T) => void;
  onDelete?: (id: T["id"]) => void;
  onRestore?: (id: T["id"]) => void;
  addLabel?: string;
  hideStatusToggle?: boolean;
}

export function DataTable<
  T extends { id: number | string; deleted?: boolean },
>({
  data,
  columns,
  onAdd,
  onEdit,
  onDelete,
  onRestore,
  addLabel = "Add New",
  hideStatusToggle = false,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showDeleted, setShowDeleted] = useState(false);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<T["id"] | null>(null);

  const filtered = useMemo(() => {
    let items = data.filter((d) => (showDeleted ? d.deleted : !d.deleted));
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((item) =>
        columns.some((col) => String(item[col.key]).toLowerCase().includes(q)),
      );
    }
    if (sortKey) {
      items = [...items].sort((a, b) => {
        const av = String(a[sortKey]);
        const bv = String(b[sortKey]);
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return items;
  }, [data, search, sortKey, sortDir, showDeleted, columns]);

  const paginated = useMemo(() => {
    if (pageSize === 0) return filtered;
    return filtered.slice(page * pageSize, (page + 1) * pageSize);
  }, [filtered, page, pageSize]);

  const totalPages = pageSize === 0 ? 1 : Math.ceil(filtered.length / pageSize);

  const toggleSort = (key: keyof T) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const exportCSV = () => {
    const header = columns.map((c) => c.label).join(",");
    const rows = filtered.map((row) =>
      columns.map((c) => String(row[c.key])).join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "export.csv";
    a.click();
  };

  const cell = (col: Column<T>, row: T) =>
    col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "");

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-9 h-10 sm:h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDeleted(!showDeleted)}
            className={`px-3 py-2 sm:py-1.5 rounded-md text-xs font-medium transition-colors ${
              showDeleted
                ? "bg-destructive text-destructive-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {showDeleted ? "Deleted" : "Active"}
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            className="gap-1 text-xs h-9"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          {onAdd && (
            <Button
              size="sm"
              onClick={onAdd}
              className="gap-1 text-xs font-display h-9 flex-1 sm:flex-none"
            >
              <Plus className="h-3.5 w-3.5" />
              {addLabel}
            </Button>
          )}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block border border-border rounded-xl overflow-hidden bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60">
                {columns.map((col) => (
                  <th
                    key={String(col.key)}
                    onClick={() => toggleSort(col.key)}
                    className="text-left px-4 py-2.5 font-display text-xs font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {sortKey === col.key &&
                        (sortDir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        ))}
                    </span>
                  </th>
                ))}
                <th className="w-24 px-4 py-2.5 text-right font-display text-xs font-semibold text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((row) => (
                <tr
                  key={String(row.id)}
                  className="border-b border-border last:border-0 odd:bg-card even:bg-muted/20 hover:bg-primary/5 transition-colors"
                >
                  {columns.map((col) => (
                    <td
                      key={String(col.key)}
                      className="px-4 py-2.5 align-middle"
                    >
                      {cell(col, row)}
                    </td>
                  ))}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {onEdit && !showDeleted && (
                        <button
                          onClick={() => onEdit(row)}
                          aria-label="Edit record"
                          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {showDeleted && onRestore ? (
                        <button
                          onClick={() => onRestore(row.id)}
                          aria-label="Restore"
                          className="p-1.5 rounded-md text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      ) : onDelete ? (
                        <button
                          onClick={() => setPendingDelete(row.id)}
                          aria-label="Delete"
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile / tablet cards */}
      <div className="md:hidden space-y-2.5">
        {paginated.map((row) => {
          const [first, second, ...rest] = columns;
          return (
            <div
              key={String(row.id)}
              onClick={() => (showDeleted ? undefined : onEdit?.(row))}
              className="rounded-2xl border border-border bg-card p-3.5 shadow-card active:scale-[0.995] transition-transform"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold truncate">
                    {cell(first, row)}
                  </p>
                  {second && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {second.label}: {cell(second, row)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {onEdit && !showDeleted && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(row);
                      }}
                      aria-label="Edit record"
                      className="p-2 rounded-lg bg-primary/10 text-primary"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {showDeleted && onRestore ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRestore(row.id);
                      }}
                      aria-label="Restore"
                      className="p-2 rounded-lg bg-secondary text-accent"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  ) : onDelete ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(row.id);
                      }}
                      aria-label="Delete"
                      className="p-2 rounded-lg bg-destructive/10 text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>

              {rest.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-2.5">
                  {rest.map((col) => (
                    <div key={String(col.key)} className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {col.label}
                      </p>
                      <div className="text-xs truncate">{cell(col, row)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {paginated.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No records found
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="hidden sm:flex items-center gap-2">
          <span>Show:</span>
          {[20, 40, 50, 100, 0].map((size) => (
            <button
              key={size}
              onClick={() => {
                setPageSize(size);
                setPage(0);
              }}
              className={`px-2 py-1 rounded ${pageSize === size ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {size === 0 ? "All" : size}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span>{filtered.length} records</span>
          {totalPages > 1 && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                className="h-8 text-xs"
              >
                Prev
              </Button>
              <span>
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
                className="h-8 text-xs"
              >
                Next
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              Delete this record?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this record? You can restore it
              later from the Deleted view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete !== null) onDelete?.(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
