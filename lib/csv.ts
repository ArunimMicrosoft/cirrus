/**
 * Client-side CSV export. Serialises a list of records into a CSV Blob and
 * triggers a browser download for the current view.
 */

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export interface CsvColumn<T> {
  header: string;
  accessor: (row: T) => unknown;
}

/** Build a CSV string from rows and column definitions. */
export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvValue(c.header)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeCsvValue(c.accessor(row))).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

/** Trigger a browser download for the given CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export function triggerDownload(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Timestamped filename suffix used across every export. */
export function timestampedFilename(base: string, ext: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${base}_${y}${m}${d}_${hh}${mm}${ss}.${ext}`;
}
