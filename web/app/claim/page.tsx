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
import { ConnectButton } from "@/components/ConnectButton";
import { EnvelopeCard } from "@/components/EnvelopeCard";
import { Receipt } from "@/components/Receipt";
import { Button, Callout, ExplorerLink, Mono } from "@/components/ui";
import {
  STRK,
  decodeMemo,
  formatAmount,
  formatDeadline,
  timeRemaining,
} from "@/lib/config";
import { explainWalletError } from "@/lib/errors";
import { useWallet } from "@/lib/wallet";

type Outcome = { kind: "private" | "public"; transactionHash: string };

export default function ClaimPage() {
  const { account, address, network, provider, supportsStrk20, accountDeployed } =
    useWallet();

  const [claimKey, setClaimKey] = useState<string | null>(null);
  const [wrongLink, setWrongLink] = useState(false);
  const [envelope, setEnvelope] = useState<EnvelopeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "private" | "public">("");
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Claiming into the pool means receiving an open note, and a note needs a
  // viewing key to belong to anyone. A claimant who has never used the pool has
  // no key, so the private route cannot work for them however well formed the
  // request is.
  const [claimantRegistered, setClaimantRegistered] = useState<boolean | null>(null);

  useEffect(() => {
    if (!account || !supportsStrk20) {
      setClaimantRegistered(null);
      return;
    }
    let cancelled = false;
    account
      .strk20Balances([])
      .then(() => !cancelled && setClaimantRegistered(true))
      .catch((cause: unknown) => {
        const raw = cause instanceof Error ? cause.message : String(cause ?? "");
        if (!cancelled) setClaimantRegistered(!/NOT_REGISTERED/i.test(raw));
      });
    return () => {
      cancelled = true;
    };
  }, [account, supportsStrk20]);

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
      // Assemble the real thing with a placeholder signature so the wallet
      // will accept it and substitute the open note id, then sign that id and
      // rebuild. A lone OPEN transfer cannot be used as the probe: an open note
      // with nothing to fill it is not a transaction the pool accepts.
      const probe = buildClaimToNoteActions({
        anonymizer: network.anonymizer,
        claimPrivateKey: claimKey,
        claimPublicKey,
        token: envelope.token,
        recipient: address,
        noteId: "",
      });

      const noteId = await resolveOpenNoteId(account, probe, claimPublicKey);
      if (!noteId) {
        throw new Error(
          "The wallet did not report which open note this claim would fill. Claim to your address instead.",
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
      setError(explainWalletError(cause).message);
      console.error("[envelope] private claim failed", cause);
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
            : "Paid to your address. Whoever funded it is still hidden, but this payout is public."}
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
  const reference = decodeMemo(envelope.memo);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-4 lg:grid lg:grid-cols-[1fr_1fr] lg:items-start">
      <div className="order-2 lg:order-first lg:sticky lg:top-10">
        <EnvelopeCard
          amount={formatAmount(envelope.amount)}
          symbol={STRK.symbol}
          sealed={!spent}
          reference={reference}
          caption={
            envelope.expiry === 0
              ? "No expiry. It waits indefinitely."
              : `Claimable until ${formatDeadline(envelope.expiry)}, ${timeRemaining(envelope.expiry)}.`
          }
        />
      </div>

      <div className="order-1">
        <h1 className="font-display text-5xl leading-[1.02] font-bold tracking-[-0.03em]">
          {spent
            ? envelope.status === "claimed"
              ? "Already opened."
              : "Returned to sender."
            : "Someone sent you this."}
        </h1>

        {spent ? (
          <>
            <p className="mt-3 max-w-[62ch] text-[var(--paper-dim)]">
              This envelope has been settled. An envelope releases exactly once, which is
              what makes the link safe to send over a channel you do not control.
            </p>
            <Receipt claimPublicKey={claimPublicKey} />
          </>
        ) : (
          <>
            <p className="mt-3 max-w-[62ch] text-[var(--paper-dim)]">
              Whoever funded this stays hidden either way. What changes between the two
              routes below is what becomes public about <em>you</em>.
            </p>

            <div className="mt-5 space-y-2">
              {!envelope.claimable && envelope.unlockAt > Date.now() / 1000 ? (
                <Callout tone="warn" title="Not open yet">
                  Time-locked until {formatDeadline(envelope.unlockAt)}.
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
            </div>

            {!address ? (
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <ConnectButton />
                <p className="text-sm text-[var(--paper-faint)]">
                  Any Starknet wallet works for the public route.
                </p>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3">
              <ClaimRoute
                title="Into a shielded balance"
                reveals="Nothing. No observer learns who claimed it."
                requires="Needs a STRK20 wallet, such as Ready."
                action={busy === "private" ? "Claiming…" : "Claim privately"}
                preferred={claimantRegistered !== false}
                disabled={
                  !address ||
                  !supportsStrk20 ||
                  claimantRegistered === false ||
                  !envelope.claimable ||
                  busy !== ""
                }
                note={
                  !address
                    ? undefined
                    : !supportsStrk20
                      ? "This wallet does not support STRK20."
                      : claimantRegistered === false
                        ? accountDeployed
                          ? "This account has no viewing key with the pool, so it cannot receive a private note yet. Take it to your address instead, or shield once from this account first."
                          : "This account is not deployed on-chain yet, so the pool cannot register it. Send one ordinary transaction from it first, then shield. Taking it to your address works either way."
                        : undefined
                }
                onClick={claimToNote}
              />
              <ClaimRoute
                title="To a public address"
                reveals="Your address, and the amount, on-chain forever."
                requires="Works with any Starknet wallet."
                action={busy === "public" ? "Claiming…" : "Claim to my address"}
                preferred={claimantRegistered === false}
                disabled={!address || !envelope.claimable || busy !== ""}
                onClick={claimToAddress}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * One of the two ways to take an envelope, stated with its consequence.
 *
 * The choice is a privacy decision, and the person making it is usually the one
 * who knows least about the system. Putting what each route reveals next to its
 * button is the only honest way to ask.
 */
function ClaimRoute({
  title,
  reveals,
  requires,
  action,
  note,
  preferred = false,
  disabled,
  onClick,
}: {
  title: string;
  reveals: string;
  requires: string;
  action: string;
  note?: string;
  preferred?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`border p-4 transition-colors duration-150 ${
        preferred
          ? "border-[var(--frank)]/40 bg-[var(--ink-raised)]"
          : "border-[var(--ink-line)]"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-semibold tracking-[-0.01em]">{title}</h2>
        {preferred ? <p className="field-label !text-[var(--frank)]">Recommended</p> : null}
      </div>

      <dl className="mt-2.5 space-y-1 text-sm">
        <div className="flex gap-3">
          <dt className="field-label w-24 shrink-0 pt-0.5">Reveals</dt>
          <dd className="text-[var(--paper-dim)]">{reveals}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="field-label w-24 shrink-0 pt-0.5">Requires</dt>
          <dd className="text-[var(--paper-dim)]">{requires}</dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          variant={preferred ? "frank" : "outline"}
          onClick={onClick}
          disabled={disabled}
        >
          {action}
        </Button>
        {note ? <p className="text-xs text-[var(--paper-faint)]">{note}</p> : null}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl px-6 py-20">{children}</div>;
}
