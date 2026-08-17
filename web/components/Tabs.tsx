"use client";

import { useRef } from "react";

export interface TabDefinition {
  id: string;
  label: string;
  /** Shown beside the label when there is something to count. */
  count?: number;
}

/**
 * Two views of the same subject, one at a time.
 *
 * Built to the tab pattern rather than as two styled buttons, because the two
 * differ in what a keyboard does with them. Arrow keys move between tabs and
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
      /* Equal columns on a phone, where long labels can wrap and content-width
         tabs leave the last one hanging in the middle of the rule. Back to
         natural widths once there is room for the whole set. */
      className="grid border-b border-[var(--ink-line)] sm:flex sm:gap-6"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
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
            className="-mb-px flex min-h-11 items-baseline justify-center gap-2 border-b-2 pt-1 pb-3 font-display text-xs font-semibold tracking-[0.1em] uppercase transition-[color,transform] duration-150 ease-out active:scale-[0.98] sm:min-h-0 sm:justify-start sm:text-sm sm:tracking-[0.14em]"
            style={{
              borderColor: selected ? "var(--frank)" : "transparent",
              color: selected ? "var(--frank)" : "var(--paper-faint)",
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
