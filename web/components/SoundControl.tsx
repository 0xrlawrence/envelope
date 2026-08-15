"use client";

import { useSound } from "@/lib/sound";

export function SoundControl() {
  const { enabled, toggle } = useSound();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? "Sound on" : "Sound off"}
      title={enabled ? "Mute interface sounds" : "Enable interface sounds"}
      className="group inline-flex min-h-9 items-center gap-2 border border-[var(--ink-line)] px-2 font-display text-[0.65rem] font-semibold tracking-[0.16em] uppercase transition-[border-color,color,background-color,transform] duration-150 active:scale-[0.97] sm:px-3"
      style={{
        color: enabled ? "var(--paper-dim)" : "var(--paper-faint)",
        background: enabled ? "var(--ink-raised)" : "transparent",
      }}
    >
      <span className="sm:hidden">SFX</span>
      <span className="hidden sm:inline">Sound</span>
      <span
        className="hidden font-mono tracking-normal sm:inline"
        style={{ color: enabled ? "var(--frank)" : undefined }}
      >
        {enabled ? "on" : "off"}
      </span>
    </button>
  );
}
