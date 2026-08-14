"use client";

import { useEffect, useState } from "react";
import { encodeClaimLink, encodeRefundLink, readEnvelope, type EnvelopeState } from "strk20-envelope";
import { Button, Callout, Eyebrow, ExplorerLink } from "@/components/ui";
import { STRK, formatAmount, shortHex } from "@/lib/config";
import { useWallet } from "@/lib/wallet";
import { recentEnvelopes, type FundedEnvelope } from "@/lib/activity";
import { forget, recall, type SealRecord } from "@/lib/vault";

/**
 * Every envelope sealed from this browser.
 *
 * Sealing generates a key, funds the envelope, and shows a link. If anything
 * interrupts that between the signature and the link, the money is on-chain and
 * the only key to it is gone. This page exists so that cannot happen: keys are
 * written down before signing, and this is where they can be read back.
 */
export default function SealedPage() {
  const { network, provider } = useWallet();
  const [records, setRecords] = useState<SealRecord[]>([]);
  const [states, setStates] = useState<Record<string, EnvelopeState>>({});
  const [origin, setOrigin] = useState("");
  const [onChain, setOnChain] = useState<FundedEnvelope[] | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    setRecords(recall(network.id));
  }, [network.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const record of records) {
        try {
          const state = await readEnvelope(provider, record.anonymizer, record.claimPublicKey);
          if (!cancelled) setStates((prev) => ({ ...prev, [record.claimPublicKey]: state }));
        } catch {
          // Leave it unknown rather than claiming a status we do not have.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [records, provider]);

  // Every envelope the anonymizer has ever funded, from its own events. This
  // does not depend on holding a key, so it shows envelopes sealed from other
  // browsers, and envelopes whose keys were lost.
  useEffect(() => {
    let cancelled = false;
    recentEnvelopes(provider, network.anonymizer, network.pool)
      .then((found) => !cancelled && setOnChain(found))
      .catch(() => !cancelled && setOnChain([]));
    return () => {
      cancelled = true;
    };
  }, [provider, network.anonymizer, network.pool]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="font-display text-4xl font-bold tracking-[-0.03em]">
        Sealed from this browser
      </h1>
      <p className="mt-3 max-w-[62ch] text-[var(--paper-dim)]">
        Keys are written here before a transaction is signed, so an interrupted seal
        does not strand the money. They are bearer material: anyone with them can claim.
        Clear an entry once the link is safely handed over.
      </p>

      {records.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--paper-faint)]">
          Nothing sealed from this browser on {network.label} yet.
        </p>
      ) : null}

      <div className="mt-8 space-y-4">
        {records.map((record) => {
          const state = states[record.claimPublicKey];
          const claimLink = origin ? encodeClaimLink(origin, record.claimPrivateKey) : "";
          const refundLink = origin
            ? encodeRefundLink(origin, record.refundPrivateKey, record.claimPublicKey)
            : "";

          return (
            <div key={record.claimPublicKey} className="border border-[var(--ink-line)] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="font-display text-2xl font-bold">
                  {formatAmount(BigInt(record.amount))}{" "}
                  <span className="text-base text-[var(--paper-dim)]">{STRK.symbol}</span>
                </p>
                <p className="field-label">
                  {state ? state.status : record.submitted ? "checking" : "never submitted"}
                </p>
              </div>

              {record.memo ? (
                <p className="mt-1 font-mono text-xs text-[var(--paper-faint)]">
                  Ref. {record.memo}
                </p>
              ) : null}

              {state?.status === "funded" ? (
                <div className="mt-3 space-y-2">
                  <div>
                    <Eyebrow>Claim link</Eyebrow>
                    <p className="mt-1 font-mono text-xs break-all text-[var(--paper)]">
                      {claimLink}
                    </p>
                  </div>
                  <div>
                    <Eyebrow>Return link</Eyebrow>
                    <p className="mt-1 font-mono text-xs break-all text-[var(--paper-faint)]">
                      {refundLink}
                    </p>
                  </div>
                </div>
              ) : null}

              {state && state.status !== "funded" && state.status !== "none" ? (
                <p className="mt-3 text-sm text-[var(--paper-dim)]">
                  Settled: this envelope was {state.status}.
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-4">
                {record.transactionHash ? (
                  <ExplorerLink
                    explorer={network.explorer}
                    kind="tx"
                    value={record.transactionHash}
                  >
                    {shortHex(record.transactionHash, 10, 6)}
                  </ExplorerLink>
                ) : null}
                <Button
                  variant="quiet"
                  className="!px-0"
                  onClick={() => {
                    forget(record.claimPublicKey);
                    setRecords(recall(network.id));
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-14 border-t border-[var(--ink-line)] pt-8">
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">
          On this anonymizer
        </h2>
        <p className="mt-2 max-w-[62ch] text-sm text-[var(--paper-dim)]">
          Every envelope the contract has funded, read from its own events on{" "}
          {network.label}. An envelope funded <strong>through the pool</strong> carries
          the pool&rsquo;s events in the same transaction and is submitted by a relayer
          rather than by whoever funded it. That separation is the privacy claim, and
          it is visible here rather than asserted.
        </p>

        {onChain === null ? (
          <p className="mt-4 text-sm text-[var(--paper-faint)]">Reading the chain…</p>
        ) : onChain.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--paper-faint)]">
            No envelopes funded on this contract yet.
          </p>
        ) : (
          <div className="mt-5 space-y-2">
            {onChain.map((item) => (
              <div
                key={item.transactionHash}
                className="flex flex-wrap items-baseline justify-between gap-3 border-b border-dotted border-[var(--ink-line)] pb-2"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-lg font-bold tabular-nums">
                    {formatAmount(item.amount)}{" "}
                    <span className="text-xs text-[var(--paper-dim)]">{STRK.symbol}</span>
                  </span>
                  <span
                    className="font-display text-[0.65rem] font-semibold tracking-[0.18em] uppercase"
                    style={{
                      color: item.throughPool ? "var(--frank)" : "var(--paper-faint)",
                    }}
                  >
                    {item.throughPool ? "through the pool" : "public funding"}
                  </span>
                </div>
                <div className="flex items-baseline gap-4 font-mono text-xs text-[var(--paper-faint)]">
                  {item.throughPool && item.submittedBy ? (
                    <span title="A rotating relayer, not the funder">
                      relayer {shortHex(item.submittedBy, 6, 4)}
                    </span>
                  ) : null}
                  <ExplorerLink
                    explorer={network.explorer}
                    kind="tx"
                    value={item.transactionHash}
                  >
                    {shortHex(item.transactionHash, 8, 4)}
                  </ExplorerLink>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {records.length ? (
        <div className="mt-8">
          <Callout tone="warn" title="These keys are the money">
            Anyone who reads them can claim the envelope. They live in this browser
            only, and clearing site data removes them for good.
          </Callout>
        </div>
      ) : null}
    </div>
  );
}
