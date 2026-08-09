"use client";

import {
  TopNav,
  Family,
  Footer,
} from "@/components/landing/sections";

/**
 * /family — sibling products from Arunim's IT Caffe.
 */
export default function FamilyPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <TopNav />
      <Family />
      <Footer />
    </div>
  );
}
