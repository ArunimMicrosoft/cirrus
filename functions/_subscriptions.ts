/**
 * Shared subscription-listing helper used by /api/auth/login and
 * /api/subscriptions. The ARM /subscriptions endpoint is paginated via
 * `nextLink` — the previous implementation only fetched the first page,
 * which silently hid subscriptions in accounts with more than ~100 subs.
 *
 * This helper walks nextLink until exhausted, then maps to our own
 * AzureSubscription shape with HOME vs Lighthouse-delegated indicators.
 */

import { getArmToken, type ServicePrincipal } from "@/lib/azure/auth";
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
 * List every accessible subscription for the given SP. Walks all pages.
 * Marks each subscription with isHome=true when its tenantId matches the
 * SP's tenantId (HOME tenant), false when delegated via Lighthouse.
 */
export async function listAllSubscriptions(
  sp: ServicePrincipal,
): Promise<AzureSubscription[]> {
  const { token } = await getArmToken(sp);
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  } as const;

  const all: ArmSub[] = [];
  let url: string | null =
    "https://management.azure.com/subscriptions?api-version=2020-01-01";
  // Safety cap: don't loop forever if ARM misbehaves.
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
    tenantId: s.tenantId ?? sp.tenantId,
    state: s.state,
    isHome: (s.tenantId ?? sp.tenantId) === sp.tenantId,
  }));
}
