"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface TocSection {
  id: string;
  title: string;
}

/**
 * Sticky table-of-contents for the handbook. Highlights the section
 * currently in view using an IntersectionObserver.
 */
export function HandbookTOC({ sections }: { sections: TocSection[] }) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the topmost intersecting section.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -66% 0px", threshold: 0 },
    );

    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label="Handbook sections" className="text-[12.5px]">
      <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        On this page
      </div>
      <ol className="space-y-1.5 border-l">
        {sections.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={cn(
                "-ml-px block border-l-2 py-1 pl-3 leading-snug transition-colors",
                activeId === s.id
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="mr-2 text-muted-foreground/60 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
