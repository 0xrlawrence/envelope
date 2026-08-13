"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildFundActions,
  buildShieldActions,
  felt,
  feltTokens,
  encodeClaimLink,
  encodeRefundLink,
  generateEnvelopeKey,
  type EnvelopeKeyPair,
} from "strk20-envelope";
import { EnvelopeCard } from "@/components/EnvelopeCard";
import { Button, Callout, Eyebrow, ExplorerLink, Field, Mono } from "@/components/ui";
import {
  DENOMINATIONS,
  EXPIRY_CHOICES,
  STRK,
  formatAmount,
  toSmallestUnit,
} from "@/lib/config";
import { explainWalletError } from "@/lib/errors";
import { looksUnimplemented, useWallet } from "@/lib/wallet";

interface SealedEnvelope {
  claim: EnvelopeKeyPair;
  refund: EnvelopeKeyPair;
  amount: bigint;
  transactionHash: string;
}

export default function CreatePage() {
  const { account, address, network, provider, supportsStrk20, strk20Reason, walletName } =
    useWallet();

  const [denomination, setDenomination] = useState(DENOMINATIONS[2]!);
  const [expirySeconds, setExpirySeconds] = useState(EXPIRY_CHOICES[2]!.seconds);
  const [memo, setMemo] = useState("");

  const [shieldedBalance, setShieldedBalance] = useState<bigint | null>(null);
  const [publicBalance, setPublicBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<"" | "shielding" | "sealing">("");
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [sealed, setSealed] = useState<SealedEnvelope | null>(null);

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
    } catch {
      setShieldedBalance(null);
    }
  }, [account, address, provider, supportsStrk20]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

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

  async function seal() {
    if (!account) return;
    setBusy("sealing");
    setError("");
    setErrorDetail("");

    // Fresh keys per envelope. Two envelopes from the same funder share no key
    // material, so nothing on-chain ties them to each other.
    const claim = generateEnvelopeKey();
    const refund = generateEnvelopeKey();

    try {
      const actions = buildFundActions({
        anonymizer: network.anonymizer,
        token: STRK.address,
        amount,
        // Spend a note if one is already there, otherwise shield and seal in
        // the same transaction rather than making the user do it twice.
        fundFrom: (shieldedBalance ?? 0n) >= amount ? "shielded" : "wallet",
        claimPublicKey: claim.publicKey,
        refundPublicKey: refund.publicKey,
        expiry: expirySeconds === 0 ? 0 : Math.floor(Date.now() / 1000) + expirySeconds,
        memo: memo.slice(0, 31),
      });

      // Dry run first. This builds and proves the same actions without
      // submitting, which is the only way from outside the wallet to tell a
      // malformed request apart from a backend that cannot complete it. A
      // failure here is ours; a failure only on submit is not.
      try {
        await account.strk20PrepareInvoke(actions, true);
      } catch (dryRun) {
        const explained = explainWalletError(dryRun);
        setError(`Rejected before submitting: ${explained.message}`);
        setErrorDetail(`${explained.raw} (during strk20PrepareInvoke, simulate mode)`);
        console.error("[envelope] dry run failed", dryRun, actions);
        setBusy("");
        return;
      }

      const { transaction_hash } = await account.strk20InvokeTransaction(actions);
      setSealed({ claim, refund, amount, transactionHash: transaction_hash });
      void refreshBalance();
    } catch (cause) {
      // The wallet's own wording is rarely actionable, so it is translated and
      // the original kept alongside for anyone reporting the problem.
      const explained = explainWalletError(cause);
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
          fundFrom: (shieldedBalance ?? 0n) >= amount ? "shielded" : "wallet",
        }),
      });
    } finally {
      setBusy("");
    }
  }

  if (sealed) {
    return <SealedView sealed={sealed} onReset={() => setSealed(null)} />;
  }

  const notDeployed = network.anonymizer === "";
  const fromWallet = (shieldedBalance ?? 0n) < amount;
  // Enough to seal, from wherever it has to come.
  const funded =
    (shieldedBalance ?? 0n) >= amount || (publicBalance !== null && publicBalance >= amount);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-[clamp(1.5rem,5vh,4rem)] px-6 py-[clamp(0.75rem,3.4vh,3rem)] lg:grid lg:grid-cols-[1fr_1fr] lg:items-center">
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

          <Field label="Claim window" hint="After it shuts, only you can reclaim">
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
          </Field>

          <Field label="Reference" hint="Public. Keep it dull.">
            <input
              value={memo}
              maxLength={31}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="bounty-142"
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
            <Callout tone="warn" title={`${walletName || "This wallet"} cannot do STRK20`}>
              <p>
                Shielding and sealing are served by the wallet, and this one does not
                implement them. <strong>Ready</strong> is the wallet with STRK20
                privacy live. Braavos and Xverse do not expose it to dapps yet.
              </p>
              {strk20Reason ? (
                <p className="mt-2 font-mono text-xs break-all text-[var(--paper-faint)]">
                  {walletName || "Wallet"} said: {strk20Reason}
                </p>
              ) : null}
              <p className="mt-2">
                This wallet can still <a href="/claim">claim an envelope</a> to a public
                address.
              </p>
            </Callout>
          ) : null}

          {notDeployed ? (
            <Callout tone="bad" title="Not deployed here">
              No Envelope anonymizer on {network.label} yet. Switch networks in your
              wallet.
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
              disabled={
                !address || !supportsStrk20 || notDeployed || busy !== "" || !funded
              }
            >
              {busy === "sealing" ? "Sealing…" : "Seal envelope"}
            </Button>
          </div>

          {busy === "sealing" ? (
            <p className="text-sm text-[var(--paper-dim)]">
              {fromWallet
                ? "Shielding and sealing in one transaction. "
                : "Spending a shielded note. "}
              Your wallet is proving it, which takes around half a minute, because a
              STARK proof is generated before anything is submitted.
            </p>
          ) : null}
        </div>
      </div>
    </div>
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
  useEffect(() => setOrigin(window.location.origin), []);

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
        <h1 className="font-display text-[clamp(1.9rem,4.6vh,3.25rem)] leading-[1.03] font-bold tracking-[-0.03em]">Hand it over.</h1>
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
            <ExplorerLink explorer={network.explorer} kind="tx" value={sealed.transactionHash}>
              {sealed.transactionHash}
            </ExplorerLink>
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

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <Eyebrow>{label}</Eyebrow>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(value);
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
