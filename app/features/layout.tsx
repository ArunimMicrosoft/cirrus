import type { Metadata } from "next";

const description =
  "What Meridian does for Azure engineers: hop-by-hop network path tracing, subnet reachability, NSG/WAF review, CIS benchmark and Well-Architected scoring, live cost forecasting, right-sizing, and drift detection — all read-only.";

export const metadata: Metadata = {
  title: "Features — Azure network, security & cost tooling",
  description,
  keywords: [
    "Azure network path tracing",
    "Azure traffic simulator",
    "Azure WAF review",
    "CIS Azure benchmark",
    "Azure Well-Architected review",
    "Azure right-sizing",
    "Azure cost forecast",
    "Azure drift detection",
    "Azure blast radius",
  ],
  alternates: { canonical: "/features" },
  openGraph: {
    type: "article",
    title: "Meridian features — Azure network, security & cost tooling",
    description,
    url: "/features",
  },
};

export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
