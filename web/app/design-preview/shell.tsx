"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { VARIANTS } from "./variants";

/**
 * The switcher floats over the bottom of the page rather than sitting above
 * it. A bar across the top would put a strip of chrome where every one of
 * these worlds prints its airmail edge, and the edge is the thing being
 * judged. This is a viewing tool, so it is deliberately styled as nothing.
 */
export function VariantBar() {
  const path = usePathname();
  const current = Number(path.split("/").filter(Boolean).pop());

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl border border-white/15 bg-black/80 px-1.5 py-1.5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)] backdrop-blur-md">
        <Link
          href="/design-preview"
          className="shrink-0 rounded-full px-3 py-1.5 font-mono text-[0.6rem] tracking-[0.2em] text-white/55 uppercase hover:text-white"
        >
          Index
        </Link>
        {VARIANTS.map((variant) => {
          const on = variant.n === current;
          return (
            <Link
              key={variant.n}
              href={`/design-preview/${variant.n}`}
              className="shrink-0 rounded-full px-3 py-1.5 font-mono text-[0.6rem] tracking-[0.14em] whitespace-nowrap uppercase transition-colors duration-150"
              style={{
                background: on ? "#ffffff" : "transparent",
                color: on ? "#0a0a0a" : "rgba(255,255,255,0.6)",
              }}
            >
              {variant.n}. {variant.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
