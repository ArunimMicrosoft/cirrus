"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthState } from "@/lib/hooks/use-auth";
import {
  TopNav,
  Hero,
  Pillars,
  MetricsRow,
  FileModeSection,
  SignalsStrip,
  Algorithms,
  FamilyStrip,
  SignIn,
  Footer,
} from "@/components/landing/sections";

/**
 * Landing page. Keeps to essentials only:
 *   Hero → three-signal preview → Sign in.
 * Feature deep-dives live at /features. Security lives at /security.
 * Family (the sibling products) lives at /family.
 */
export default function LandingPage() {
  const router = useRouter();
  const { data, isSuccess } = useAuthState();

  useEffect(() => {
    if (isSuccess && data?.authenticated) {
      router.replace("/dashboard");
    }
  }, [data, isSuccess, router]);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <TopNav />
      <Hero />
      <MetricsRow />
      <Pillars />
      <FileModeSection />
      <SignalsStrip />
      <Algorithms />
      <SignIn />
      <FamilyStrip />
      <Footer />
    </div>
  );
}
