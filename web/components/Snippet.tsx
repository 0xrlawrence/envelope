"use client";

import { useState } from "react";
import { useSound } from "@/lib/sound";

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
  tone = "shell",
}: {
  children: string;
  label?: string;
  tone?: "shell" | "output";
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const { play } = useSound();

  return (
    <div className="mt-2 border border-[var(--ink-line)] bg-[var(--ink-raised)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--ink-line)] px-3 py-1.5">
        <span className="font-display text-[0.6rem] font-semibold tracking-[0.18em] text-[var(--paper-faint)] uppercase">
          {label ?? (tone === "shell" ? "Terminal" : "Output")}
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
        <code
          style={{
            color: tone === "shell" ? "var(--paper)" : "var(--paper-dim)",
          }}
        >
          {children}
        </code>
      </pre>
    </div>
  );
}
