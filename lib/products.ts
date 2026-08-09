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
  /** Display name, e.g. "Meridian" */
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
    name: "Meridian",
    tagline: "Read-only Azure visibility",
    description:
      "Inventory, cost intelligence, security posture, and compliance reporting for every subscription in your tenant. All read-only.",
    status: "current",
  },
  {
    name: "CloudCanvas",
    tagline: "Design, Validate & Export Azure Architetcures",
    description:
      "Transform the way you design Azure solutions. Visually create and validate Azure architecture diagrams, generate ready-to-deploy Infrastructure as Code using Terraform or Bicep, and discover your existing Azure environment by reverse-engineering live infrastructure into clear, interactive architecture diagrams.",
    url: "https://cloudcanvas.co",
    domain: "cloudcanvas.co",
    status: "live",
  },
  {
    name: "CloudCanvas.info",
    tagline: "Digital Platform",
    description:
      "Elevate your projects with premium digital templates made for every moment. Explore a curated range of customizable designs including invitations, planners, e-books, wedding stationery, and more. With instant downloads and easy editing, you can create professional-looking designs quickly and confidently.",
    url: "https://cloudcanvas.info",
    domain: "cloudcanvas.info",
    status: "live",
  },
];
