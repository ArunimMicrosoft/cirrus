import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const SEO_DESCRIPTION =
  "Meridian is a read-only Azure console for engineers: live resource inventory, network topology and subnet reachability, NSG/WAF and CIS security posture, and cost forecasting from Azure Cost Management. Reader access only — no agents, no writes.";

const SEO_KEYWORDS = [
  "Azure inventory tool",
  "Azure cost management",
  "Azure cost forecast",
  "Azure networking",
  "Azure network topology",
  "Azure subnet reachability",
  "Azure NSG analysis",
  "Azure segmentation score",
  "Azure WAF review",
  "CIS Azure benchmark",
  "Azure security posture",
  "Azure architecture visibility",
  "Azure drift detection",
  "cloud architecture",
  "cloud governance",
  "read-only Azure",
  "Azure estate visibility",
  "Azure Well-Architected review",
  "Azure blast radius",
  "Reserved Instance right-sizing",
];

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: {
    default: `${BRAND.name} — Read-only Azure inventory, networking, security & cost console`,
    template: `%s — ${BRAND.name}`,
  },
  description: SEO_DESCRIPTION,
  keywords: SEO_KEYWORDS,
  applicationName: BRAND.name,
  authors: [{ name: BRAND.parentBrand.name, url: BRAND.parentBrand.url }],
  creator: BRAND.parentBrand.name,
  publisher: BRAND.parentBrand.name,
  category: "technology",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: BRAND.url,
    siteName: BRAND.name,
    locale: "en_US",
    title: `${BRAND.name} — Read-only Azure visibility for engineers`,
    description: SEO_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} — Read-only Azure visibility for engineers`,
    description:
      "Live Azure inventory, network topology & reachability, WAF/CIS security posture, and cost forecasting. Reader access only.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#171a20" },
  ],
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${BRAND.url}/#org`,
      name: BRAND.parentBrand.name,
      url: BRAND.parentBrand.url,
      description: "Independent tooling for cloud operators.",
    },
    {
      "@type": "WebSite",
      "@id": `${BRAND.url}/#website`,
      url: BRAND.url,
      name: BRAND.name,
      description: SEO_DESCRIPTION,
      publisher: { "@id": `${BRAND.url}/#org` },
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${BRAND.url}/#app`,
      name: BRAND.name,
      applicationCategory: "DeveloperApplication",
      applicationSubCategory: "Cloud management",
      operatingSystem: "Web",
      url: BRAND.url,
      description: SEO_DESCRIPTION,
      author: { "@id": `${BRAND.url}/#org` },
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "Azure resource inventory across every subscription",
        "Network topology and subnet reachability analysis",
        "NSG, WAF and public-exposure security review",
        "CIS benchmark and Well-Architected scoring",
        "Live cost forecasting via Azure Cost Management",
        "Reserved Instance and right-sizing analysis",
        "Configuration drift detection",
        "Blast-radius and attack-path analysis",
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
