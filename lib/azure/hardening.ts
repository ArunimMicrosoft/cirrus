/**
 * CIS / STIG / hardened image classifier.
 *
 * Given the Marketplace publisher / offer / SKU triple for a VM image,
 * returns a human-readable hardening classification. Recognises CIS-branded
 * images, DoD STIG images, and vendor-hardened base images (e.g. Bitnami).
 */

const CIS_IMAGES: Record<string, string> = {
  "cis-ubuntu-linux-20.04-lts": "CIS Ubuntu 20.04-L1",
  "cis-ubuntu-linux-22.04-lts": "CIS Ubuntu 22.04-L1",
  "cis-ubuntu-linux-18.04-lts": "CIS Ubuntu 18.04-L1",
  "cis-rhel-8-l1": "CIS RHEL 8-L1",
  "cis-rhel-8-l2": "CIS RHEL 8-L2",
  "cis-rhel-9-l1": "CIS RHEL 9-L1",
  "cis-rhel-7-l1": "CIS RHEL 7-L1",
  "cis-windows-server-2022-l1": "CIS Win 2022-L1",
  "cis-windows-server-2019-l1": "CIS Win 2019-L1",
  "stig-rhel-8": "STIG RHEL 8",
  "stig-rhel-7": "STIG RHEL 7",
};

export type HardeningLevel =
  | "cis"
  | "stig"
  | "azure-baseline"
  | "hardened"
  | "standard";

export interface HardeningClassification {
  level: HardeningLevel;
  label: string;
}

export function classifyHardening(
  publisher: string | null | undefined,
  offer: string | null | undefined,
  sku: string | null | undefined,
): HardeningClassification {
  const skuLower = (sku ?? "").toLowerCase();
  const offerLower = (offer ?? "").toLowerCase();
  const publisherLower = (publisher ?? "").toLowerCase();

  for (const [key, label] of Object.entries(CIS_IMAGES)) {
    if (skuLower.includes(key)) {
      return {
        level: key.startsWith("stig") ? "stig" : "cis",
        label,
      };
    }
  }

  if (publisherLower === "microsoft" && offerLower.includes("baseline")) {
    return { level: "azure-baseline", label: "Azure Security Baseline" };
  }

  if (
    offerLower.includes("hardened") ||
    offerLower.includes("secure") ||
    offerLower.includes("stig")
  ) {
    return {
      level: "hardened",
      label: `Hardened: ${(offer ?? "").slice(0, 20)}`,
    };
  }

  return { level: "standard", label: "Standard Marketplace" };
}
