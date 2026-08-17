"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSound } from "@/lib/sound";

const ITEMS = [
  {
    href: "/",
    label: "Seal",
    icon: (
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="m3.5 11.7 16-7-5.8 15.1-2.8-6.2-7.4-1.9Z" strokeLinejoin="round" />
        <path d="m10.9 13.6 8.6-8.9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/sealed",
    label: "Sealed",
    icon: (
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3.5 6.5h17v12h-17z" strokeLinejoin="round" />
        <path d="m4 7 8 6 8-6M8.5 4.5h7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
] as const;

/** Primary navigation in the phone's natural thumb zone. */
export function MobileNav() {
  const pathname = usePathname();
  const { play } = useSound();
  const path = pathname.replace(/\/+$/, "") || "/";

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--ink-line)] bg-[color-mix(in_srgb,var(--ink-deep)_94%,transparent)] backdrop-blur-xl sm:hidden"
    >
      <div className="airmail-edge h-0.5" />
      <div className="grid grid-cols-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.35rem,env(safe-area-inset-bottom))]">
        {ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? path === "/" || path.endsWith("/envelope")
              : path === item.href || path.endsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={() => play("open")}
              className="relative flex min-h-12 items-center justify-center gap-2 px-3 pt-1 font-display text-[0.68rem] font-semibold tracking-[0.16em] uppercase transition-[color,transform] duration-150 ease-out active:scale-[0.97]"
              style={{ color: active ? "var(--frank)" : "var(--paper-faint)" }}
            >
              <span className="h-[1.15rem] w-[1.15rem]">{item.icon}</span>
              <span>{item.label}</span>
              {active ? (
                <span className="absolute inset-x-5 top-0 h-px bg-[var(--frank)]" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
