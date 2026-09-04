"use client";

import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { KEYVAULT_KINDS, type KeyVaultDataItem, type KeyVaultObjectKind } from "@/lib/azure/keyvault";

export interface VaultRef {
  /** Vault resource name (for display). */
  name: string;
  /** Data-plane endpoint, e.g. https://my-vault.vault.azure.net/ */
  vaultUri: string;
  /** Resource group (for display), optional. */
  resourceGroup?: string;
}

/** One flattened object row across all vaults/kinds. */
export interface VaultObjectRecord {
  vault: string;
  resourceGroup: string;
  kind: KeyVaultObjectKind;
  item: KeyVaultDataItem;
}

/** A per-(vault,kind) failure — surfaced so the UI can explain access gaps. */
export interface VaultObjectError {
  vault: string;
  kind: KeyVaultObjectKind;
  status?: number;
  message: string;
}

export interface UseVaultObjectsResult {
  records: VaultObjectRecord[];
  errors: VaultObjectError[];
  isLoading: boolean;
  isFetching: boolean;
  /** True only when every query failed (nothing to show at all). */
  allFailed: boolean;
}

interface ApiErrorLike {
  status?: number;
  message?: string;
}

/**
 * Fan out data-plane object listing across every vault × {keys,secrets,certificates}.
 * Each vault/kind is its own react-query entry so one vault's access denial
 * doesn't blank out the rest — partial results are the common real-world case.
 */
export function useVaultObjects(vaults: VaultRef[]): UseVaultObjectsResult {
  const entries = vaults.flatMap((v) =>
    KEYVAULT_KINDS.map((kind) => ({ vault: v, kind })),
  );

  const results = useQueries({
    queries: entries.map(({ vault, kind }) => ({
      queryKey: ["kv-objects", vault.vaultUri, kind] as const,
      queryFn: () => api.vaultObjects(vault.vaultUri, kind),
      enabled: Boolean(vault.vaultUri),
      staleTime: 60_000,
      retry: 1,
    })),
  });

  const records: VaultObjectRecord[] = [];
  const errors: VaultObjectError[] = [];

  results.forEach((res, idx) => {
    const { vault, kind } = entries[idx];
    if (res.data?.value) {
      for (const item of res.data.value) {
        records.push({
          vault: vault.name,
          resourceGroup: vault.resourceGroup ?? "—",
          kind,
          item,
        });
      }
    }
    if (res.isError) {
      const err = res.error as ApiErrorLike;
      errors.push({
        vault: vault.name,
        kind,
        status: err?.status,
        message: err?.message ?? "Failed to read objects",
      });
    }
  });

  const isLoading = results.length > 0 && results.some((r) => r.isLoading);
  const isFetching = results.some((r) => r.isFetching);
  const allFailed =
    results.length > 0 && results.every((r) => r.isError);

  return { records, errors, isLoading, isFetching, allFailed };
}
