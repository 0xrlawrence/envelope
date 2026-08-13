"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

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
    <div className="grid gap-2 border-b border-dotted border-[var(--ink-line)] py-4 sm:grid-cols-[11rem_1fr] sm:items-baseline sm:gap-6">
      <div>
        <Eyebrow>{label}</Eyebrow>
        {hint ? <p className="mt-1 text-xs text-[var(--paper-faint)]">{hint}</p> : null}
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
};

export function Button({ variant = "frank", className = "", ...props }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 px-5 py-3 font-display text-sm font-semibold uppercase tracking-[0.14em] transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100";

  const variants = {
    frank:
      "bg-[var(--frank)] text-[var(--ink-deep)] hover:bg-[var(--frank-deep)] hover:text-[var(--paper)]",
    outline:
      "border border-[var(--ink-line)] text-[var(--paper)] hover:border-[var(--frank)] hover:text-[var(--frank)]",
    quiet: "text-[var(--paper-faint)] hover:text-[var(--paper)]",
  } as const;

  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
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
    <div className={`border-l ${edge} bg-[var(--ink-raised)] px-4 py-3 text-sm`}>
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
      className="animate-strike inline-flex items-center border-4 px-4 py-1.5 font-display text-lg font-bold uppercase tracking-[0.2em]"
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
      className="font-mono text-sm text-[var(--frank)] underline decoration-dotted underline-offset-4 break-all"
      href={`${explorer}/${kind}/${value}`}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}
