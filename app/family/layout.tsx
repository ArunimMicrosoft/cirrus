import type { Metadata } from "next";

const description =
  "The family of cloud-operator tools from Arunim's IT Caffe — small, sharp, read-only utilities for Azure engineers, alongside Meridian.";

export const metadata: Metadata = {
  title: "Family — cloud tools from Arunim's IT Caffe",
  description,
  keywords: ["cloud operator tools", "Azure tools", "Arunim's IT Caffe"],
  alternates: { canonical: "/family" },
  openGraph: {
    type: "website",
    title: "Family — cloud tools from Arunim's IT Caffe",
    description,
    url: "/family",
  },
};

export default function FamilyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
