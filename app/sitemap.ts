import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

// Static export: Next generates /sitemap.xml at build time.
export const dynamic = "force-static";

/**
 * Public, crawlable marketing routes only. The authenticated console routes
 * (/dashboard, /inventory/*, etc.) sit behind sign-in and are excluded from
 * the sitemap and disallowed in robots.txt.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" },
    { path: "/features", priority: 0.9, changeFrequency: "weekly" },
    { path: "/security", priority: 0.8, changeFrequency: "monthly" },
    { path: "/handbook", priority: 0.7, changeFrequency: "monthly" },
    { path: "/family", priority: 0.5, changeFrequency: "monthly" },
  ];
  return routes.map((r) => ({
    url: `${BRAND.url}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
