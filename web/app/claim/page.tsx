"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildClaimToAddressCall,
  buildClaimToNoteActions,
  decodeLinkFragment,
  readEnvelope,
  resolveOpenNoteId,
  toPublicKey,
  type EnvelopeState,
} from "strk20-envelope";
import { EnvelopeCard } from "@/components/EnvelopeCard";
import { Button, Callout, ExplorerLink, Mono } from "@/components/ui";
import { STRK, formatAmount } from "@/lib/config";
import { useWallet } from "@/lib/wallet";

type Outcome = { kind: "private" | "public"; transactionHash: string };

export default function ClaimPage() {
  const { account, address, network, provider, supportsStrk20 } = useWallet();

  const [claimKey, setClaimKey] = useState<string | null>(null);
  const [wrongLink, setWrongLink] = useState(false);
  const [envelope, setEnvelope] = useState<EnvelopeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "private" | "public">("");
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // The key never leaves this tab: it arrives in the fragment, which the browser
  // strips before the request, and it is read here in the client only.
  useEffect(() => {
    const decoded = decodeLinkFragment(window.location.hash);
    if (!decoded) {
      setLoading(false);
      return;
    }
    if (decoded.kind !== "claim") {
      setWrongLink(true);
      setLoading(false);
      return;
    }
    setClaimKey(decoded.privateKey);
  }, []);

  const claimPublicKey = claimKey ? toPublicKey(claimKey) : "";

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

  /** The path that works for someone who has never touched the pool. */
  async function claimToAddress() {
    if (!account || !claimKey) return;
    setBusy("public");
    setError("");
    try {
      const call = buildClaimToAddressCall({
        anonymizer: network.anonymizer,
        claimPrivateKey: claimKey,
        claimPublicKey,
        recipient: address,
      });
      const { transaction_hash } = await account.execute(call);
      setOutcome({ kind: "public", transactionHash: transaction_hash });
      void load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The claim failed.");
    } finally {
      setBusy("");
    }
  }

  /** The path that leaves nothing public about the recipient. */
  async function claimToNote() {
    if (!account || !claimKey || !envelope) return;
    setBusy("private");
    setError("");
    try {
      const noteId = await resolveOpenNoteId(account, envelope.token, address);
      if (!noteId) {
        throw new Error(
          "Could not work out which open note this claim would fill. Claim to your address instead.",
        );
      }

      const actions = buildClaimToNoteActions({
        anonymizer: network.anonymizer,
        claimPrivateKey: claimKey,
        claimPublicKey,
        token: envelope.token,
        recipient: address,
        noteId,
      });

      const { transaction_hash } = await account.strk20InvokeTransaction(actions);
      setOutcome({ kind: "private", transactionHash: transaction_hash });
      void load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The private claim failed.");
    } finally {
      setBusy("");
    }
  }

  if (wrongLink) {
    return (
      <Shell>
        <Callout tone="warn" title="That is a return link">
          This link reclaims an expired envelope rather than claiming one. Open it at{" "}
          <a href={`/refund${window.location.hash}`}>the return page</a>.
        </Callout>
      </Shell>
    );
  }

  if (!claimKey) {
    return (
      <Shell>
        <h1 className="font-display text-5xl font-bold tracking-[-0.03em]">Nothing to open.</h1>
        <p className="mt-4 text-[var(--paper-dim)]">
          A claim link carries its key after the <Mono>#</Mono>. If you pasted this from
          somewhere that truncates URLs, the key is what got cut.
        </p>
      </Shell>
    );
  }

  if (loading && !envelope) {
    return (
      <Shell>
        <p className="font-mono text-sm text-[var(--paper-faint)]">Reading the envelope…</p>
      </Shell>
    );
  }

  if (outcome) {
    return (
      <Shell>
        <h1 className="font-display text-5xl font-bold tracking-[-0.03em]">
          {outcome.kind === "private" ? "It is in your shielded balance." : "It is yours."}
        </h1>
        <p className="mt-4 text-[var(--paper-dim)]">
          {outcome.kind === "private"
            ? "The value landed as a private note. Nothing on-chain connects it to you."
            : "Paid to your address. Whoever funded it is still hidden — but this payout is public."}
        </p>
        <div className="mt-6">
          <ExplorerLink explorer={network.explorer} kind="tx" value={outcome.transactionHash}>
            {outcome.transactionHash}
          </ExplorerLink>
        </div>
      </Shell>
    );
  }

  if (!envelope || envelope.status === "none") {
    return (
      <Shell>
        <h1 className="font-display text-5xl font-bold tracking-[-0.03em]">No such envelope.</h1>
        <p className="mt-4 text-[var(--paper-dim)]">
          Nothing has been sealed against this key on {network.label}. Check you are on the
          right network.
        </p>
      </Shell>
    );
  }

  const spent = envelope.status === "claimed" || envelope.status === "refunded";

  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-6 py-14 lg:grid-cols-[1fr_1fr] lg:items-start">
      <EnvelopeCard
        amount={formatAmount(envelope.amount)}
        symbol={STRK.symbol}
        sealed={!spent}
        caption={
          envelope.expiry === 0
            ? "No expiry. It waits indefinitely."
            : `Claimable until ${new Date(envelope.expiry * 1000).toLocaleString()}.`
        }
      />

      <div>
        <h1 className="font-display text-5xl leading-[1.02] font-bold tracking-[-0.03em]">
          {spent
            ? envelope.status === "claimed"
              ? "Already opened."
              : "Returned to sender."
            : "Someone sent you this."}
        </h1>

        {spent ? (
          <p className="mt-4 text-[var(--paper-dim)]">
            This envelope has been settled. An envelope releases exactly once.
          </p>
        ) : (
          <>
            <p className="mt-4 text-[var(--paper-dim)]">
              Take it into a shielded balance, or straight to your address. The second
              needs nothing but a Starknet wallet — no registration, no viewing key.
            </p>

            <div className="mt-8 space-y-4">
              {!address ? (
                <Callout title="Connect a wallet">
                  You need somewhere to put it. Any Starknet wallet will do for a public
                  claim.
                </Callout>
              ) : null}

              {!envelope.claimable && envelope.unlockAt > Date.now() / 1000 ? (
                <Callout tone="warn" title="Not open yet">
                  Time-locked until {new Date(envelope.unlockAt * 1000).toLocaleString()}.
                </Callout>
              ) : null}

              {!envelope.claimable && envelope.refundable ? (
                <Callout tone="bad" title="Claim window shut">
                  This expired without being claimed. Only the sender can move it now.
                </Callout>
              ) : null}

              {error ? (
                <Callout tone="bad" title="Failed">
                  {error}
                </Callout>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={claimToNote}
                  disabled={!address || !supportsStrk20 || !envelope.claimable || busy !== ""}
                >
                  {busy === "private" ? "Claiming…" : "Claim privately"}
                </Button>
                <Button
                  variant="outline"
                  onClick={claimToAddress}
                  disabled={!address || !envelope.claimable || busy !== ""}
                >
                  {busy === "public" ? "Claiming…" : "Claim to my address"}
                </Button>
              </div>

              {address && !supportsStrk20 ? (
                <p className="text-sm text-[var(--paper-faint)]">
                  Private claims need a STRK20 wallet. Yours can still take the public
                  path.
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl px-6 py-20">{children}</div>;
}
