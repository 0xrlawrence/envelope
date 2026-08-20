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
  expired = false,
  children,
}: {
  amount: string;
  symbol: string;
  caption?: string;
  addressee?: string;
  /** The funder's public reference, if they set one. */
  reference?: string;
  sealed?: boolean;
  /** The claim window shut with nobody opening it. */
  expired?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="sheet relative border border-[var(--ink-line)] bg-[var(--ink)]">
      <div className="airmail-edge h-1 sm:h-2" />

      {/* Every size here is a `min()` of a width term and the height term the
          card was built with. On a laptop the height term is the smaller of the
          two and nothing changes; on a phone, where there is height to spare
          and no width, the width term takes over and the card stops being the
          tallest thing between the reader and the form. */}
      <div className="security-tint relative px-2 py-1.5 sm:px-6 sm:pt-[clamp(0.7rem,min(3.6vw,3vh),1.9rem)] sm:pb-[clamp(0.65rem,min(3vw,2.4vh),1.6rem)]">
        {/* The flap, folded down over the top of the interior.
         *
         * The fill alone cannot carry this. It was doing the whole job before,
         * which worked on dark stock and disappeared on white, where the flap
         * and the paper under it are two shades of the same near-white. The
         * `border-bottom` that was meant to help never drew anything either:
         * the clip path cuts the box to a triangle, and the bottom edge of that
         * triangle is a single point.
         *
         * So the crease is stroked as a real line. The viewBox is unitless and
         * the aspect ratio is unconstrained, so the two edges meet the corners
         * whatever the card measures, and a non-scaling stroke keeps the line
         * one pixel rather than smearing with the box. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-14 sm:h-24"
          style={{
            clipPath: "polygon(0 0, 100% 0, 50% 100%)",
            background:
              "linear-gradient(175deg, var(--flap-from) 0%, var(--flap-to) 100%)",
          }}
        />
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 top-0 h-14 w-full sm:h-24"
        >
          <path
            d="M0 0 L50 100 L100 0"
            fill="none"
            stroke="var(--flap-edge)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className="relative">
          <p className="field-label">Contents</p>
          <p className="mt-0.5 font-display text-[1.35rem] leading-none font-bold tracking-[-0.03em] tabular-nums sm:mt-2 sm:text-[clamp(1.75rem,min(8vw,4.9vh),3.1rem)]">
            {amount}
            <span className="ml-2 align-baseline font-display text-xs font-semibold tracking-[0.16em] text-[var(--paper-dim)] sm:ml-3 sm:text-lg sm:tracking-[0.18em]">
              {symbol}
            </span>
          </p>
          {caption ? (
            <p className="mt-1 max-w-sm text-[0.62rem] leading-[1.25] text-[var(--paper-dim)] sm:mt-2 sm:text-sm sm:leading-normal">{caption}</p>
          ) : null}
          {children}
        </div>

        {/* The address block. On a real envelope this is the only part anyone
            reads, and here it is the whole point: it is addressed to no one. */}
        <div className="relative mt-1.5 flex items-end justify-between gap-2 border-t border-dashed border-[var(--ink-line)] pt-1.5 sm:mt-[clamp(0.6rem,min(3vw,2.6vh),1.5rem)] sm:gap-6 sm:pt-[clamp(0.45rem,1.2vh,0.8rem)]">
          <div className="min-w-0">
            <p className="field-label">Addressed to</p>
            <p className="mt-0.5 font-display text-[0.8rem] font-semibold tracking-[0.04em] uppercase sm:mt-1.5 sm:text-[clamp(0.95rem,min(4.4vw,2.2vh),1.25rem)]">
              {addressee}
            </p>
            {reference ? (
              <p className="mt-1 truncate font-mono text-[0.65rem] text-[var(--paper-faint)] sm:mt-3 sm:text-xs">
                Ref. {reference}
              </p>
            ) : null}
          </div>

          {sealed && !expired ? (
            <div
              /* The wording is sized off the same expression as the disc it is
                 struck inside. Left at a fixed 0.7rem it stayed put while the
                 disc shrank on a phone, and "Sealed" ended up wider than the
                 ring around it. */
              className="animate-strike flex h-[clamp(2.5rem,min(11vw,5.6vh),4rem)] w-[clamp(2.5rem,min(11vw,5.6vh),4rem)] shrink-0 -rotate-[9deg] items-center justify-center rounded-full border-[3px] font-display text-[clamp(0.52rem,min(2.3vw,1.16vh),0.7rem)] leading-tight font-bold tracking-[0.12em] uppercase"
              style={{ borderColor: "var(--seal)", color: "var(--seal)" }}
            >
              <span className="text-center">
                Sealed
                <br />
                <span className="text-[0.78em] tracking-[0.2em] opacity-70">STRK20</span>
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Struck across the whole thing, twice, corner to corner.
       *
       * A rubber stamp is put on a document to stop it being acted on, and it
       * is deliberately not tidy about it: it covers the contents, because the
       * contents no longer matter. The two bands are translucent so the amount
       * stays readable underneath, which is the one detail still worth reading
       * on an envelope nobody can open. */}
      {expired ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
          {[-1, 1].map((lean) => (
            <div
              key={lean}
              className="absolute top-1/2 left-1/2 w-[240%] border-y-[3px] py-2"
              style={{
                transform: `translate(-50%, -50%) rotate(${lean * 30}deg)`,
                borderColor: "color-mix(in srgb, var(--seal) 82%, transparent)",
                background: "color-mix(in srgb, var(--seal) 14%, transparent)",
              }}
            >
              <p
                className="font-display text-center text-[clamp(1.15rem,3.6vh,1.9rem)] font-bold tracking-[0.2em] whitespace-nowrap uppercase"
                style={{ color: "var(--seal)" }}
              >
                {"Expired ".repeat(16)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
