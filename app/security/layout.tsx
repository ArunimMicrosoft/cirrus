import type { Metadata } from "next";

const description =
  "How Meridian stays read-only on your Azure tenant: a GET-only ARM proxy, query-only Resource Graph, no write SDK in the bundle, and browser-local state. Reader role only, no agents, no server-side data retention.";

export const metadata: Metadata = {
  title: "Security & the read-only guarantee",
  description,
  keywords: [
    "read-only Azure access",
    "Azure Reader role tool",
    "Azure security review",
    "no-write Azure tool",
    "Azure data residency",
    "Azure least privilege",
  ],
  alternates: { canonical: "/security" },
  openGraph: {
    type: "article",
    title: "Meridian security — the read-only guarantee",
    description,
    url: "/security",
  },
};

export default function SecurityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
