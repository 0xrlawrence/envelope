"use client";

import type { ReactNode } from "react";

/**
 * The envelope itself.
 *
 * The interior is printed with the security tint, the hatching that exists on
 * real envelopes so the contents cannot be read through the paper. It is the
 * one honest visual metaphor available here: the thing is opaque by
 * construction, and what is written on the outside stays readable.
 */
export function EnvelopeCard({
  amount,
  symbol,
  caption,
  addressee = "Bearer",
  reference,
  sealed = false,
  children,
}: {
  amount: string;
  symbol: string;
  caption?: string;
  addressee?: string;
  /** The funder's public reference, if they set one. */
  reference?: string;
  sealed?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="relative border border-[var(--ink-line)] bg-[var(--ink)]">
      <div className="airmail-edge h-2" />

      <div className="security-tint relative px-7 pt-9 pb-7">
        {/* The flap seam, folded down over the top of the interior. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-28"
          style={{
            clipPath: "polygon(0 0, 100% 0, 50% 100%)",
            background:
              "linear-gradient(175deg, var(--ink-raised) 0%, color-mix(in srgb, var(--ink) 88%, transparent) 100%)",
            borderBottom: "1px solid var(--ink-line)",
          }}
        />

        <div className="relative">
          <p className="field-label">Contents</p>
          <p className="mt-2 font-display text-6xl leading-none font-bold tracking-[-0.03em] tabular-nums">
            {amount}
            <span className="ml-3 align-baseline font-display text-lg font-semibold tracking-[0.18em] text-[var(--paper-dim)]">
              {symbol}
            </span>
          </p>
          {caption ? (
            <p className="mt-3 max-w-sm text-sm text-[var(--paper-dim)]">{caption}</p>
          ) : null}
          {children}
        </div>

        {/* The address block. On a real envelope this is the only part anyone
            reads, and here it is the whole point: it is addressed to no one. */}
        <div className="relative mt-10 flex items-end justify-between gap-6 border-t border-dashed border-[var(--ink-line)] pt-5">
          <div className="min-w-0">
            <p className="field-label">Addressed to</p>
            <p className="mt-1.5 font-display text-2xl font-semibold tracking-[0.04em] uppercase">
              {addressee}
            </p>
            {reference ? (
              <p className="mt-3 truncate font-mono text-xs text-[var(--paper-faint)]">
                Ref. {reference}
              </p>
            ) : null}
          </div>

          {sealed ? (
            <div
              className="animate-strike flex h-24 w-24 shrink-0 -rotate-[9deg] items-center justify-center rounded-full border-[3px] font-display text-[0.7rem] leading-tight font-bold tracking-[0.12em] uppercase"
              style={{ borderColor: "var(--seal)", color: "var(--seal)" }}
            >
              <span className="text-center">
                Sealed
                <br />
                <span className="text-[0.55rem] tracking-[0.2em] opacity-70">STRK20</span>
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
