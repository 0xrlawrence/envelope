"use client";

import { useTheme } from "@/lib/theme";

/**
 * The theme control.
 *
 * An envelope held up to a light is the whole idea of this site, so the control
 * is that gesture: a lamp that is either behind the paper or not. It states the
 * theme it will switch to rather than the one you are in, because a control
 * that names the current state reads as a status light and gets clicked by
 * mistake.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${next} paper`}
      title={`Switch to ${next} paper`}
      className="group flex h-8 w-8 items-center justify-center border border-transparent transition-[border-color,color] duration-150 ease-out hover:border-[var(--ink-line)] active:scale-95"
      style={{ color: "var(--paper-faint)" }}
    >
      <svg
        viewBox="0 0 20 20"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="transition-colors duration-150 group-hover:text-[var(--frank)]"
      >
        {/* An envelope, lit from behind or not. */}
        <rect x="2.5" y="4.5" width="15" height="11" rx="0.5" />
        <path d="M2.5 5.5 L10 11 L17.5 5.5" />
        {theme === "dark" ? (
          /* Rays: clicking turns the lamp on. */
          <>
            <path d="M10 0.5v1.6M17.5 2.5l-1.1 1.1M2.5 2.5l1.1 1.1" opacity="0.9" />
          </>
        ) : (
          /* Filled flap: the light is on, clicking puts it out. */
          <path d="M2.5 5.5 L10 11 L17.5 5.5 Z" fill="currentColor" opacity="0.22" />
        )}
      </svg>
    </button>
  );
}
