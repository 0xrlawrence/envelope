"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildRefundActions,
  decodeRefundFragment,
  readEnvelope,
  resolveOpenNoteId,
  type EnvelopeState,
} from "strk20-envelope";
import { EnvelopeCard } from "@/components/EnvelopeCard";
import { Button, Callout, ExplorerLink } from "@/components/ui";
import { STRK, formatAmount } from "@/lib/config";
import { useWallet } from "@/lib/wallet";

export default function RefundPage() {
  const { account, address, network, provider, supportsStrk20 } = useWallet();

  const [refundKey, setRefundKey] = useState<string | null>(null);
  const [claimPublicKey, setClaimPublicKey] = useState("");
  const [envelope, setEnvelope] = useState<EnvelopeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [transactionHash, setTransactionHash] = useState("");

  // A return link carries the refund key *and* the claim public key: the
  // refund key is deliberately unrelated to the envelope's identity, so on its
  // own it could not find what it is reclaiming.
  useEffect(() => {
    const decoded = decodeRefundFragment(window.location.hash);
    if (!decoded) {
      setLoading(false);
      return;
    }
    setRefundKey(decoded.refundPrivateKey);
    setClaimPublicKey(decoded.claimPublicKey);
  }, []);

  const load = useCallback(async () => {
    if (!claimPublicKey || !network.anonymizer) return;
    setLoading(true);
    try {
      setEnvelope(await readEnvelope(provider, network.anonymizer, claimPublicKey));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read the envelope.");
    } finally {
      setLoading(false);
    }
  }, [claimPublicKey, network.anonymizer, provider]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reclaim() {
    if (!account || !refundKey || !envelope) return;
    setBusy(true);
    setError("");
    try {
      // Assemble with a placeholder signature to learn the open note id, then
      // sign that id and rebuild. A lone OPEN transfer is not an acceptable
      // probe: an open note with nothing to fill it is refused outright.
      const probe = buildRefundActions({
        anonymizer: network.anonymizer,
        refundPrivateKey: refundKey,
        claimPublicKey,
        token: envelope.token,
        recipient: address,
        noteId: "",
      });

      const noteId = await resolveOpenNoteId(account, probe, claimPublicKey);
      if (!noteId) {
        throw new Error("The wallet did not report which open note to return this to.");
      }

      const { transaction_hash } = await account.strk20InvokeTransaction(
        buildRefundActions({
          anonymizer: network.anonymizer,
          refundPrivateKey: refundKey,
          claimPublicKey,
          token: envelope.token,
          recipient: address,
          noteId,
        }),
      );
      setTransactionHash(transaction_hash);
      void load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The return failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!refundKey && !loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <h1 className="font-display text-4xl font-bold tracking-[-0.02em]">
          Nothing to return.
        </h1>
        <p className="mt-4 text-[var(--paper-dim)]">
          A return link carries its key after the <code className="font-mono">#</code>. If
          this was pasted from somewhere that truncates URLs, that is what got cut.
        </p>
      </div>
    );
  }

  if (transactionHash) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <h1 className="font-display text-4xl font-bold tracking-[-0.02em]">
          Returned to sender.
        </h1>
        <p className="mt-4 text-[var(--paper-dim)]">
          Back in your shielded balance as a fresh note. Nothing links it to the envelope
          it came from.
        </p>
        <div className="mt-6">
          <ExplorerLink explorer={network.explorer} kind="tx" value={transactionHash}>
            {transactionHash}
          </ExplorerLink>
        </div>
      </div>
    );
  }

  if (loading || !envelope) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <p className="text-sm text-[var(--paper-faint)]">Reading the envelope…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-6 py-4 lg:grid-cols-[1fr_1fr] lg:items-start">
      <EnvelopeCard
        amount={formatAmount(envelope.amount)}
        symbol={STRK.symbol}
        sealed={envelope.status === "funded"}
      />

      <div>
        <h1 className="font-display text-4xl leading-tight font-bold tracking-[-0.02em]">
          {envelope.status === "claimed"
            ? "Already opened."
            : envelope.status === "refunded"
              ? "Already returned."
              : envelope.refundable
                ? "Undelivered."
                : "Still out for delivery."}
        </h1>

        <p className="mt-4 text-[var(--paper-dim)]">
          {envelope.status === "claimed"
            ? "Someone claimed this before it expired. There is nothing to return."
            : envelope.status === "refunded"
              ? "This envelope has already come back to you."
              : envelope.refundable
                ? "The claim window shut without anyone opening it. You can take it back."
                : `Nobody has claimed it yet, and the window is still open until ${new Date(
                    envelope.expiry * 1000,
                  ).toLocaleString()}. You can only reclaim it after that.`}
        </p>

        {envelope.refundable ? (
          <div className="mt-8 space-y-4">
            {!address ? (
              <Callout title="Connect a wallet">
                Connect the wallet that holds your shielded balance, since the returned
                value lands there as a private note.
              </Callout>
            ) : null}

            {error ? (
              <Callout tone="bad" title="Failed">
                {error}
              </Callout>
            ) : null}

            <Button onClick={reclaim} disabled={!address || !supportsStrk20 || busy}>
              {busy ? "Returning…" : "Return to sender"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
