import Link from "next/link";
import { VARIANTS } from "./variants";

const SWATCHES: Record<number, string[]> = {
  1: ["#c0a67f", "#241a10", "#a5301f"],
  2: ["#07090b", "#ffb020", "#4ad07f"],
  3: ["#f2ece0", "#14213d", "#b3372c"],
  4: ["#f4f5ee", "#101410", "#1d5c3a"],
  5: ["#0a2a6b", "#f5f1e6", "#ff4438"],
  6: ["#eceae5", "#0b0b0c", "#ff5c00"],
  7: ["#e6d9ba", "#6d1526", "#9a7420"],
  8: ["#f2eee1", "#ff3d7f", "#2f3fe0"],
  9: ["#0b2b4a", "#6fd3ff", "#ffd166"],
  10: ["#0b302d", "#d7a93c", "#e06a4e"],
};

export default function Index() {
  return (
    <div className="mx-auto w-full max-w-[68rem] px-4 py-12 pb-28 sm:px-8">
      <h1 className="headline">Ten redesigns.</h1>
      <p className="mt-3 max-w-[62ch] text-[var(--paper-dim)]">
        Ten different objects, not ten arrangements of the same one. Each has its own
        stock, its own inks and its own three typefaces. What every one of them keeps is
        the DNA: the airmail chevron along the top edge and the bottom edge, the wordmark,
        the security tint printed inside whatever holds the money, a franked stamp, and
        the product&rsquo;s own words.
      </p>
      <div className="mt-8 grid gap-3">
        {VARIANTS.map((variant) => (
          <Link
            key={variant.n}
            href={`/design-preview/${variant.n}`}
            className="group flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-[var(--ink-line)] py-4 transition-colors duration-150 hover:border-[var(--frank)]"
          >
            <span className="font-mono text-sm text-[var(--frank)] tabular-nums">{String(variant.n).padStart(2, "0")}</span>
            <span className="flex gap-1 self-center">
              {SWATCHES[variant.n].map((hex) => (
                <span key={hex} className="h-4 w-4 border border-[var(--ink-line)]" style={{ background: hex }} />
              ))}
            </span>
            <span className="font-display text-xl font-bold tracking-[-0.01em] transition-colors group-hover:text-[var(--frank)]">
              {variant.name}
            </span>
            <span className="flex-1 text-sm text-[var(--paper-dim)]">{variant.note}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
