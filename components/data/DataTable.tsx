"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface DataColumn<T> {
  key: string;
  header: string;
  /** Render a cell. Defaults to accessor result as text. */
  cell?: (row: T) => React.ReactNode;
  /** Accessor for filtering and default rendering. */
  accessor?: (row: T) => string | number | null | undefined;
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  rows: T[] | undefined;
  columns: DataColumn<T>[];
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  emptyMessage?: string;
  /** Placeholder for the search box. Set to null to hide the filter. */
  searchPlaceholder?: string | null;
  /** Optional wrapper className. */
  className?: string;
  /** Rows visible per page. Defaults to 25. */
  pageSize?: number;
  /** Extract a stable row key. */
  getRowId?: (row: T, index: number) => string;
}

/**
 * A compact, accessible data table with client-side search + pagination. It
 * covers the "filter by name" + "download CSV/PDF" pattern used across every
 * view in the app without pulling in the full TanStack Table dependency for
 * simple cases.
 */
export function DataTable<T>({
  rows,
  columns,
  isLoading,
  isError,
  error,
  emptyMessage = "No records to display.",
  searchPlaceholder = "Filter…",
  className,
  pageSize = 25,
  getRowId,
}: DataTableProps<T>) {
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(0);

  const filtered = React.useMemo(() => {
    if (!rows) return [];
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((row) =>
      columns.some((col) => {
        const raw = col.accessor ? col.accessor(row) : null;
        if (raw === null || raw === undefined) return false;
        return String(raw).toLowerCase().includes(q);
      }),
    );
  }, [rows, query, columns]);

  React.useEffect(() => {
    setPage(0);
  }, [query, rows]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className={cn("space-y-3", className)}>
      {searchPlaceholder !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 md:max-w-sm">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-8"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear filter"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {isLoading
              ? "Loading…"
              : `${filtered.length.toLocaleString()} record${filtered.length === 1 ? "" : "s"}`}
          </div>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(col.headerClassName)}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {columns.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {isError && (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-8 text-center text-sm text-destructive"
                >
                  {(error instanceof Error ? error.message : String(error)) ||
                    "Failed to load data"}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && pageRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              !isError &&
              pageRows.map((row, idx) => (
                <TableRow key={getRowId?.(row, idx) ?? idx}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.cell
                        ? col.cell(row)
                        : col.accessor
                        ? String(col.accessor(row) ?? "")
                        : ""}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {filtered.length > pageSize && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>
            Page {page + 1} of {totalPages}
          </div>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
