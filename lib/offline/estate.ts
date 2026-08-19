/**
 * Offline / File mode — the parsed "estate" model and the resolvers that let
 * the normal ARM client serve data from an uploaded file instead of a live
 * Azure connection.
 *
 * A ParsedEstate holds resources already shaped exactly like the Azure ARM
 * REST responses the pages expect (camelCase, nested `properties`), keyed by
 * lowercased resource type. The api-client, when in offline mode, answers
 * `armList()` / `arm()` from `byType` — so every page works unchanged, just
 * over file data. Nothing here fetches or writes.
 */

import type { AzureSubscription } from "@/lib/azure/types";

/** Synthetic subscription id used for file-mode (never touches Azure). */
export const OFFLINE_SUBSCRIPTION_ID = "00000000-0000-0000-0000-000000000000";

export interface EstateSummaryRow {
  /** Human label, e.g. "Virtual networks". */
  label: string;
  /** Full ARM type, e.g. "Microsoft.Network/virtualNetworks". */
  type: string;
  count: number;
}

export interface ParsedEstate {
  /** True for the built-in demo estate (synthesises cost/metrics so every page works). */
  demo?: boolean;
  /** Which format the file was. */
  source: "arm" | "tfstate";
  /** Original uploaded file name. */
  fileName: string;
  /** ISO timestamp the data represents (file mtime, else upload time). */
  capturedAt: string;
  subscriptionId: string;
  subscriptionName: string;
  /** ARM-shaped resources keyed by lowercased type (or "resourcegroups"). */
  byType: Record<string, unknown[]>;
  /** Per-type counts for the summary UI. */
  summary: EstateSummaryRow[];
  /** Total resources parsed. */
  total: number;
}

export function offlineSubscription(estate: ParsedEstate): AzureSubscription {
  return {
    subscriptionId: estate.subscriptionId,
    displayName: estate.subscriptionName,
    tenantId: "file",
    state: "Enabled",
    isHome: true,
  };
}

/**
 * Map an ARM path (as passed to api.armList/api.arm, e.g.
 * "/providers/Microsoft.Network/virtualNetworks" or "/resourcegroups")
 * to the estate `byType` key.
 */
export function estateTypeKey(armPath: string): string | null {
  const p = armPath.toLowerCase();
  const marker = "/providers/";
  const idx = p.indexOf(marker);
  if (idx >= 0) {
    const after = p.slice(idx + marker.length); // e.g. microsoft.network/virtualnetworks[/name...]
    const parts = after.split("/").filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return after || null;
  }
  if (p.includes("resourcegroup")) return "resourcegroups";
  return null;
}

/** Resolve an ARM list call to the matching parsed resources. */
export function resolveEstateList(estate: ParsedEstate, armPath: string): unknown[] {
  const key = estateTypeKey(armPath);
  if (!key) return [];
  return estate.byType[key] ?? [];
}

/** Best-effort resolve of a single-resource GET by matching the id suffix. */
export function resolveEstateSingle(estate: ParsedEstate, armPath: string): unknown | null {
  const key = estateTypeKey(armPath);
  const needle = armPath.toLowerCase();
  const candidates = key ? estate.byType[key] ?? [] : Object.values(estate.byType).flat();
  for (const r of candidates) {
    const id = (r as { id?: string }).id;
    if (id && needle.endsWith(id.toLowerCase())) return r;
  }
  // Fall back to the first of the type, if any (single-VNet, single-NSG cases).
  return candidates.length > 0 ? candidates[0] : null;
}
