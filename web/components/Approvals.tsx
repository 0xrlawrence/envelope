"use client";

export interface ApprovalStep {
  title: string;
  /** Shown only while this step is the one outstanding. */
  detail: string;
}

/**
 * What the wallet is about to ask for, while the envelope is in the air.
 *
 * The flight clears the page, which leaves someone watching a paper plane with
 * no idea that more than one wallet prompt is coming. The second is the
 * dangerous one: it looks like the wallet asking twice for the same signature,
 * and the natural reaction to that is to decline it.
 *
 * So the prompts are named and counted before any of them arrive, and only the
 * outstanding one is lit. Pinned below the flight path.
 *
 * `note` carries whatever the flow has to say mid-flight. On a seal that is the
 * route changing under it, which the page would otherwise report to a form that
 * has already slid off the screen.
 */
export function Approvals({
  title,
  amount,
  symbol,
  steps,
  step,
  settled,
  note = "",
}: {
  title: string;
  amount: string;
  symbol: string;
  steps: readonly ApprovalStep[];
  /** 1-based index of the outstanding prompt; past the end once submitted. */
  step: number;
  /** True once the flight has an answer and nothing further will be asked. */
  settled: boolean;
  note?: string;
}) {
  const count = steps.length;

  return (
    /*
     * Above the flight on a phone, below it on anything wider.
     *
     * The dart is thrown across the middle of the screen, and a tall narrow
     * viewport leaves very little room either side of it. Pinned to the bottom
     * the panel sat right where the dart glides, so the two competed; at the
     * top the whole lower two thirds of the screen is clear for the flight.
     * Offset to clear the header, which stays visible for the duration.
     */
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-[calc(5.6rem+env(safe-area-inset-top))] sm:top-auto sm:bottom-0 sm:px-6 sm:pt-0 sm:pb-[max(clamp(1rem,4vh,2.5rem),env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md border border-[var(--ink-line)] bg-[color-mix(in_srgb,var(--ink)_92%,transparent)] px-3 py-2.5 backdrop-blur-sm sm:px-5 sm:py-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="field-label !text-[0.65rem] sm:!text-xs">{title}</p>
          <p className="font-display text-xs font-bold tabular-nums sm:text-sm">
            {amount} <span className="text-[0.7rem] text-[var(--paper-dim)]">{symbol}</span>
          </p>
        </div>

        <p className="mt-1.5 text-[0.7rem] text-[var(--paper-dim)] sm:mt-2 sm:text-xs">
          {settled
            ? "Nothing further to approve."
            : count === 1
              ? "Your wallet will ask once."
              : count === 2
                ? "Your wallet will ask twice. Both are for this one envelope."
                : `Your wallet will ask ${count} times. They are all for this one envelope.`}
        </p>

        <ol className="mt-2 space-y-1.5 sm:mt-3 sm:space-y-2">
          {steps.map((item, index) => {
            const position = index + 1;
            const done = settled || step > position;
            const current = !settled && step === position;
            return (
              <li key={item.title} className="flex gap-2.5 sm:gap-3">
                <span
                  className="mt-px font-mono text-[0.7rem] tabular-nums sm:text-xs"
                  style={{ color: current ? "var(--frank)" : "var(--paper-faint)" }}
                >
                  {done ? "✓" : position}
                </span>
                <div className="min-w-0">
                  <p
                    className="text-xs leading-snug transition-colors duration-200 sm:text-sm sm:leading-normal"
                    style={{
                      color: current
                        ? "var(--frank)"
                        : done
                          ? "var(--paper-faint)"
                          : "var(--paper-dim)",
                    }}
                  >
                    {item.title}
                    {current ? ": approve it now" : null}
                  </p>
                  {current ? (
                    <p className="mt-0.5 text-[0.7rem] leading-snug text-[var(--paper-faint)] sm:text-xs">
                      {item.detail}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>

        {note && !settled ? (
          <p className="mt-2 border-t border-[var(--ink-line)] pt-2 text-[0.7rem] text-[var(--frank)] sm:mt-3 sm:pt-3 sm:text-xs">
            {note}
          </p>
        ) : null}

        {step > count && !settled && !note ? (
          <p className="mt-2 border-t border-[var(--ink-line)] pt-2 text-[0.7rem] text-[var(--paper-dim)] sm:mt-3 sm:pt-3 sm:text-xs">
            Signed. Waiting for the chain to confirm it, which is what the flight is
            waiting on too.
          </p>
        ) : null}
      </div>
    </div>
  );
}
