import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

// Static export: Next generates /robots.txt at build time.
export const dynamic = "force-static";

/**
 * Allow crawling of the public marketing pages; keep the API and the
 * auth-walled console routes out of the index (they only render a sign-in
 * screen to a crawler, so they add no search value).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/inventory/",
          "/cost/",
          "/monitoring/",
          "/networking/",
          "/tools/",
          "/intelligence/",
          "/signals",
          "/security/blast-radius",
          "/security/cis",
          "/security/key-vault",
          "/security/waf",
        ],
      },
    ],
    sitemap: `${BRAND.url}/sitemap.xml`,
    host: BRAND.url,
  };
}
