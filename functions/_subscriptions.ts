/**
 * Shared subscription-listing helper used by /api/auth/login,
 * /api/auth/device/poll, and /api/subscriptions.
 *
 * The ARM /subscriptions endpoint is paginated via nextLink — the previous
 * implementation only fetched the first page, which silently hid
 * subscriptions in accounts with more than ~100 subs. This helper walks
 * nextLink until exhausted.
 *
 * Takes a raw ARM access token so both Service Principal and delegated
 * user (device code) sessions can share the same code path.
 */

import type { AzureSubscription } from "@/lib/azure/types";

interface ArmSub {
  subscriptionId: string;
  displayName: string;
  tenantId: string;
  state: string;
}

interface Page {
  value: ArmSub[];
  nextLink?: string;
}

/**
 * List every subscription visible to the given ARM token. Walks all pages
 * up to a safety cap.
 *
 * @param token   Raw ARM access token
 * @param homeTenantId   The session's home tenant, used to mark subs as
 *   isHome vs delegated via Azure Lighthouse.
 */
export async function listAllSubscriptionsWithToken(
  token: string,
  homeTenantId: string,
): Promise<AzureSubscription[]> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  } as const;

  const all: ArmSub[] = [];
  let url: string | null =
    "https://management.azure.com/subscriptions?api-version=2020-01-01";
  let pages = 0;
  while (url && pages < 50) {
    const resp: Response = await fetch(url, { headers });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`ARM ${resp.status}: ${text.slice(0, 500)}`);
    }
    const page = (await resp.json()) as Page;
    if (Array.isArray(page.value)) all.push(...page.value);
    url = page.nextLink ?? null;
    pages++;
  }

  return all.map((s) => ({
    subscriptionId: s.subscriptionId,
    displayName: s.displayName,
    tenantId: s.tenantId ?? homeTenantId,
    state: s.state,
    isHome: (s.tenantId ?? homeTenantId) === homeTenantId,
  }));
}
