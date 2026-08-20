"use client";

import Link from "next/link";
import { useSound } from "@/lib/sound";
import { ConnectButton } from "./ConnectButton";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  const { play } = useSound();

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--ink-line)] bg-[color-mix(in_srgb,var(--ink-deep)_94%,transparent)] backdrop-blur-xl sm:static sm:bg-transparent sm:backdrop-blur-none">
      <div className="airmail-edge h-1 sm:h-1.5" />
      {/*
        * Two groups, not four things in a row.
        *
        * The nav link used to sit on the right, between the wordmark and the
        * wallet, which left it belonging to neither: a word floating in the
        * middle of the bar with a gap on both sides and nothing lining up.
        * Identity and navigation go together on the left, and the two controls
        * that act on your session go together on the right.
        */}
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-1 sm:gap-3 sm:px-6 sm:py-[clamp(0.5rem,1.7vh,1.15rem)]">
        <div className="flex items-baseline gap-2.5 sm:gap-6">
          {/* Padded rather than sized, so both links keep a thumb-sized hit
              area without the bar growing around them. */}
          <Link
            href="/"
            onClick={() => play("open")}
            className="group flex items-baseline gap-2.5 py-2 sm:py-0"
          >
            {/* The wordmark is set wide, and it is the letter-spacing rather
                than the type size that costs the room. Tightened on a phone so
                the nav beside it does not have to be hidden to fit, which is
                what used to happen: the only link to your own envelopes
                disappeared below the tablet breakpoint. Measured against a
                320px screen, the narrowest still in use. */}
            <span className="font-display text-sm font-bold tracking-[0.16em] uppercase sm:text-lg sm:tracking-[0.36em]">
              Envelope
            </span>
            <span className="hidden font-mono text-[0.65rem] tracking-[0.24em] text-[var(--paper-faint)] uppercase transition-colors duration-150 group-hover:text-[var(--frank)] sm:inline">
              STRK20
            </span>
          </Link>

          {/* Both nav links are keys rather than words. They are the only two
              places to go from here, and set as bare tracked caps they read as
              a caption and get looked past, which is worse now that the header
              sits on the crumpled stock rather than on a flat bar. Unfilled on
              the paper, struck in the stamp colour when the pointer is on them,
              which is the same vocabulary the choices on the form speak. */}
          <Link
            href="/sealed"
            onClick={() => play("open")}
            className="hidden border border-[var(--ink-line)] bg-[var(--ink-raised)] px-2.5 py-1.5 font-mono text-[0.65rem] tracking-[0.2em] whitespace-nowrap text-[var(--frank)] uppercase transition-[background-color,border-color,color] duration-150 hover:border-[var(--frank)] hover:bg-[var(--frank)] hover:text-[var(--ink-deep)] sm:block sm:tracking-[0.24em]"
          >
            Sealed
          </Link>

          <Link
            href="/agent"
            onClick={() => play("open")}
            className="hidden border border-[var(--ink-line)] bg-[var(--ink-raised)] px-2.5 py-1.5 font-mono text-[0.65rem] tracking-[0.2em] whitespace-nowrap text-[var(--frank)] uppercase transition-[background-color,border-color,color] duration-150 hover:border-[var(--frank)] hover:bg-[var(--frank)] hover:text-[var(--ink-deep)] sm:block sm:tracking-[0.24em]"
          >
            Agent
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-3">
          <ThemeToggle />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
