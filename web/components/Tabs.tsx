"use client";

import { useRef } from "react";

export interface TabDefinition {
  id: string;
  label: string;
  /** Shown beside the label when there is something to count. */
  count?: number;
  /** Semantic stamp colour. The active tab uses the full pigment. */
  tone?: "frank" | "send" | "seal" | "credit";
}

/**
 * Multiple views of the same subject, one at a time.
 *
 * Built to the tab pattern rather than as styled buttons, because tabs differ
 * in what a keyboard does with them. Arrow keys move between tabs and
 * only the selected one is in the tab order, so reaching the panel takes one
 * press rather than one press per tab.
 */
export function Tabs({
  tabs,
  active,
  onSelect,
  label,
}: {
  tabs: readonly TabDefinition[];
  active: string;
  onSelect: (id: string) => void;
  label: string;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollable = tabs.length > 2;

  const move = (delta: number) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    const next = tabs[(index + delta + tabs.length) % tabs.length]!;
    onSelect(next.id);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)
      ?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      /* Two tabs divide the phone width evenly. Larger sets keep natural-width
         labels and scroll as one row rather than compressing into unreadable
         quarter-width columns. */
      className={
        scrollable
          ? "flex gap-1.5 overflow-x-auto pb-1 sm:gap-2"
          : "grid gap-1.5 sm:flex sm:gap-2"
      }
      style={
        scrollable
          ? undefined
          : { gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }
      }
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          move(1);
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        const pigment =
          tab.tone === "send"
            ? "var(--send)"
            : tab.tone === "seal"
              ? "var(--seal)"
              : tab.tone === "credit"
                ? "var(--credit)"
                : "var(--frank)";
        return (
          <button
            key={tab.id}
            data-tab={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            className={`flex min-h-11 items-center gap-2 border px-2.5 py-2 font-mono text-[0.68rem] tracking-[0.18em] uppercase transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98] sm:min-h-9 sm:justify-start sm:px-3 sm:text-xs sm:tracking-[0.2em] ${
              scrollable ? "shrink-0 justify-start" : "justify-center"
            }`}
            style={{
              borderColor: selected
                ? pigment
                : `color-mix(in srgb, ${pigment} 32%, var(--ink-line))`,
              backgroundColor: selected
                ? pigment
                : `color-mix(in srgb, ${pigment} 8%, var(--ink-raised))`,
              color: selected ? "var(--ink-deep)" : pigment,
            }}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span className="font-mono text-xs tracking-normal">{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
