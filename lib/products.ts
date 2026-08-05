/**
 * Product family under the Arunim's IT Caffe umbrella.
 *
 * Add a new entry to `FAMILY_PRODUCTS` to have it show up on the landing
 * page's "More from Arunim's IT Caffe" section. Order in this list is
 * the order shown on the page.
 *
 * status:
 *   - "current"     the app the visitor is currently on (no external link)
 *   - "live"        another product live at `url`
 *   - "coming-soon" a placeholder for future launches (no link rendered)
 */

export type FamilyProductStatus = "current" | "live" | "coming-soon";

export interface FamilyProduct {
  /** Display name, e.g. "Cirrus" */
  name: string;
  /** One-line positioning under the name, e.g. "Read-only Azure visibility" */
  tagline: string;
  /** Sentence or two shown in the description column */
  description: string;
  /** Public URL (omit for "current" or "coming-soon") */
  url?: string;
  /** Short domain shown next to the arrow, e.g. "cloudcanvas.co" */
  domain?: string;
  status: FamilyProductStatus;
}

export const FAMILY_PRODUCTS: FamilyProduct[] = [
  {
    name: "Cirrus",
    tagline: "Read-only Azure visibility",
    description:
      "Inventory, cost intelligence, security posture, and compliance reporting for every subscription in your tenant. All read-only.",
    status: "current",
  },
  {
    name: "CloudCanvas",
    tagline: "Cloud architecture design",
    description:
      "Design, diagram, and share cloud architectures visually — a canvas built for the way cloud teams actually think.",
    url: "https://cloudcanvas.co",
    domain: "cloudcanvas.co",
    status: "live",
  },
];
