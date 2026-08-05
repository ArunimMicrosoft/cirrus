"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { NAV_GROUPS } from "@/lib/nav";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "sidebar-shell flex h-full w-64 shrink-0 flex-col",
        className,
      )}
      aria-label="Primary navigation"
    >
      <Link
        href="/"
        className="flex h-14 items-center gap-2.5 border-b px-4 transition-colors hover:bg-white/[0.03]"
        style={{ borderColor: "hsl(var(--sidebar-border))" }}
      >
        <span className="font-display text-[20px] leading-none tracking-tight text-white">
          {BRAND.name}
        </span>
        <span className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-white/45">
          {BRAND.descriptor}
        </span>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="sidebar-group-label">{group.label}</div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="sidebar-item"
                      data-active={active ? "true" : "false"}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.9} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div
        className="space-y-2 border-t px-4 py-3.5 text-[11px] leading-relaxed"
        style={{ borderColor: "hsl(var(--sidebar-border))" }}
      >
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-emerald-400">
          <ShieldCheck className="h-3 w-3" />
          Read-only
        </div>
        <p className="text-white/55">
          Cannot create, modify, or delete Azure resources.
        </p>
        <p className="pt-1 text-[10.5px] text-white/40">
          {BRAND.attribution} · v{BRAND.version}
        </p>
      </div>
    </aside>
  );
}
