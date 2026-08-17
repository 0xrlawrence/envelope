"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useSound, type SoundCue } from "@/lib/sound";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="field-label">{children}</p>;
}

/**
 * A labelled row, set like a line on a declaration form: the label in stamped
 * mono small-caps, the value on a dotted rule beside it.
 */
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="grid gap-1 border-b border-dotted border-[var(--ink-line)] py-1.5 sm:grid-cols-[11rem_1fr] sm:items-baseline sm:gap-6 sm:py-[clamp(0.4rem,1.55vh,0.9rem)]">
      <div>
        <Eyebrow>{label}</Eyebrow>
        {hint ? <p className="mt-0.5 text-[0.62rem] leading-tight text-[var(--paper-faint)] sm:mt-1 sm:text-xs sm:leading-normal">{hint}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Mono({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`font-mono text-sm break-all text-[var(--paper)] ${className}`}>
      {children}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "frank" | "outline" | "quiet";
  sound?: SoundCue | false;
};

/*
 * `min-h-11` is 44px, the smallest target a thumb hits reliably. The padding is
 * viewport-height based, so on a short phone it collapses to about eight pixels
 * and every button on the site came out at 37 or 38: fine under a cursor, a
 * miss under a thumb. The floor only applies below the tablet breakpoint, so
 * nothing on a laptop changes size.
 */
const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2 font-display text-sm font-semibold uppercase tracking-[0.12em] transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 sm:min-h-0 sm:px-5 sm:py-[clamp(0.5rem,1.5vh,0.75rem)] sm:tracking-[0.14em]";

const BUTTON_VARIANTS = {
  frank:
    "bg-[var(--frank)] text-[var(--ink-deep)] hover:bg-[var(--frank-deep)] hover:text-[var(--paper)] disabled:bg-transparent disabled:text-[var(--paper-faint)] disabled:ring-1 disabled:ring-[var(--ink-line)] disabled:ring-inset",
  outline:
    "border border-[var(--ink-line)] text-[var(--paper)] hover:border-[var(--frank)] hover:text-[var(--frank)] disabled:text-[var(--paper-faint)] disabled:hover:border-[var(--ink-line)]",
  quiet: "text-[var(--paper-faint)] hover:text-[var(--paper)]",
} as const;

export function Button({
  variant = "frank",
  className = "",
  sound = "tap",
  onClick,
  disabled,
  ...props
}: ButtonProps) {
  const { play } = useSound();

  return (
    <button
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`}
      disabled={disabled}
      onClick={(event) => {
        if (!disabled && sound) play(sound);
        onClick?.(event);
      }}
      {...props}
    />
  );
}

/**
 * A button that navigates.
 *
 * Routed through `next/link` rather than a bare anchor, because the site is
 * served from a sub-path on Pages and a hand-written href would drop it.
 */
export function LinkButton({
  href,
  variant = "outline",
  className = "",
  children,
}: {
  href: string;
  variant?: keyof typeof BUTTON_VARIANTS;
  className?: string;
  children: ReactNode;
}) {
  const { play } = useSound();

  return (
    <Link
      href={href}
      onClick={() => play("tap")}
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Callout({
  tone = "note",
  title,
  children,
}: {
  tone?: "note" | "warn" | "bad";
  title?: string;
  children: ReactNode;
}) {
  const edge = {
    note: "border-l-[var(--airmail-blue)]",
    warn: "border-l-[var(--frank)]",
    bad: "border-l-[var(--seal)]",
  }[tone];

  return (
    <div className={`border-l ${edge} bg-[var(--ink-raised)] px-2.5 py-1.5 text-[0.7rem] leading-snug sm:px-4 sm:py-[clamp(0.45rem,1.4vh,0.75rem)] sm:text-sm sm:leading-normal`}>
      {title ? (
        <p className="field-label mb-1 !text-[var(--paper-dim)]">{title}</p>
      ) : null}
      <div className="text-[var(--paper-dim)] [&_a]:text-[var(--frank)] [&_a]:underline">
        {children}
      </div>
    </div>
  );
}

/** A struck rubber stamp. Used once per screen, on the thing that just happened. */
export function Stamp({ children, tone = "frank" }: { children: ReactNode; tone?: "frank" | "seal" }) {
  const colour = tone === "seal" ? "var(--seal)" : "var(--frank)";
  return (
    <div
      className="animate-strike inline-flex items-center border-[3px] px-3 py-1 font-display text-base font-bold uppercase tracking-[0.18em] sm:border-4 sm:px-4 sm:py-1.5 sm:text-lg sm:tracking-[0.2em]"
      style={{ borderColor: colour, color: colour, opacity: 0.9 }}
    >
      {children}
    </div>
  );
}

export function ExplorerLink({
  explorer,
  kind,
  value,
  children,
}: {
  explorer: string;
  kind: "tx" | "contract";
  value: string;
  children: ReactNode;
}) {
  return (
    <a
      /* Vertical padding on an inline element paints outside the line box
         without pushing the line apart, so the hash keeps its place in the row
         and still has something bigger than 20px to aim a thumb at. */
      className="py-2 font-mono text-xs text-[var(--frank)] underline decoration-dotted underline-offset-4 break-all sm:py-0 sm:text-sm"
      href={`${explorer}/${kind}/${value}`}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}
