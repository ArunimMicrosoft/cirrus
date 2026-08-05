import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { BRAND } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.taglineShort}`,
  description: `${BRAND.name} is a read-only Azure inventory, cost intelligence, and compliance reporting tool. ${BRAND.attribution}.`,
  applicationName: BRAND.name,
  authors: [{ name: "Arunim's IT Caffe" }],
  creator: "Arunim's IT Caffe",
  robots: { index: false, follow: false },
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
