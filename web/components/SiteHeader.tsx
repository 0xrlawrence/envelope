"use client";

import Link from "next/link";
import { ConnectButton } from "./ConnectButton";
import { SoundControl } from "./SoundControl";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  return (
    <header className="border-b border-[var(--ink-line)]">
      <div className="airmail-edge h-1.5" />
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-[clamp(0.6rem,1.7vh,1.15rem)] sm:gap-4 sm:px-6">
        <Link href="/" className="group flex items-baseline gap-3">
          <span className="font-display text-xl font-bold tracking-[0.22em] uppercase">
            Envelope
          </span>
          <span className="hidden font-display text-xs font-semibold tracking-[0.2em] text-[var(--paper-faint)] uppercase transition-colors duration-150 group-hover:text-[var(--frank)] sm:inline">
            STRK20
          </span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/sealed"
            className="hidden font-display text-xs font-semibold tracking-[0.2em] text-[var(--paper-faint)] uppercase transition-colors duration-150 hover:text-[var(--frank)] sm:inline"
          >
            Sealed
          </Link>
          <SoundControl />
          <ThemeToggle />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
