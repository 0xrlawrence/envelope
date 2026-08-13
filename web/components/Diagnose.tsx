"use client";

import { useState } from "react";
import { buildFundActions, felt, generateEnvelopeKey } from "strk20-envelope";
import type { WALLET_API } from "@starknet-io/types-js";
import { explainWalletError } from "@/lib/errors";
import { Button, Callout } from "./ui";

interface Probe {
  label: string;
  what: string;
  actions: WALLET_API.STRK20_ACTION[];
}

interface Result extends Probe {
  ok: boolean;
  detail: string;
}

/**
 * Bisect a failing seal.
 *
 * The wallet reports one generic error for an action list of three, which says
 * nothing about which action it could not handle. Each probe below is a strict
 * subset of the real thing, so the first one that fails is the one to fix.
 * Every probe runs through `strk20PrepareInvoke` in simulate mode, which builds
 * without submitting, so this costs no gas and moves no funds.
 */
export function Diagnose({
  account,
  address,
  anonymizer,
  token,
  amount,
}: {
  account: { strk20PrepareInvoke(a: WALLET_API.STRK20_ACTION[], s?: boolean): Promise<unknown> };
  address: string;
  anonymizer: string;
  token: string;
  amount: bigint;
}) {
  const [results, setResults] = useState<Result[] | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setResults(null);

    const claim = generateEnvelopeKey();
    const refund = generateEnvelopeKey();

    const probes: Probe[] = [
      {
        label: "deposit only",
        what: "Can the wallet shield at all?",
        actions: [{ type: "deposit", token: felt(token), amount: felt(amount) }],
      },
      {
        label: "open note only",
        what: "Can it create an open note?",
        actions: [
          { type: "transfer", token: felt(token), amount: "OPEN", recipient: felt(address) },
        ],
      },
      {
        label: "deposit + withdraw",
        what: "Can it move value out to a contract?",
        actions: [
          { type: "deposit", token: felt(token), amount: felt(amount) },
          {
            type: "withdraw",
            token: felt(token),
            amount: felt(amount),
            recipient: felt(anonymizer),
          },
        ],
      },
      {
        label: "full seal",
        what: "The real thing.",
        actions: buildFundActions({
          anonymizer,
          token,
          amount,
          claimPublicKey: claim.publicKey,
          refundPublicKey: refund.publicKey,
          fundFrom: "wallet",
        }),
      },
    ];

    const collected: Result[] = [];
    for (const probe of probes) {
      try {
        await account.strk20PrepareInvoke(probe.actions, true);
        collected.push({ ...probe, ok: true, detail: "accepted" });
      } catch (error) {
        collected.push({ ...probe, ok: false, detail: explainWalletError(error).raw });
        console.error(`[envelope] probe "${probe.label}" failed`, error, probe.actions);
      }
      setResults([...collected]);
    }
    setRunning(false);
  }

  return (
    <div className="mt-4">
      <Button variant="outline" onClick={run} disabled={running}>
        {running ? "Testing…" : "Find out which step fails"}
      </Button>

      {results ? (
        <div className="mt-3 space-y-1.5">
          {results.map((result) => (
            <div
              key={result.label}
              className="flex items-baseline gap-3 border-b border-dotted border-[var(--ink-line)] pb-1.5 text-sm"
            >
              <span
                className="font-display text-xs font-semibold tracking-[0.15em] uppercase"
                style={{ color: result.ok ? "var(--frank)" : "var(--seal)" }}
              >
                {result.ok ? "ok" : "fails"}
              </span>
              <span className="min-w-0">
                <span className="text-[var(--paper)]">{result.label}</span>{" "}
                <span className="text-[var(--paper-faint)]">{result.what}</span>
                {!result.ok ? (
                  <span className="block font-mono text-xs break-all text-[var(--paper-faint)]">
                    {result.detail}
                  </span>
                ) : null}
              </span>
            </div>
          ))}
          {!running ? (
            <Callout title="What this means">
              The first line marked <strong>fails</strong> is the smallest thing the
              wallet cannot do. If even <em>deposit only</em> fails, nothing here is
              about envelopes and the wallet cannot shield for this account at all.
            </Callout>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
