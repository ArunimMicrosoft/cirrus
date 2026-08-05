"use client";

import { Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Rendered inside a page when no subscription is currently selected. The
 * subscription picker in the top bar is always visible so users can choose
 * one without leaving the page.
 */
export function NoSubscriptionState() {
  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertTitle>Select a subscription</AlertTitle>
      <AlertDescription>
        Choose a subscription from the picker at the top to load data for this
        view.
      </AlertDescription>
    </Alert>
  );
}
