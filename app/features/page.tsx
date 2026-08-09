"use client";

import {
  TopNav,
  PageHero,
  MetricsRow,
  ProductStory,
  Toolkit,
  Intelligence,
  Algorithms,
  CapabilityList,
  Footer,
} from "@/components/landing/sections";

/**
 * /features — everything about what Meridian does. Kept off the landing so
 * the front door stays skimmable.
 */
export default function FeaturesPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <TopNav />
      <PageHero
        eyebrow="Features"
        title="What Meridian does for a cloud operator"
        subtitle="Inventory is the starting point. The value shows up in the tools built on top — network path tracing, WAF review, risk-scored drift, live pricing, and the intelligence layer that turns raw data into an action list."
      />
      <MetricsRow />
      <ProductStory />
      <Toolkit />
      <Intelligence />
      <Algorithms />
      <CapabilityList />
      <Footer />
    </div>
  );
}
