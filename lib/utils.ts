import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names, resolving conflicts.
 * Used by every shadcn-style component.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a number as USD with 2 decimal places. */
export function formatCurrency(value: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(value)) return "-";
  if (opts.compact && Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Format an integer with thousands separators. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US").format(value);
}

/** Extract the resource group name from an ARM resource ID. */
export function resourceGroupFromId(id: string | null | undefined): string {
  if (!id) return "Unknown";
  const marker = "/resourceGroups/";
  const idx = id.toLowerCase().indexOf(marker.toLowerCase());
  if (idx === -1) return "Unknown";
  const rest = id.slice(idx + marker.length);
  const end = rest.indexOf("/");
  return end === -1 ? rest : rest.slice(0, end);
}

/** Extract the last path segment from an ARM resource ID (usually the resource name). */
export function resourceNameFromId(id: string | null | undefined): string {
  if (!id) return "";
  const parts = id.split("/");
  return parts[parts.length - 1] ?? "";
}

/** Validate an Azure GUID (tenant / client / subscription id). */
export function isValidGuid(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

/** Milliseconds since epoch for a value that may be a Date or ISO string. */
export function toEpochMs(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

/** Sleep for `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
