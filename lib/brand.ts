/**
 * Central brand constants. Change these in one place if the product ever
 * needs a rename, credit line change, or a home domain move.
 */

export const BRAND = {
  name: "Meridian",
  tagline: "Read-only visibility for your Azure estate",
  taglineShort: "Read-only Azure visibility",
  attribution: "Built by Arunim's IT Caffe",
  version: "0.2.0",
  /** Displayed in small caps under the wordmark. */
  descriptor: "cloud inventory · signals · read-only",
  /** Public hostname where the app is served. */
  host: "meridian.cloudcanvas.info",
  /** Canonical URL for outbound references (email templates, PDF exports). */
  url: "https://meridian.cloudcanvas.info",
  /** Parent-brand marketing site. */
  parentBrand: {
    name: "Arunim's IT Caffe",
    host: "cloudcanvas.info",
    url: "https://cloudcanvas.info",
  },
} as const;
