"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Minimal checkbox styled to match the design system. Uses a native <input>
 * to keep bundle size small; Radix Checkbox can be swapped in later if a11y
 * requirements grow.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => (
    <input
      type="checkbox"
      ref={ref}
      className={cn(
        "h-4 w-4 rounded border border-input text-primary shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
