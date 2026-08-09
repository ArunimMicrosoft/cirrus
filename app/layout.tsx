import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { BRAND } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: {
    default: `${BRAND.name} — ${BRAND.taglineShort}`,
    template: `%s — ${BRAND.name}`,
  },
  description: `${BRAND.name} is a read-only Azure inventory, cost intelligence, and compliance reporting tool. ${BRAND.attribution}.`,
  applicationName: BRAND.name,
  authors: [{ name: BRAND.parentBrand.name }],
  creator: BRAND.parentBrand.name,
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    url: BRAND.url,
    siteName: BRAND.name,
    title: `${BRAND.name} — ${BRAND.taglineShort}`,
    description: `Read-only Azure inventory and compliance reporting. ${BRAND.attribution}.`,
  },
  twitter: {
    card: "summary",
    title: `${BRAND.name} — ${BRAND.taglineShort}`,
    description: `Read-only Azure inventory and compliance reporting.`,
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
