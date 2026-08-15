"use client";

import { useTheme } from "@/lib/theme";
import { useSound } from "@/lib/sound";

/**
 * The theme control.
 *
 * Both icons are mounted and stacked, and the switch is a cross-fade with a
 * quarter turn and a scale: the outgoing one shrinks and rotates away while the
 * incoming one arrives upright. Swapping the element instead would pop, and
 * there would be nothing to animate between.
 *
 * Deliberately slower than the wipe it triggers. The paper is what the eye is
 * following, so the icon settles after it rather than competing with it.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { play } = useSound();
  const dark = theme === "dark";
  const next = dark ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => {
        play("tap");
        toggle();
      }}
      aria-label={`Switch to ${next} paper`}
      title={`Switch to ${next} paper`}
      className="relative flex h-8 w-8 items-center justify-center text-[var(--paper-faint)] transition-colors duration-150 hover:text-[var(--frank)]"
    >
      {/* Sun: shown on dark paper, because it is what the press does next. */}
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className={`absolute h-4 w-4 transition-all duration-500 ${
          dark ? "scale-100 rotate-0 opacity-100" : "scale-50 rotate-90 opacity-0"
        }`}
      >
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.2v2.4M12 19.4v2.4M2.2 12h2.4M19.4 12h2.4M5.1 5.1l1.7 1.7M17.2 17.2l1.7 1.7M18.9 5.1l-1.7 1.7M6.8 17.2l-1.7 1.7" />
      </svg>

      {/* Moon: shown on light paper. */}
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`absolute h-4 w-4 transition-all duration-500 ${
          dark ? "scale-50 -rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"
        }`}
      >
        <path d="M20.5 14.4A8.5 8.5 0 1 1 9.6 3.5a6.6 6.6 0 0 0 10.9 10.9Z" />
      </svg>
    </button>
  );
}
