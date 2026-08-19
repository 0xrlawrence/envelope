"use client";

import { useState } from "react";
import { highlight, type Language, type TokenKind } from "@/lib/highlight";
import { useSound } from "@/lib/sound";

/** Each token role reads from the palette rather than from a stock theme. */
const INK: Record<TokenKind, string> = {
  plain: "var(--paper)",
  comment: "var(--code-comment)",
  string: "var(--code-string)",
  number: "var(--code-number)",
  keyword: "var(--code-keyword)",
  flag: "var(--code-flag)",
  command: "var(--code-command)",
  property: "var(--code-property)",
  punctuation: "var(--code-punct)",
};

/**
 * A block of shell or JSON, with the whole thing on the clipboard.
 *
 * Everything on the agent page is meant to be run rather than read, and the
 * commands carry addresses and flags that are miserable to retype and easy to
 * mistype. So the copy control is part of the block, not an afterthought
 * hanging beside it.
 */
export function Snippet({
  children,
  label,
  language = "shell",
}: {
  children: string;
  label?: string;
  language?: Language;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const { play } = useSound();

  return (
    <div className="mt-2 border border-[var(--ink-line)] bg-[var(--ink-raised)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--ink-line)] px-3 py-1.5">
        <span className="font-display text-[0.6rem] font-semibold tracking-[0.18em] text-[var(--paper-faint)] uppercase">
          {label ?? (language === "shell" ? "Terminal" : "Output")}
        </span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(children);
              play("copy");
              setState("copied");
            } catch {
              play("error");
              setState("failed");
            }
            window.setTimeout(() => setState("idle"), 1400);
          }}
          className="-my-2 -mr-1 inline-flex min-h-11 items-center px-1 font-display text-[0.6rem] font-semibold tracking-[0.18em] uppercase transition-colors duration-150 sm:my-0 sm:mr-0 sm:min-h-0"
          style={{ color: state === "idle" ? "var(--paper-dim)" : "var(--frank)" }}
          aria-live="polite"
        >
          {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
        </button>
      </div>
      {/* Scrolls inside itself. A long command has to be able to be long
          without the page it sits on sliding sideways under a thumb. */}
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[0.72rem] leading-relaxed sm:text-xs">
        <code>
          {highlight(children, language).map((token, index) => (
            // Index keys are safe here: the list is derived from a constant
            // string and never reorders.
            <span key={index} style={{ color: INK[token.kind] }}>
              {token.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
