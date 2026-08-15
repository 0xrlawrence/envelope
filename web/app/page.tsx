"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildFundActions,
  buildPublicFundCalls,
  readEnvelope,
  readEnvelopeHistory,
  buildShieldActions,
  felt,
  feltTokens,
  encodeClaimLink,
  encodeRefundLink,
  generateEnvelopeKey,
  type EnvelopeKeyPair,
} from "strk20-envelope";
import { EnvelopeCard } from "@/components/EnvelopeCard";
import { SendOff } from "@/components/SendOff";
import { Button, Callout, Eyebrow, ExplorerLink, Field, Mono } from "@/components/ui";
import {
  DENOMINATIONS,
  EXPIRY_CHOICES,
  STRK,
  formatAmount,
  toSmallestUnit,
} from "@/lib/config";
import { explainWalletError, looksRejected } from "@/lib/errors";
import { appOrigin } from "@/lib/origin";
import { useSound } from "@/lib/sound";
import { forget, markSubmitted, recall, remember, type SealRecord } from "@/lib/vault";
import { accountClassName, looksUnimplemented, useWallet } from "@/lib/wallet";

interface SealedEnvelope {
  claim: EnvelopeKeyPair;
  refund: EnvelopeKeyPair;
  amount: bigint;
  transactionHash: string;
  /** Whether the pool hid the funder, or the funding leg was public. */
  private: boolean;
  /**
   * "funding" until the transaction lands, then settled. "declined" is kept
   * apart from "failed" because nothing went wrong: the user said no, and the
   * app should say so and stop rather than reporting a fault.
   */
  state: "funding" | "funded" | "failed" | "declined";
  problem?: string;
}

/**
 * Clear the page to the left, and fold the envelope away.
 *
 * The stagger is applied as inline delays rather than by a library, so the
 * whole exit is one class toggle and cannot be left half-played by a script
 * that stalls.
 */
function playSendOff(stage: HTMLElement | null): void {
  if (!stage) return;

  const columns = Array.from(stage.children) as HTMLElement[];
  columns.forEach((column) => {
    Array.from(column.children).forEach((child, index) => {
      (child as HTMLElement).style.transitionDelay = `${index * 45}ms`;
    });
  });

  const envelope = columns[0]?.firstElementChild as HTMLElement | undefined;
  envelope?.classList.add("envelope-fold");

  // Next frame, so the delays are in place before the transition starts.
  requestAnimationFrame(() => stage.classList.add("send-off"));
}

/** Bring the page back, for a seal that was declined rather than sent. */
function undoSendOff(stage: HTMLElement | null): void {
  if (!stage) return;
  stage.classList.remove("send-off");
  const envelope = stage.firstElementChild?.firstElementChild as HTMLElement | undefined;
  envelope?.classList.remove("envelope-fold");
  Array.from(stage.children).forEach((column) => {
    Array.from(column.children).forEach((child) => {
      (child as HTMLElement).style.transitionDelay = "";
    });
  });
}

export default function CreatePage() {
  const {
    account,
    address,
    network,
    provider,
    supportsStrk20,
    walletName,
    accountClass,
  } = useWallet();
  const { play } = useSound();

  const [denomination, setDenomination] = useState(DENOMINATIONS[2]!);
  const [expirySeconds, setExpirySeconds] = useState(EXPIRY_CHOICES[2]!.seconds);
  const [memo, setMemo] = useState("");

  const [shieldedBalance, setShieldedBalance] = useState<bigint | null>(null);
  const [publicBalance, setPublicBalance] = useState<bigint | null>(null);
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [progress, setProgress] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [sending, setSending] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState<"" | "shielding" | "sealing">("");
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [sealed, setSealed] = useState<SealedEnvelope | null>(null);

  useEffect(() => {
    if (error && !sending) play("error");
  }, [error, play, sending]);

  const amount = toSmallestUnit(denomination);

  // Both balances, because they answer different questions: the public one is
  // whether there is anything to shield, the shielded one is whether there is
  // anything to seal. Without them on screen a failed seal is unattributable.
  const refreshBalance = useCallback(async () => {
    if (!address) return;

    try {
      const raw = await provider.callContract({
        contractAddress: felt(STRK.address),
        entrypoint: "balanceOf",
        calldata: [felt(address)],
      });
      const low = BigInt(raw[0] ?? "0x0");
      const high = BigInt(raw[1] ?? "0x0");
      setPublicBalance(low + (high << 128n));
    } catch {
      setPublicBalance(null);
    }

    if (!account || !supportsStrk20) return;
    try {
      const balances = await account.strk20Balances(feltTokens([STRK.address]));
      const entry = balances.find(
        (candidate: { token: string }) =>
          BigInt(candidate.token) === BigInt(STRK.address),
      );
      setShieldedBalance(entry ? BigInt(entry.balance) : 0n);
      setRegistered(true);
    } catch (cause) {
      // The pool answers NOT_REGISTERED until a viewing key exists, so the
      // balance query doubles as the registration check.
      setShieldedBalance(null);
      const raw = cause instanceof Error ? cause.message : String(cause ?? "");
      if (/NOT_REGISTERED/i.test(raw)) setRegistered(false);
    }
  }, [account, address, provider, supportsStrk20]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  // The send-off is otherwise only reachable by completing a real transaction,
  // which makes it impossible to look at while building. Stripped from
  // production builds.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __sendOff?: () => void }).__sendOff = () => {
      playSendOff(stageRef.current);
      setSending(true);
    };
  }, []);

  // A long silent wait is indistinguishable from a hang. Counting it out loud
  // at least says which of the two it is.
  useEffect(() => {
    if (busy === "") {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  async function shield() {
    if (!account) return;
    setBusy("shielding");
    setError("");
    setErrorDetail("");
    try {
      await account.strk20InvokeTransaction(
        buildShieldActions({ token: STRK.address, amount }),
      );
      await refreshBalance();
    } catch (cause) {
      const explained = explainWalletError(cause);
      setSealed((previous) =>
        previous ? { ...previous, state: "failed", problem: explained.message } : previous,
      );
      setError(
        looksUnimplemented(cause)
          ? "This wallet does not serve the STRK20 methods, so it cannot shield."
          : explained.message,
      );
      setErrorDetail(explained.raw);
      console.error("[envelope] shield failed", cause);
    } finally {
      setBusy("");
    }
  }

  /**
   * Watch the contract for this envelope, starting now.
   *
   * A submitted transaction is not a funded envelope, and a link to an envelope
   * that does not exist is worse than no link: it gets sent, and the recipient
   * finds nothing. So the link is only ever called valid once the anonymizer
   * confirms it.
   *
   * The thing to get right is *when* the watching starts. This used to run
   * after the wallet's promise resolved, which meant the app could not know
   * anything the wallet had not told it yet. A wallet that proves, hands the
   * transaction to a relayer and then waits on its own confirmation holds that
   * promise long after the transaction is mined, and the app sat there with a
   * confirmed envelope on-chain telling the user it was still funding. Ten
   * minutes of it, in one measured case.
   *
   * The envelope id is the claim public key, which exists before anything is
   * signed, so nothing about this needs the wallet at all. It starts when the
   * seal starts and races it.
   */
  function watchForEnvelope(
    claimPublicKey: string,
    watch: { cancelled: boolean; found: boolean },
  ) {
    return (async (): Promise<boolean> => {
      const deadline = Date.now() + 8 * 60_000;
      while (Date.now() < deadline && !watch.cancelled) {
        try {
          const state = await readEnvelope(provider, network.anonymizer, claimPublicKey);
          if (state.status !== "none") {
            watch.found = true;
            setSealed((previous) =>
              previous ? { ...previous, state: "funded" } : previous,
            );

            // The wallet may still be holding its promise, so the hash it would
            // eventually return is not available. The funding event carries it,
            // and the envelope is already on-chain, so take it from there.
            void readEnvelopeHistory(
              provider,
              network.anonymizer,
              claimPublicKey,
              network.firstBlock,
            ).then((events) => {
              const funded = events.find((event) => event.kind === "funded");
              if (!funded) return;
              markSubmitted(claimPublicKey, funded.transactionHash);
              setSealed((previous) =>
                previous && !previous.transactionHash
                  ? { ...previous, transactionHash: funded.transactionHash }
                  : previous,
              );
            });
            return true;
          }
        } catch {
          // Keep watching; a read failure is not an answer.
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      return false;
    })();
  }

  async function seal() {
    if (!account) return;
    setBusy("sealing");
    setError("");
    setErrorDetail("");

    // Fresh keys per envelope. Two envelopes from the same funder share no key
    // material, so nothing on-chain ties them to each other.
    const claim = generateEnvelopeKey();
    const refund = generateEnvelopeKey();

    // The page gets out of the way first, so the throw has somewhere to happen.
    // The signature prompt lands on a cleared stage rather than over a form.
    playSendOff(stageRef.current);
    setSending(true);

    // Written down before anything is signed. If the tab reloads between the
    // signature and the success screen, the envelope is still funded on-chain
    // and its keys would otherwise be gone, taking the money with them.
    remember({
      claimPrivateKey: claim.privateKey,
      claimPublicKey: claim.publicKey,
      refundPrivateKey: refund.privateKey,
      amount: amount.toString(),
      memo,
      network: network.id,
      anonymizer: network.anonymizer,
      createdAt: Date.now(),
      submitted: false,
    });

    // Show the link immediately. The keys are the envelope, they already exist,
    // and the recipient cannot claim until the funding lands anyway. Holding
    // the link back for the length of a proof buys nothing and costs the user a
    // minute of staring at a spinner.
    setSealed({
      claim,
      refund,
      amount,
      transactionHash: "",
      private: false,
      state: "funding",
    });

    // Started here, before a signature is even asked for, so the app learns the
    // envelope exists from the chain rather than from the wallet finishing.
    const watch = { cancelled: false, found: false };
    const watching = watchForEnvelope(claim.publicKey, watch);

    // Two routes, and the app must never hand back a dead end because the
    // first one did not work. The pool route hides the funder but needs a
    // wallet that can prove for this account; the public route needs only an
    // approval and works from any wallet. Either way the funder gets an
    // envelope, and nothing has moved when a route fails, so falling through
    // costs a second signature and no money.
    const sealThroughPool = async (fundFrom: "shielded" | "wallet") => {
      const actions = buildFundActions({
        anonymizer: network.anonymizer,
        token: STRK.address,
        amount,
        fundFrom,
        claimPublicKey: claim.publicKey,
        refundPublicKey: refund.publicKey,
        expiry: expirySeconds === 0 ? 0 : Math.floor(Date.now() / 1000) + expirySeconds,
        memo: memo.slice(0, 31),
      });
      // Assemble and prove without submitting first: a wallet that cannot prove
      // for this account fails here, before anyone is asked to sign.
      await account.strk20PrepareInvoke(actions, true);
      return account.strk20InvokeTransaction(actions);
    };

    const sealPublicly = async () =>
      account.execute(
        buildPublicFundCalls({
          anonymizer: network.anonymizer,
          token: STRK.address,
          amount,
          claimPublicKey: claim.publicKey,
          refundPublicKey: refund.publicKey,
          expiry: expirySeconds === 0 ? 0 : Math.floor(Date.now() / 1000) + expirySeconds,
          memo: memo.slice(0, 31),
        }),
      );

    try {
      let transactionHash = "";
      let viaPool = false;

      if (supportsStrk20) {
        try {
          const result = await sealThroughPool(fromWallet ? "wallet" : "shielded");
          transactionHash = result.transaction_hash;
          viaPool = true;
        } catch (poolAttempt) {
          console.debug("[envelope] pool route unavailable", poolAttempt);
          // A refusal ends it. Falling through to the next route would put a
          // second signature prompt in front of someone who has just said no.
          if (looksRejected(poolAttempt)) throw poolAttempt;
          // Spending a note is a guess whenever the shielded balance could not
          // be read, so try the pool once more from the wallet before giving up
          // on privacy altogether.
          try {
            if (fromWallet || shieldedBalance !== null) throw poolAttempt;
            setProgress("No shielded note to spend. Funding from your wallet instead.");
            const result = await sealThroughPool("wallet");
            transactionHash = result.transaction_hash;
            viaPool = true;
          } catch (walletAttempt) {
            if (looksRejected(walletAttempt)) throw walletAttempt;
            setProgress(
              "This wallet cannot prove a private seal for this account, so the envelope is funded from your address.",
            );
            const result = await sealPublicly();
            transactionHash = result.transaction_hash;
          }
        }
      } else {
        const result = await sealPublicly();
        transactionHash = result.transaction_hash;
      }

      markSubmitted(claim.publicKey, transactionHash);
      setSealed((previous) =>
        previous ? { ...previous, transactionHash, private: viaPool } : previous,
      );

      // The watcher has been running since before the signature, so by the time
      // the wallet returns this has usually already resolved.
      if (!(await watching)) {
        setSealed((previous) =>
          previous
            ? {
                ...previous,
                state: "failed",
                problem:
                  "The transaction was submitted but the envelope has not appeared on-chain. Do not send this link yet; check the sealed page, where the keys are kept.",
              }
            : previous,
        );
      }
      void refreshBalance();
    } catch (cause) {
      // The wallet can fail on a transaction it has already landed: a proving
      // service that stops waiting, a relayer that answers late. The chain is
      // the authority, so if the watcher has already found the envelope this is
      // not a failure at all and must not be reported as one.
      if (watch.found) {
        void refreshBalance();
        return;
      }

      // Someone who declined in the wallet gets an answer immediately. There is
      // nothing on-chain to look for, and making them watch an envelope fly for
      // forty seconds after they cancelled is the app arguing with them.
      if (looksRejected(cause)) {
        watch.cancelled = true;
        // The keys were written down before signing, in case the tab died
        // holding the only copy. Nothing was signed, so they are now litter.
        forget(claim.publicKey);
        setSealed((previous) =>
          previous ? { ...previous, state: "declined" } : previous,
        );
        return;
      }

      // A refusal and a timeout are not the same thing. The wallet can give up
      // waiting on a transaction it already submitted, so before believing the
      // error, give the watcher a moment. It is already polling; starting a
      // second loop here would only ask the same question twice.
      //
      // Bounded tightly, because not every wallet words a refusal in a way the
      // check above recognises, and the cost of guessing wrong is that someone
      // watches an envelope fly for a transaction they cancelled. The watcher
      // is deliberately left running afterwards: if the transaction does land
      // late, it corrects this screen and the sealed page on its own.
      setProgress("Checking whether it went through anyway.");
      const landedLate = await Promise.race([
        watching,
        new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 12_000)),
      ]);
      if (landedLate || watch.found) {
        void refreshBalance();
        return;
      }

      // The wallet's own wording is rarely actionable, so it is translated and
      // the original kept alongside for anyone reporting the problem.
      const explained = explainWalletError(cause);
      setSealed((previous) =>
        previous ? { ...previous, state: "failed", problem: explained.message } : previous,
      );
      setError(
        looksUnimplemented(cause)
          ? "This wallet does not serve the STRK20 methods, so it cannot seal an envelope. Ready has privacy live on mainnet; the claim page still works with any Starknet wallet."
          : explained.message,
      );
      setErrorDetail(`${explained.raw} (during strk20InvokeTransaction)`);
      // The action list is logged alongside so a shape problem is visible
      // rather than inferred.
      console.error("[envelope] seal failed", cause, {
        actions: buildFundActions({
          anonymizer: network.anonymizer,
          token: STRK.address,
          amount,
          claimPublicKey: claim.publicKey,
          refundPublicKey: refund.publicKey,
          fundFrom: fromWallet ? "wallet" : "shielded",
        }),
      });
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  // A declined seal never becomes an envelope, so it never gets the sealed
  // view. It is cleared once the return flight lands.
  if (sealed && sealed.state !== "declined" && !sending) {
    return <SealedView sealed={sealed} onReset={() => setSealed(null)} />;
  }

  const notDeployed = network.anonymizer === "";
  const maker = accountClassName(accountClass);
  // Fund from the wallet only when the shielded balance is known and short of
  // the envelope. An unreadable balance previously counted as zero, which
  // meant a failed read silently deposited the user's money a second time
  // while a perfectly good shielded note sat unspent.
  const fromWallet = shieldedBalance !== null && shieldedBalance < amount;
  // Enough to seal, from wherever it has to come.
  const funded =
    (shieldedBalance ?? 0n) >= amount || (publicBalance !== null && publicBalance >= amount);

  return (
    <>
      {sending ? (
        <SendOff
          amount={denomination.toString()}
          symbol={STRK.symbol}
          phase={
            sealed?.state === "funded"
              ? "sent"
              : sealed?.state === "declined"
                ? "returned"
                : sealed?.state === "failed"
                  ? "failed"
                  : "flying"
          }
          onDone={() => {
            setSending(false);
            // A declined seal produced nothing, so there is no envelope to show
            // and no link to hand over. The form comes back with the amount and
            // the reference still filled in, ready to try again.
            if (sealed?.state === "declined") {
              setSealed(null);
              undoSendOff(stageRef.current);
              setError("You declined this in your wallet. Nothing was sent and nothing moved.");
            }
          }}
        />
      ) : null}

    <div
      ref={stageRef}
      className="mx-auto flex w-full max-w-5xl flex-col gap-[clamp(1.5rem,5vh,4rem)] px-6 py-[clamp(0.75rem,3.4vh,3rem)] lg:grid lg:grid-cols-[1fr_1fr] lg:items-center"
    >
      <div className="order-2 lg:sticky lg:top-10 lg:order-first">
        <EnvelopeCard
          amount={denomination.toString()}
          symbol={STRK.symbol}
          reference={memo || undefined}
          caption="Sealed against a key that exists only in the link. Whoever opens it takes the contents."
        />

        <dl className="mt-[clamp(1rem,4vh,2.5rem)] space-y-[clamp(0.35rem,1.8vh,0.9rem)] text-sm">
          <HiddenRow hidden>Who funded it</HiddenRow>
          <HiddenRow hidden>Who claims it, if they claim privately</HiddenRow>
          <HiddenRow>The amount, on both legs</HiddenRow>
          <HiddenRow>The recipient, if they claim to a public address</HiddenRow>
        </dl>
      </div>

      <div className="order-1">
        <h1 className="font-display text-[clamp(1.9rem,4.6vh,3.25rem)] leading-[1.03] font-bold tracking-[-0.03em] text-balance">
          Private money you can send as a link.
        </h1>
        <p className="mt-[clamp(0.6rem,2vh,1.25rem)] max-w-[62ch] text-[var(--paper-dim)]">
          A STRK20 private transfer needs a registered recipient. An envelope does not.
          It pays someone who has never touched Starknet, and the pool still hides who
          paid.
        </p>

        <div className="mt-[clamp(0.75rem,3vh,2rem)]">
          <Field label="Amount" hint="Round sizes share a crowd">
            <div className="grid grid-cols-5 gap-2">
              {DENOMINATIONS.map((value) => (
                <button
                  key={value.toString()}
                  onClick={() => setDenomination(value)}
                  className={`border px-2 py-2 text-center font-mono text-sm transition-[border-color,color] duration-150 ease-out ${
                    value === denomination
                      ? "border-[var(--frank)] text-[var(--frank)]"
                      : "border-[var(--ink-line)] text-[var(--paper-dim)] hover:border-[var(--paper-faint)]"
                  }`}
                >
                  {value.toString()}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="Claim window"
            hint={
              expirySeconds === 0
                ? "No window means no way back. Only the link can open it."
                : "After it shuts, only you can reclaim"
            }
          >
            <div className="flex flex-wrap gap-2">
              {EXPIRY_CHOICES.map((choice) => (
                <button
                  key={choice.label}
                  onClick={() => setExpirySeconds(choice.seconds)}
                  className={`border px-4 py-2 text-sm transition-[border-color,color] duration-150 ease-out ${
                    choice.seconds === expirySeconds
                      ? "border-[var(--frank)] text-[var(--frank)]"
                      : "border-[var(--ink-line)] text-[var(--paper-dim)] hover:border-[var(--paper-faint)]"
                  }`}
                >
                  {choice.label}
                </button>
              ))}
            </div>

            {/* The contract refuses a refund on an envelope with no expiry, by
                design: there is no window to shut, so there is no moment the
                funder's key becomes valid. That makes this the one setting on
                the page that can lose the money outright, and it was offered
                under a hint promising the opposite. */}
            {expirySeconds === 0 ? (
              <div className="mt-3">
                <Callout tone="warn" title="This one cannot be undone">
                  With no expiry there is no refund. If the link is lost or never
                  opened, the {denomination.toString()} {STRK.symbol} stays in the
                  contract and nobody, including you, can move it.
                </Callout>
              </div>
            ) : null}
          </Field>

          <Field label="Reference" hint="Public. Keep it dull.">
            <input
              value={memo}
              maxLength={31}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="Payment for your bounty Ref# 1101"
              className="w-full border border-[var(--ink-line)] bg-transparent px-3 py-2 font-mono text-sm outline-none placeholder:text-[var(--paper-faint)] focus:border-[var(--frank)]"
            />
          </Field>
        </div>

        <div className="mt-[clamp(0.75rem,3vh,2rem)] space-y-[clamp(0.4rem,1.8vh,1rem)]">
          {!address ? (
            <Callout title="Not connected">
              Connect a STRK20 wallet, such as Ready, to seal an envelope.
            </Callout>
          ) : null}

          {address && !supportsStrk20 ? (
            <Callout title="Funded from your address">
              <p>
                {walletName || "This wallet"} cannot prove a STRK20 transaction for
                this account, so the envelope is funded from your address rather than
                from a shielded note. Everything else is unchanged: the claim link, the
                expiry, the refund, and the fact that a claim cannot be front-run.
                Whoever claims it into a shielded balance is still unobservable.
              </p>
            </Callout>
          ) : null}

          {notDeployed ? (
            <Callout tone="bad" title="Not deployed here">
              No Envelope anonymizer on {network.label} yet. Switch networks in your
              wallet.
              {maker && walletName && !walletName.toLowerCase().includes(maker.toLowerCase()) ? (
                <p className="mt-2">
                  This account is a <strong>{maker}</strong> account being driven by{" "}
                  {walletName}. A STRK20 proof validates the account&rsquo;s own
                  signature inside the proof, so a wallet can generally only prove for
                  its own account class. Creating a native {walletName} account and
                  funding that is the thing most likely to make the private route work.
                </p>
              ) : null}
            </Callout>
          ) : null}

          {address ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 border-y border-[var(--ink-line)] py-2.5 text-sm">
              <dt className="field-label">In your wallet</dt>
              <dd className="text-right font-mono text-[var(--paper-dim)]">
                {publicBalance === null
                  ? "unreadable"
                  : `${formatAmount(publicBalance)} ${STRK.symbol}`}
              </dd>
              <dt className="field-label">Shielded in the pool</dt>
              <dd className="text-right font-mono text-[var(--paper-dim)]">
                {shieldedBalance === null
                  ? "unreadable"
                  : `${formatAmount(shieldedBalance)} ${STRK.symbol}`}
              </dd>
            </dl>
          ) : null}

          {address && supportsStrk20 && !funded ? (
            <Callout tone="warn" title="Not enough to seal">
              This account holds{" "}
              {publicBalance === null ? "an unreadable balance" : `${formatAmount(publicBalance)} ${STRK.symbol}`}{" "}
              and nothing shielded, so there is not enough for a{" "}
              {denomination.toString()} {STRK.symbol} envelope. Choose a smaller
              amount or fund the account.
            </Callout>
          ) : null}

          {error ? (
            <Callout tone="bad" title="Failed">
              <p>{error}</p>
              {errorDetail && errorDetail !== error ? (
                <p className="mt-2 font-mono text-xs break-all text-[var(--paper-faint)]">
                  Wallet said: {errorDetail}
                </p>
              ) : null}
            </Callout>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={seal}
              disabled={!address || notDeployed || busy !== "" || !funded}
            >
              {busy === "sealing" ? "Sealing…" : "Seal envelope"}
            </Button>
          </div>

          {busy === "sealing" && progress ? (
            <p className="text-sm text-[var(--frank)]">{progress}</p>
          ) : null}

          {busy !== "" ? (
            <div className="text-sm text-[var(--paper-dim)]">
              <p>
                {fromWallet
                  ? "Shielding and sealing in one transaction. "
                  : "Spending a shielded note. "}
                The wallet generates a STARK proof before anything is submitted, which
                takes about half a minute on a fast machine.
              </p>
              <p className="mt-2 font-mono text-xs tracking-widest text-[var(--paper-faint)] uppercase">
                {Math.floor(elapsed / 60)}m {String(elapsed % 60).padStart(2, "0")}s
                elapsed
              </p>
              {elapsed > 75 ? (
                <p className="mt-2 text-[var(--frank)]">
                  Longer than proving alone should take. Check the wallet for a prompt
                  waiting to be approved: it will not proceed until you do, and the
                  window does not always come to the front.
                </p>
              ) : null}
              {elapsed > 240 ? (
                <p className="mt-2">
                  If there is no prompt, the wallet is likely stuck. Reload and press
                  Seal envelope again. Nothing has been spent unless a transaction was
                  signed.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
    </>
  );
}

function HiddenRow({ children, hidden = false }: { children: string; hidden?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-dotted border-[var(--ink-line)] pb-[clamp(0.35rem,1.8vh,0.9rem)]">
      <span
        className="font-display text-xs font-semibold tracking-[0.2em] uppercase"
        style={{ color: hidden ? "var(--frank)" : "var(--paper-faint)" }}
      >
        {hidden ? "Hidden" : "Public"}
      </span>
      <span className="text-[var(--paper-dim)]">{children}</span>
    </div>
  );
}

function SealedView({ sealed, onReset }: { sealed: SealedEnvelope; onReset: () => void }) {
  const { network } = useWallet();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(appOrigin()), []);

  const claimLink = origin ? encodeClaimLink(origin, sealed.claim.privateKey, "claim") : "";
  const refundLink = origin
    ? encodeRefundLink(origin, sealed.refund.privateKey, sealed.claim.publicKey)
    : "";

  return (
    <div className="mx-auto w-full grid max-w-5xl gap-[clamp(1.5rem,3.6vh,2.5rem)] px-6 py-[clamp(0.75rem,2.2vh,2rem)] lg:h-full lg:grid-cols-[1fr_1fr] lg:items-start">
      <div className="animate-flap">
        <EnvelopeCard amount={formatAmount(sealed.amount)} symbol={STRK.symbol} sealed />
      </div>

      <div>
        <h1 className="font-display text-[clamp(1.9rem,4.6vh,3.25rem)] leading-[1.03] font-bold tracking-[-0.03em]">
          {sealed.state === "failed" ? "Not sealed." : "Hand it over."}
        </h1>
        {sealed.state === "funding" ? (
          <div className="mt-4 border-l border-[var(--frank)] bg-[var(--ink-raised)] px-4 py-3 text-sm">
            <p className="field-label !text-[var(--frank)]">Funding</p>
            <p className="mt-1 text-[var(--paper-dim)]">
              Not valid yet. The wallet is still proving the funding transaction, and
              this link works only once the envelope is confirmed on-chain. Wait for
              this notice to clear before sending it.
            </p>
          </div>
        ) : null}

        {sealed.state === "funded" ? (
          <div className="mt-4 border-l border-[var(--frank)] bg-[var(--ink-raised)] px-4 py-3 text-sm">
            <p className="field-label !text-[var(--frank)]">Confirmed on-chain</p>
            <p className="mt-1 text-[var(--paper-dim)]">
              The envelope exists and the link below works. Send it.
            </p>
          </div>
        ) : null}

        {sealed.state === "failed" ? (
          <div className="mt-4 border-l border-[var(--seal)] bg-[var(--ink-raised)] px-4 py-3 text-sm">
            <p className="field-label !text-[var(--seal)]">Do not send this link</p>
            <p className="mt-1 text-[var(--paper-dim)]">
              {sealed.problem ?? "The funding transaction did not go through."} The keys
              are kept on the sealed page in case the transaction lands late.
            </p>
          </div>
        ) : null}

        <p className="mt-[clamp(0.6rem,2vh,1.25rem)] max-w-[62ch] text-[var(--paper-dim)]">
          The key lives in the part of the URL after the <Mono>#</Mono>, which browsers
          never send to a server. It has not reached ours, and it will not reach the
          recipient&rsquo;s either.
        </p>

        <div className="mt-6 space-y-4">
          <LinkBlock
            label="Claim link"
            hint="Anyone holding this can take the contents. Send it the way you would send cash."
            value={claimLink}
          />
          <LinkBlock
            label="Return link"
            hint="Keep this. After the claim window shuts, it is the only way to get the money back."
            value={refundLink}
          />
        </div>

        <div className="mt-6 border-t border-[var(--ink-line)] pt-4">
          <Eyebrow>Funding transaction</Eyebrow>
          <div className="mt-2">
            {sealed.transactionHash ? (
              <ExplorerLink
                explorer={network.explorer}
                kind="tx"
                value={sealed.transactionHash}
              >
                {sealed.transactionHash}
              </ExplorerLink>
            ) : (
              <p className="text-sm text-[var(--paper-dim)]">
                No hash yet. It is listed on the{" "}
                <a className="text-[var(--frank)] underline" href="./sealed/">
                  sealed page
                </a>{" "}
                either way, with its keys.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6">
          <Button variant="outline" onClick={onReset}>
            Seal another
          </Button>
        </div>
      </div>
    </div>
  );
}

function LinkBlock({
  label,
  hint,
  value,
}: {
  label: string;
  hint: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  const { play } = useSound();

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <Eyebrow>{label}</Eyebrow>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            play("copy");
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="font-mono text-[0.65rem] tracking-[0.2em] text-[var(--frank)] uppercase"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--paper-faint)]">{hint}</p>
      <p className="security-tint-dense mt-2 border border-[var(--ink-line)] px-3 py-3 font-mono text-xs break-all">
        {value}
      </p>
    </div>
  );
}
