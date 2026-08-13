"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildFundActions,
  encodeClaimLink,
  encodeRefundLink,
  generateEnvelopeKey,
  type EnvelopeKeyPair,
} from "strk20-envelope";
import { EnvelopeCard } from "@/components/EnvelopeCard";
import {
  EnvelopeStage,
  type EnvelopeStageHandle,
} from "@/components/EnvelopeStage";
import { Button, Callout, Eyebrow, ExplorerLink, Field, Mono } from "@/components/ui";
import {
  DENOMINATIONS,
  EXPIRY_CHOICES,
  STRK,
  formatAmount,
  toSmallestUnit,
} from "@/lib/config";
import { useWallet } from "@/lib/wallet";

interface SealedEnvelope {
  claim: EnvelopeKeyPair;
  refund: EnvelopeKeyPair;
  amount: bigint;
  transactionHash: string;
}

export default function CreatePage() {
  const { account, address, network, supportsStrk20 } = useWallet();

  const [denomination, setDenomination] = useState(DENOMINATIONS[2]!);
  const [expirySeconds, setExpirySeconds] = useState(EXPIRY_CHOICES[2]!.seconds);
  const [memo, setMemo] = useState("");

  const stageRef = useRef<EnvelopeStageHandle | null>(null);
  const [shieldedBalance, setShieldedBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<"" | "shielding" | "sealing">("");
  const [error, setError] = useState("");
  const [sealed, setSealed] = useState<SealedEnvelope | null>(null);

  const amount = toSmallestUnit(denomination);

  const refreshBalance = useCallback(async () => {
    if (!account || !supportsStrk20) return;
    try {
      const balances = await account.strk20Balances([STRK.address]);
      const entry = balances.find(
        (candidate: { token: string }) =>
          BigInt(candidate.token) === BigInt(STRK.address),
      );
      setShieldedBalance(entry ? BigInt(entry.balance) : 0n);
    } catch {
      setShieldedBalance(null);
    }
  }, [account, supportsStrk20]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  async function shield() {
    if (!account) return;
    setBusy("shielding");
    setError("");
    try {
      await account.strk20InvokeTransaction([
        { type: "deposit", token: STRK.address, amount: "0x" + amount.toString(16) },
      ]);
      await refreshBalance();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Shielding failed.");
    } finally {
      setBusy("");
    }
  }

  async function seal() {
    if (!account) return;
    setBusy("sealing");
    setError("");

    // Fresh keys per envelope. Two envelopes from the same funder share no key
    // material, so nothing on-chain ties them to each other.
    const claim = generateEnvelopeKey();
    const refund = generateEnvelopeKey();

    try {
      const actions = buildFundActions({
        anonymizer: network.anonymizer,
        token: STRK.address,
        amount,
        claimPublicKey: claim.publicKey,
        refundPublicKey: refund.publicKey,
        expiry: expirySeconds === 0 ? 0 : Math.floor(Date.now() / 1000) + expirySeconds,
        memo: memo.slice(0, 31),
      });

      const { transaction_hash } = await account.strk20InvokeTransaction(actions);

      // Strike the seal before the links appear. The envelope closing is the
      // acknowledgement that the money has moved; showing the links first would
      // make the animation a decoration played over an already finished job.
      await stageRef.current?.seal();

      setSealed({ claim, refund, amount, transactionHash: transaction_hash });
      void refreshBalance();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sealing failed.");
    } finally {
      setBusy("");
    }
  }

  if (sealed) {
    return <SealedView sealed={sealed} onReset={() => setSealed(null)} />;
  }

  const notDeployed = network.anonymizer === "";
  const short = shieldedBalance !== null && shieldedBalance < amount;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-14 lg:grid lg:grid-cols-[1fr_1fr] lg:items-start">
      <div className="order-2 lg:sticky lg:top-10 lg:order-first">
        <EnvelopeStage
          handleRef={stageRef}
          amount={denomination.toString()}
          symbol={STRK.symbol}
          reference={memo || undefined}
          caption="Sealed against a key that exists only in the link. Whoever opens it takes the contents: into their own shielded balance, or to any address."
        />

        <dl className="mt-8 space-y-3 text-sm">
          <HiddenRow hidden>Who funded it</HiddenRow>
          <HiddenRow hidden>Who claims it, if they claim privately</HiddenRow>
          <HiddenRow>The amount, on both legs</HiddenRow>
          <HiddenRow>The recipient, if they claim to a public address</HiddenRow>
        </dl>
      </div>

      <div className="order-1">
        <h1 className="font-display text-5xl leading-[1.02] font-bold tracking-[-0.03em] text-balance">
          Private money you can send as a link.
        </h1>
        <p className="mt-5 max-w-[62ch] text-[var(--paper-dim)]">
          A STRK20 private transfer needs a registered recipient. An envelope does not.
          It pays someone who has never touched Starknet, and the pool still hides who
          paid.
        </p>

        <div className="mt-10">
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

        <div className="mt-8 space-y-4">
          {!address ? (
            <Callout title="Not connected">
              Connect a STRK20-capable wallet to seal an envelope. Ready has privacy live
              on mainnet.
            </Callout>
          ) : null}

          {address && !supportsStrk20 ? (
            <Callout tone="warn" title="Wallet cannot do STRK20">
              This wallet does not report Wallet API 0.10.3, so it cannot shield or seal.
              It can still <a href="/claim">claim an envelope</a> to a public address.
            </Callout>
          ) : null}

          {notDeployed ? (
            <Callout tone="bad" title="Not deployed here">
              No Envelope anonymizer on {network.label} yet. Switch networks in your
              wallet.
            </Callout>
          ) : null}

          {shieldedBalance !== null ? (
            <p className="font-mono text-xs tracking-widest text-[var(--paper-faint)] uppercase">
              Shielded balance: {formatAmount(shieldedBalance)} {STRK.symbol}
            </p>
          ) : null}

          {error ? <Callout tone="bad" title="Failed">{error}</Callout> : null}

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={seal}
              disabled={!address || !supportsStrk20 || notDeployed || busy !== "" || short}
            >
              {busy === "sealing" ? "Sealing…" : "Seal envelope"}
            </Button>

            {short ? (
              <Button variant="outline" onClick={shield} disabled={busy !== ""}>
                {busy === "shielding"
                  ? "Shielding…"
                  : `Shield ${denomination.toString()} ${STRK.symbol} first`}
              </Button>
            ) : null}
          </div>

          {busy === "sealing" ? (
            <p className="text-sm text-[var(--paper-dim)]">
              Your wallet is proving the transaction. This takes around half a minute,
              because a STARK proof is generated before anything is submitted.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HiddenRow({ children, hidden = false }: { children: string; hidden?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-dotted border-[var(--ink-line)] pb-3">
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
    <div className="mx-auto grid max-w-5xl gap-12 px-6 py-14 lg:grid-cols-[1fr_1fr] lg:items-start">
      <div className="animate-flap">
        <EnvelopeCard amount={formatAmount(sealed.amount)} symbol={STRK.symbol} sealed />
      </div>

      <div>
        <h1 className="font-display text-5xl leading-[1.02] font-bold tracking-[-0.03em]">Hand it over.</h1>
        <p className="mt-5 max-w-[62ch] text-[var(--paper-dim)]">
          The key lives in the part of the URL after the <Mono>#</Mono>, which browsers
          never send to a server. It has not reached ours, and it will not reach the
          recipient&rsquo;s either.
        </p>

        <div className="mt-8 space-y-6">
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

        <div className="mt-8 border-t border-[var(--ink-line)] pt-6">
          <Eyebrow>Funding transaction</Eyebrow>
          <div className="mt-2">
            <ExplorerLink explorer={network.explorer} kind="tx" value={sealed.transactionHash}>
              {sealed.transactionHash}
            </ExplorerLink>
          </div>
        </div>

        <div className="mt-8">
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
