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
      className="flex gap-6 border-b border-[var(--ink-line)]"
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
            className="-mb-px flex items-baseline gap-2 border-b-2 pt-1 pb-3 font-display text-sm font-semibold tracking-[0.14em] uppercase transition-colors duration-150 ease-out"
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
