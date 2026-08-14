"use client";

import Link from "next/link";
import { ConnectButton } from "./ConnectButton";

export function SiteHeader() {
  return (
    <header className="border-b border-[var(--ink-line)]">
      <div className="airmail-edge h-1.5" />
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-[clamp(0.6rem,1.7vh,1.15rem)]">
        <Link href="/" className="group flex items-baseline gap-3">
          <span className="font-display text-xl font-bold tracking-[0.22em] uppercase">
            Envelope
          </span>
          <span className="hidden font-display text-xs font-semibold tracking-[0.2em] text-[var(--paper-faint)] uppercase transition-colors duration-150 group-hover:text-[var(--frank)] sm:inline">
            STRK20
          </span>
        </Link>
        <div className="flex items-center gap-5">
          <Link
            href="/sealed"
            className="font-display text-xs font-semibold tracking-[0.2em] text-[var(--paper-faint)] uppercase transition-colors duration-150 hover:text-[var(--frank)]"
          >
            Sealed
          </Link>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
