"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  buildClaimToAddressCall,
  buildClaimToNoteActions,
  decodeLinkFragment,
  deriveLockedKey,
  readEnvelope,
  readEnvelopeHistory,
  resolveOpenNoteId,
  toPublicKey,
  type EnvelopeState,
} from "strk20-envelope";
import { ConnectButton } from "@/components/ConnectButton";
import { EnvelopeCard } from "@/components/EnvelopeCard";
import { Receipt } from "@/components/Receipt";
import { SecretInput } from "@/components/SecretInput";
import { Button, Callout, ExplorerLink, LinkButton, Mono } from "@/components/ui";
import {
  STRK,
  decodeMemo,
  formatAmount,
  formatDeadline,
  timeRemaining,
} from "@/lib/config";
import { explainWalletError } from "@/lib/errors";
import { useSound } from "@/lib/sound";
import { useWallet } from "@/lib/wallet";
import { watchEnvelope } from "@/lib/watch";

type Outcome = { kind: "private" | "public"; transactionHash: string };

export default function ClaimPage() {
  const { account, address, network, provider, supportsStrk20, accountDeployed } =
    useWallet();
  const { play } = useSound();

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
  const [now, setNow] = useState(() => Date.now());
  /** Set when the link is password-locked and the key is not known yet. */
  const [lockSalt, setLockSalt] = useState("");
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [lockError, setLockError] = useState("");
  /**
   * Whether the funding leg went through the pool. Undefined until it is known,
   * and the copy stays neutral until then rather than guessing either way.
   */
  const [fundedPrivately, setFundedPrivately] = useState<boolean | undefined>();

  useEffect(() => {
    if (outcome) play("success");
  }, [outcome, play]);

  useEffect(() => {
    if (error) play("error");
  }, [error, play]);

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
    // A locked link carries a salt where an ordinary one carries a key. There
    // is nothing to look up until a password turns one into the other, so the
    // page stops here and asks.
    if (decoded.kind === "locked") {
      setLockSalt(decoded.privateKey);
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

  // How the envelope was funded is not the recipient's choice, but it decides
  // whether the page can honestly say the funder is hidden.
  useEffect(() => {
    setFundedPrivately(undefined);
    if (!claimPublicKey || !network.anonymizer) return;
    let cancelled = false;
    void readEnvelopeHistory(
      provider,
      network.anonymizer,
      claimPublicKey,
      network.firstBlock,
      network.pool,
    ).then((events) => {
      const funded = events.find((event) => event.kind === "funded");
      if (!cancelled) setFundedPrivately(funded?.throughPool);
    });
    return () => {
      cancelled = true;
    };
  }, [claimPublicKey, network.anonymizer, network.firstBlock, network.pool, provider]);

  /**
   * `readEnvelope` decides claimable and refundable against the clock at the
   * moment it read, and nothing re-reads it. With five minute windows on offer,
   * someone can open a link with thirty seconds left and still be looking at
   * live buttons a minute later, click one, and have the contract refuse it.
   * So the deadline is watched here instead of trusted from the snapshot.
   */
  const deadline = envelope?.expiry ?? 0;
  useEffect(() => {
    if (!deadline) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  /**
   * Watch for the claim landing, starting before the wallet is even asked.
   *
   * The wallet's promise is held through proving and relaying and can outlast
   * the transaction being mined by many minutes. The envelope id is already
   * known here, so the chain answers first.
   */
  function watchForClaim(kind: "private" | "public") {
    const watch = { cancelled: false, found: false };
    const watching = watchEnvelope(
      provider,
      network.anonymizer,
      claimPublicKey,
      (state) => state.status === "claimed",
      watch,
    );
    void watching.then(async (state) => {
      if (!state) return;
      const events = await readEnvelopeHistory(
        provider,
        network.anonymizer,
        claimPublicKey,
        network.firstBlock,
      );
      const settled = events.find((event) => event.kind === "claimed");
      setOutcome({ kind, transactionHash: settled?.transactionHash ?? "" });
    });
    return { watch, watching };
  }

  /** The path that works for someone who has never touched the pool. */
  async function claimToAddress() {
    // Public release is deliberately unavailable until the funding route is
    // known to be public. The patched contract enforces the same rule, so this
    // is UX alignment rather than the security boundary.
    if (!account || !claimKey || fundedPrivately !== false) return;
    setBusy("public");
    setError("");
    const { watch, watching } = watchForClaim("public");
    try {
      const call = buildClaimToAddressCall({
        anonymizer: network.anonymizer,
        claimPrivateKey: claimKey,
        claimPublicKey,
        recipient: address,
      });
      const { transaction_hash } = await account.execute(call);
      setOutcome({ kind: "public", transactionHash: transaction_hash });
      void watching.then(() => load());
    } catch (cause) {
      // The chain outranks the wallet: a wallet can fail on a claim it landed.
      if (watch.found) return;
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
    const { watch, watching } = watchForClaim("private");
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
      void watching.then(() => load());
    } catch (cause) {
      if (watch.found) return;
      setError(explainWalletError(cause).message);
      console.error("[envelope] private claim failed", cause);
    } finally {
      setBusy("");
    }
  }

  /**
   * Turn the password into the claim key.
   *
   * There is nothing to verify against: a wrong password does not fail a check,
   * it derives a key for an envelope that was never funded. So the test is
   * whether the chain has heard of the result, and the answer to "no" has to
   * name the likely cause rather than claim the envelope does not exist.
   */
  async function unlock() {
    if (!lockSalt || !password || unlocking) return;
    setUnlocking(true);
    setLockError("");
    try {
      const derived = await deriveLockedKey(lockSalt, password);
      const state = await readEnvelope(provider, network.anonymizer, toPublicKey(derived));
      if (state.status === "none") {
        setLockError(
          "No envelope answers to that password. Check it with whoever sent the link; the password is case sensitive.",
        );
        return;
      }
      setEnvelope(state);
      setClaimKey(derived);
      setLockSalt("");
    } catch (cause) {
      setLockError(
        cause instanceof Error ? cause.message : "Could not open that envelope.",
      );
    } finally {
      setUnlocking(false);
    }
  }

  if (lockSalt) {
    return (
      <Shell>
        <h1 className="headline">
          Locked.
        </h1>
        <p className="mt-3 max-w-[62ch] text-[var(--paper-dim)]">
          This envelope was sealed with a password. The link on its own does not open
          it and does not say what is inside, because the key is only made when the
          password is put back together with the link.
        </p>

        <form
          autoComplete="off"
          className="mt-6 max-w-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void unlock();
          }}
        >
          <SecretInput
            value={password}
            onChange={setPassword}
            placeholder="Password"
            label="Envelope password"
            autoFocus
          />
          {lockError ? (
            <div className="mt-3">
              <Callout tone="bad" title="Did not open">
                {lockError}
              </Callout>
            </div>
          ) : null}
          <div className="mt-4">
            <Button type="submit" disabled={!password || unlocking}>
              {unlocking ? "Opening…" : "Open it"}
            </Button>
          </div>
        </form>
      </Shell>
    );
  }

  if (wrongLink) {
    return (
      <Shell>
        <Callout tone="warn" title="That is a return link">
          This link reclaims an expired envelope rather than claiming one. Open it at{" "}
          {/* Bare href, so the site's sub-path on Pages is dropped and this
              lands on a 404. The fragment carries the only key to the money, so
              a dead link here is not a cosmetic fault. */}
          <Link href={`/refund${window.location.hash}`}>the return page</Link>.
        </Callout>
      </Shell>
    );
  }

  if (!claimKey) {
    return (
      <Shell>
        <h1 className="headline">Nothing to open.</h1>
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
        <h1 className="headline">
          {outcome.kind === "private" ? "It is in your shielded balance." : "It is yours."}
        </h1>
        <p className="mt-4 text-[var(--paper-dim)]">
          {outcome.kind === "private"
            ? "The value landed as a private note. Nothing on-chain connects it to you."
            : fundedPrivately === false
              ? "Paid to your address, in the open. This envelope was funded in the open too, so both ends of it are now on-chain."
              : "Paid to your address. Whoever funded it is still hidden, but this payout is public."}
        </p>
        <div className="mt-6">
          <ExplorerLink explorer={network.explorer} kind="tx" value={outcome.transactionHash}>
            {outcome.transactionHash}
          </ExplorerLink>
        </div>
        <div className="mt-10">
          <LinkButton href="/">Go to home</LinkButton>
        </div>
      </Shell>
    );
  }

  if (!envelope || envelope.status === "none") {
    return (
      <Shell>
        <h1 className="headline">No such envelope.</h1>
        <p className="mt-4 text-[var(--paper-dim)]">
          Nothing has been sealed against this key on {network.label}. Check you are on the
          right network.
        </p>
      </Shell>
    );
  }

  const spent = envelope.status === "claimed" || envelope.status === "refunded";
  // Funded, but the window shut with nobody opening it. The contract will
  // refuse every claim now, so there is nothing here for a wallet to do.
  // Judged against the live clock rather than against the read.
  const seconds = Math.floor(now / 1000);
  const expired =
    envelope.status === "funded" && envelope.expiry !== 0 && seconds >= envelope.expiry;
  const claimable =
    envelope.status === "funded" && seconds >= envelope.unlockAt && !expired;
  const reference = decodeMemo(envelope.memo);
  const privateClaimOnly = fundedPrivately === true;

  // Lifted out of the column that used to hold them, because the headline and
  // the sentence under it now sit above the envelope while everything that can
  // be acted on stays in the other column. Both vary by state, so they are
  // built once here rather than branching twice in the markup.
  const headline = spent
    ? envelope.status === "claimed"
      ? "Already opened."
      : "Returned to sender."
    : expired
      ? "Too late."
      : "Someone sent you this.";

  const intro = expired ? (
    <>
      The claim window shut on {formatDeadline(envelope.expiry)} without anyone opening
      this. The contract will refuse a claim now, so there is nothing a wallet can do
      here. The {formatAmount(envelope.amount)} {STRK.symbol} is not lost: only whoever
      funded it can move it, using their return link.
    </>
  ) : spent ? (
    <>
      This envelope has been settled. An envelope releases exactly once, which is what
      makes the link safe to send over a channel you do not control.
    </>
  ) : fundedPrivately === undefined ? (
    <>
      Checking how this envelope was funded. Until that is known, only the private claim
      route is offered.
    </>
  ) : fundedPrivately === false ? (
    <>
      This one was funded from an address in the open, so whoever paid for it is already
      on-chain. Nothing below changes that. What the two routes change is what becomes
      public about <em>you</em>.
    </>
  ) : (
    <>
      Whoever funded this stays hidden. This envelope can only be claimed into your
      shielded balance; it cannot release to a public address.
    </>
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3 px-3 py-3 sm:gap-6 sm:px-6 sm:py-4 lg:grid lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-8">
      <div className="order-1 lg:sticky lg:top-10">
        <h1 className="headline">
          {headline}
        </h1>
        <p className="mt-1.5 max-w-[62ch] text-[0.8rem] leading-snug text-[var(--paper-dim)] sm:mt-3 sm:text-base sm:leading-normal">{intro}</p>

        <div className="mt-3 sm:mt-[clamp(1rem,3.5vh,2.25rem)]">
        <EnvelopeCard
          amount={formatAmount(envelope.amount)}
          symbol={STRK.symbol}
          sealed={!spent}
          expired={expired}
          reference={reference}
          caption={
            expired
              ? `The claim window shut on ${formatDeadline(envelope.expiry)}.`
              : envelope.expiry === 0
                ? "No expiry. It waits indefinitely."
                : `Claimable until ${formatDeadline(envelope.expiry)}, ${timeRemaining(envelope.expiry)}.`
          }
        />
        </div>
      </div>

      <div className="order-2">
        {expired || spent ? (
          <Receipt claimPublicKey={claimPublicKey} />
        ) : (
          <>
            <div className="space-y-2">
              {!claimable && envelope.unlockAt > seconds ? (
                <Callout tone="warn" title="Not open yet">
                  Time-locked until {formatDeadline(envelope.unlockAt)}.
                </Callout>
              ) : null}

              {error ? (
                <Callout tone="bad" title="Failed">
                  {error}
                </Callout>
              ) : null}
            </div>

            {!address ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-5 sm:gap-4">
                <ConnectButton />
                <p className="text-xs leading-snug text-[var(--paper-faint)] sm:text-sm sm:leading-normal">
                  {privateClaimOnly
                    ? "Connect a registered STRK20 wallet, such as Ready."
                    : fundedPrivately === false
                      ? "Any Starknet wallet works for the public route."
                      : "Connect a STRK20 wallet to claim privately."}
                </p>
              </div>
            ) : null}

            <div className="mt-3 grid gap-2 sm:mt-4 sm:gap-3">
              <ClaimRoute
                title="Into a shielded balance"
                reveals="Nothing. No observer learns who claimed it."
                requires="Needs a STRK20 wallet, such as Ready."
                action={busy === "private" ? "Claiming…" : "Claim privately"}
                preferred={privateClaimOnly || claimantRegistered !== false}
                disabled={
                  !address ||
                  !supportsStrk20 ||
                  claimantRegistered === false ||
                  !claimable ||
                  busy !== ""
                }
                note={
                  !address
                    ? undefined
                    : !supportsStrk20
                      ? "This wallet does not support STRK20."
                      : claimantRegistered === false
                        ? accountDeployed
                          ? privateClaimOnly
                            ? "This envelope only releases privately. Shield once from this account to register its viewing key, then return to this link."
                            : "This account has no viewing key with the pool, so it cannot receive a private note yet. Take it to your address instead, or shield once from this account first."
                          : privateClaimOnly
                            ? "This envelope only releases privately. Send one ordinary transaction to deploy this account, then shield once and return to this link."
                            : "This account is not deployed on-chain yet, so the pool cannot register it. Send one ordinary transaction from it first, then shield. Taking it to your address works either way."
                        : undefined
                }
                onClick={claimToNote}
              />
              {fundedPrivately === false ? (
                <ClaimRoute
                  title="To a public address"
                  reveals="Your address, and the amount, on-chain forever."
                  requires="Works with any Starknet wallet."
                  action={busy === "public" ? "Claiming…" : "Claim to my address"}
                  preferred={claimantRegistered === false}
                  disabled={!address || !claimable || busy !== ""}
                  onClick={claimToAddress}
                />
              ) : null}
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
      className={`border p-2.5 transition-colors duration-150 sm:p-4 ${
        preferred
          ? "border-[var(--frank)]/40 bg-[var(--ink-raised)]"
          : "border-[var(--ink-line)]"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 sm:gap-3">
        <h2 className="font-display text-base font-semibold tracking-[-0.01em] sm:text-xl">
          {title}
        </h2>
        {preferred ? <p className="field-label !text-[var(--frank)]">Recommended</p> : null}
      </div>

      <dl className="mt-2 space-y-0.5 text-[0.78rem] leading-snug sm:mt-2.5 sm:space-y-1 sm:text-sm sm:leading-normal">
        <div className="flex gap-2 sm:gap-3">
          <dt className="field-label w-16 shrink-0 pt-0.5 sm:w-24">Reveals</dt>
          <dd className="text-[var(--paper-dim)]">{reveals}</dd>
        </div>
        <div className="flex gap-2 sm:gap-3">
          <dt className="field-label w-16 shrink-0 pt-0.5 sm:w-24">Requires</dt>
          <dd className="text-[var(--paper-dim)]">{requires}</dd>
        </div>
      </dl>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:mt-3 sm:gap-3">
        <Button
          className="w-full sm:w-auto"
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
  return <div className="mx-auto max-w-2xl px-3 py-6 sm:px-6 sm:py-20">{children}</div>;
}
