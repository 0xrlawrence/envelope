"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Callout } from "@/components/ui";
import { DENOMINATIONS, STRK, formatAmount, toSmallestUnit } from "@/lib/config";

/**
 * Move STRK into the pool without leaving the page.
 *
 * This is deliberately an offer rather than a gate. Sealing already deposits
 * and funds in one transaction when there is nothing shielded to spend, so
 * nobody is blocked on doing this first, and a modal that implied otherwise
 * would be inventing a step the app does not have.
 *
 * What it buys is separation. Funding straight from the wallet puts the
 * deposit in the same transaction as the envelope, which means the moment
 * value leaves an address and the moment an envelope appears are the same
 * moment, for the same amount. Shielding beforehand splits those two facts
 * apart, and how far apart is up to whoever is shielding.
 */
export function ShieldModal({
  open,
  publicBalance,
  deployed,
  busy,
  error,
  onShield,
  onDismiss,
}: {
  open: boolean;
  publicBalance: bigint | null;
  /** False when the account contract is not on-chain yet. */
  deployed: boolean;
  busy: boolean;
  error: string;
  onShield: (amount: bigint) => void;
  onDismiss: () => void;
}) {
  const [choice, setChoice] = useState(DENOMINATIONS[2]!);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Escape closes it. A modal that can only be dismissed by finding its button
  // is a modal that traps someone who only wanted to look at the page.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onDismiss();
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onDismiss]);

  // Open on something this wallet can actually afford. Defaulting to a fixed
  // amount leaves a smaller wallet looking at a disabled button that still
  // names a figure it cannot pay, and no indication of what to do about it.
  useEffect(() => {
    if (!open || publicBalance === null) return;
    setChoice((current) => {
      if (toSmallestUnit(current) <= publicBalance) return current;
      const affordable = DENOMINATIONS.filter(
        (value) => toSmallestUnit(value) <= publicBalance,
      );
      return affordable.length ? affordable[affordable.length - 1]! : current;
    });
  }, [open, publicBalance]);

  if (!open) return null;

  const affordable = DENOMINATIONS.filter(
    (value) => publicBalance !== null && toSmallestUnit(value) <= publicBalance,
  );
  const canShield = affordable.some((value) => value === choice) && deployed;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6">
      <button
        aria-label="Close"
        onClick={() => !busy && onDismiss()}
        className="absolute inset-0 cursor-default bg-[color-mix(in_srgb,var(--ink-deep)_78%,transparent)] backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shield STRK"
        tabIndex={-1}
        className="relative w-full max-w-md border border-[var(--ink-line)] bg-[var(--ink)] outline-none"
      >
        <div className="airmail-edge h-1.5" />
        <div className="security-tint px-6 py-5">
          <p className="field-label">Nothing shielded yet</p>
          <h2 className="mt-2 font-display text-2xl leading-tight font-bold tracking-[-0.02em]">
            Shield first, and the envelope stands on its own.
          </h2>

          <p className="mt-3 text-sm text-[var(--paper-dim)]">
            You do not have to. Sealing with an empty pool balance deposits and funds in
            one transaction, and it works. But that puts the money leaving your address
            and the envelope appearing in the same transaction, for the same amount.
            Shielding now separates them, and by as long as you like.
          </p>

          {/* An account the wallet has created but never sent from does not
              exist on-chain, and the pool authenticates against the account's
              own storage. Ready reports that as "failed to authenticate with
              the privacy backend", which names the symptom rather than the
              cause, so it is worth saying before the attempt rather than
              translating it afterwards. */}
          {!deployed ? (
            <div className="mt-4">
              <Callout tone="warn" title="This account is not on-chain yet">
                Wallets let you create and fund an account before it exists, and it is
                only deployed by its first outgoing transaction. Until then the pool has
                no account storage to authenticate against, and shielding fails here and
                in the wallet alike. Send any ordinary transaction from this account
                first, then come back.
              </Callout>
            </div>
          ) : null}

          <div className="mt-5">
            <p className="field-label">Amount</p>
            <div className="mt-2 grid grid-cols-5 gap-2" role="group" aria-label="Shield amount">
              {DENOMINATIONS.map((value) => {
                const enough =
                  publicBalance !== null && toSmallestUnit(value) <= publicBalance;
                return (
                  <button
                    key={value.toString()}
                    type="button"
                    disabled={!enough || busy}
                    aria-pressed={value === choice}
                    onClick={() => setChoice(value)}
                    className={`border px-2 py-2 text-center font-mono text-sm transition-[border-color,color] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-35 ${
                      value === choice
                        ? "border-[var(--frank)] text-[var(--frank)]"
                        : "border-[var(--ink-line)] text-[var(--paper-dim)] hover:border-[var(--paper-faint)]"
                    }`}
                  >
                    {value.toString()}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-[var(--paper-faint)]">
              {publicBalance === null
                ? "Your wallet balance could not be read."
                : `${formatAmount(publicBalance)} ${STRK.symbol} in your wallet.`}
            </p>
          </div>

          {error ? (
            <div className="mt-4">
              <Callout tone="bad" title="Did not shield">
                {error}
              </Callout>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              onClick={() => onShield(toSmallestUnit(choice))}
              disabled={busy || !canShield}
            >
              {busy ? "Shielding…" : `Shield ${choice.toString()} ${STRK.symbol}`}
            </Button>
            <Button variant="quiet" onClick={onDismiss} disabled={busy}>
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
