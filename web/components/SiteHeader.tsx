"use client";

import Link from "next/link";
import { useSound } from "@/lib/sound";
import { ConnectButton } from "./ConnectButton";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  const { play } = useSound();

  return (
    <header className="border-b border-[var(--ink-line)]">
      <div className="airmail-edge h-1.5" />
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-[clamp(0.6rem,1.7vh,1.15rem)] sm:gap-4 sm:px-6">
        <Link
          href="/"
          onClick={() => play("open")}
          className="group flex min-h-11 items-baseline gap-3 sm:min-h-0"
        >
          {/* The wordmark is set wide, and it is the letter-spacing rather than
              the type size that costs the room. Tightened on a phone so the nav
              beside it does not have to be hidden to fit, which is what used to
              happen: the only link to your own envelopes disappeared below the
              tablet breakpoint. Measured against a 320px screen, the narrowest
              still in use. */}
          <span className="font-display text-base font-bold tracking-[0.12em] uppercase sm:text-xl sm:tracking-[0.22em]">
            Envelope
          </span>
          <span className="hidden font-display text-xs font-semibold tracking-[0.2em] text-[var(--paper-faint)] uppercase transition-colors duration-150 group-hover:text-[var(--frank)] sm:inline">
            STRK20
          </span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-4">
          {/* Kept on a phone. It used to disappear below `sm`, which left the
              list of your own envelopes, and every claim link in it, with no
              route to it from anywhere on a mobile screen. */}
          <Link
            href="/sealed"
            onClick={() => play("open")}
            className="inline-flex min-h-11 items-center px-1 font-display text-[0.68rem] font-semibold tracking-[0.12em] text-[var(--paper-faint)] uppercase transition-colors duration-150 hover:text-[var(--frank)] sm:min-h-0 sm:px-0 sm:text-xs sm:tracking-[0.2em]"
          >
            Sealed
          </Link>
          <ThemeToggle />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
