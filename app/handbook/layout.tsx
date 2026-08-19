import type { Metadata } from "next";

const description =
  "The Meridian handbook: a full technical and security walkthrough for engineers, MSPs, and CISOs — architecture, data flow at every click, the four-layer read-only guarantee, and a security review checklist.";

export const metadata: Metadata = {
  title: "Handbook — architecture & security deep dive",
  description,
  keywords: [
    "Azure tool security review",
    "Azure architecture documentation",
    "CISO Azure approval",
    "Azure MSP Lighthouse",
    "read-only Azure architecture",
    "Azure data flow",
  ],
  alternates: { canonical: "/handbook" },
  openGraph: {
    type: "article",
    title: "The Meridian handbook — architecture & security deep dive",
    description,
    url: "/handbook",
  },
};

export default function HandbookLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
