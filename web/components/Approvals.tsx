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
    <div className="pad-safe-b pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[clamp(0.75rem,4vh,2.5rem)] sm:px-6">
      <div className="w-full max-w-md border border-[var(--ink-line)] bg-[color-mix(in_srgb,var(--ink)_92%,transparent)] px-4 py-3.5 backdrop-blur-sm sm:px-5 sm:py-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="field-label">{title}</p>
          <p className="font-display text-sm font-bold tabular-nums">
            {amount} <span className="text-xs text-[var(--paper-dim)]">{symbol}</span>
          </p>
        </div>

        <p className="mt-2 text-xs text-[var(--paper-dim)]">
          {settled
            ? "Nothing further to approve."
            : count === 1
              ? "Your wallet will ask once."
              : count === 2
                ? "Your wallet will ask twice. Both are for this one envelope."
                : `Your wallet will ask ${count} times. They are all for this one envelope.`}
        </p>

        <ol className="mt-3 space-y-2">
          {steps.map((item, index) => {
            const position = index + 1;
            const done = settled || step > position;
            const current = !settled && step === position;
            return (
              <li key={item.title} className="flex gap-3">
                <span
                  className="mt-px font-mono text-xs tabular-nums"
                  style={{ color: current ? "var(--frank)" : "var(--paper-faint)" }}
                >
                  {done ? "✓" : position}
                </span>
                <div className="min-w-0">
                  <p
                    className="text-sm transition-colors duration-200"
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
                    <p className="mt-0.5 text-xs text-[var(--paper-faint)]">{item.detail}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>

        {note && !settled ? (
          <p className="mt-3 border-t border-[var(--ink-line)] pt-3 text-xs text-[var(--frank)]">
            {note}
          </p>
        ) : null}

        {step > count && !settled && !note ? (
          <p className="mt-3 border-t border-[var(--ink-line)] pt-3 text-xs text-[var(--paper-dim)]">
            Signed. Waiting for the chain to confirm it, which is what the flight is
            waiting on too.
          </p>
        ) : null}
      </div>
    </div>
  );
}
