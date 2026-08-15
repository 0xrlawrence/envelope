"use client";

import { useEffect, useState } from "react";
import {
  encodeClaimLink,
  encodeRefundLink,
  readEnvelope,
  type EnvelopeState,
} from "strk20-envelope";
import { Button, Callout, ExplorerLink } from "@/components/ui";
import {
  STRK,
  countdown,
  formatAmount,
  formatDeadline,
  middleTruncate,
  shortHex,
  timeAgo,
} from "@/lib/config";
import { recentEnvelopes, type FundedEnvelope } from "@/lib/activity";
import { appOrigin } from "@/lib/origin";
import { useSound } from "@/lib/sound";
import { useWallet } from "@/lib/wallet";
import { forget, recall, type SealRecord } from "@/lib/vault";

/**
 * Every envelope sealed from this browser.
 *
 * Sealing generates a key, funds the envelope, and shows a link. If anything
 * interrupts that between the signature and the link, the money is on-chain and
 * the only key to it is gone. This page exists so that cannot happen: keys are
 * written down before signing, and this is where they are read back.
 *
 * The organising idea is that an envelope is either still out there or it is
 * finished. One is a thing you act on and the other is a receipt, so they are
 * not given the same weight.
 */
export default function SealedPage() {
  const { network, provider } = useWallet();
  const [records, setRecords] = useState<SealRecord[]>([]);
  const [states, setStates] = useState<Record<string, EnvelopeState>>({});
  const [origin, setOrigin] = useState("");
  const [onChain, setOnChain] = useState<FundedEnvelope[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setOrigin(appOrigin());
    setRecords(recall(network.id));
  }, [network.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const record of records) {
        try {
          const state = await readEnvelope(
            provider,
            record.anonymizer,
            record.claimPublicKey,
          );
          if (!cancelled) {
            setStates((previous) => ({ ...previous, [record.claimPublicKey]: state }));
          }
        } catch {
          // Leave it unknown rather than claiming a status we do not have.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [records, provider]);

  useEffect(() => {
    let cancelled = false;
    recentEnvelopes(provider, network.anonymizer, network.pool)
      .then((found) => !cancelled && setOnChain(found))
      .catch(() => !cancelled && setOnChain([]));
    return () => {
      cancelled = true;
    };
  }, [provider, network.anonymizer, network.pool]);

  // One clock for the page rather than one per row, so the countdowns stay in
  // step with the grouping: an envelope whose window shuts while you are
  // looking at it has to move out of "send these" in the same frame its own
  // line stops saying it can be claimed.
  const funded = records.filter(
    (record) => states[record.claimPublicKey]?.status === "funded",
  );
  const ticking = funded.some((record) => (states[record.claimPublicKey]?.expiry ?? 0) > 0);

  useEffect(() => {
    if (!ticking) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);

  const open = (record: SealRecord) => {
    const expiry = states[record.claimPublicKey]?.expiry ?? 0;
    return expiry === 0 || Math.floor(now / 1000) < expiry;
  };
  const live = funded.filter(open);
  const reclaimable = funded.filter((record) => !open(record));
  const settled = records.filter((record) => {
    const status = states[record.claimPublicKey]?.status;
    return status === "claimed" || status === "refunded";
  });
  const unknown = records.filter((record) => {
    const status = states[record.claimPublicKey]?.status;
    return status === undefined || status === "none";
  });

  const refresh = () => setRecords(recall(network.id));

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="font-display text-4xl font-bold tracking-[-0.03em]">
        Sealed from this browser
      </h1>
      <p className="mt-3 max-w-[62ch] text-[var(--paper-dim)]">
        The key is the envelope, so it is written here before anything is signed and an
        interrupted seal cannot strand the money. Anyone holding a claim link can take
        the contents.
      </p>

      {origin.includes("localhost") && records.length > 0 ? (
        <div className="mt-6">
          <Callout tone="warn" title="These links only work on this machine">
            They point at <code className="font-mono">{origin}</code>. The envelopes are
            already on-chain and do not change; only the links do.
          </Callout>
        </div>
      ) : null}

      {records.length === 0 ? (
        <p className="mt-10 text-sm text-[var(--paper-faint)]">
          Nothing sealed from this browser on {network.label} yet.
        </p>
      ) : null}

      <Section title="Out there" count={live.length} hint="Send these. They can be claimed.">
        {live.map((record) => (
          <Row
            key={record.claimPublicKey}
            record={record}
            state={states[record.claimPublicKey]}
            origin={origin}
            now={now}
            network={network}
            onCleared={refresh}
          />
        ))}
      </Section>

      <Section
        title="Yours to take back"
        count={reclaimable.length}
        hint="The claim window shut with nobody opening them. The return link works now."
      >
        {reclaimable.map((record) => (
          <Row
            key={record.claimPublicKey}
            record={record}
            state={states[record.claimPublicKey]}
            origin={origin}
            now={now}
            network={network}
            onCleared={refresh}
          />
        ))}
      </Section>

      <Section
        title="Not landed"
        count={unknown.length}
        hint="No envelope on-chain against these keys. Kept in case a transaction arrives late."
      >
        {unknown.map((record) => (
          <Row
            key={record.claimPublicKey}
            record={record}
            state={states[record.claimPublicKey]}
            origin={origin}
            now={now}
            network={network}
            onCleared={refresh}
          />
        ))}
      </Section>

      <Section title="Finished" count={settled.length} hint="Receipts. Nothing to send.">
        {settled.map((record) => (
          <Row
            key={record.claimPublicKey}
            record={record}
            state={states[record.claimPublicKey]}
            origin={origin}
            now={now}
            network={network}
            onCleared={refresh}
          />
        ))}
      </Section>

      <div className="mt-14 border-t border-[var(--ink-line)] pt-8">
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">
          On this anonymizer
        </h2>
        <p className="mt-2 max-w-[62ch] text-sm text-[var(--paper-dim)]">
          Every envelope the contract has funded, from its own events. One funded through
          the pool carries the pool&rsquo;s events in the same transaction and is
          submitted by a relayer rather than by whoever funded it. That separation is the
          privacy claim, visible rather than asserted.
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
    </div>
  );
}

function Section({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count: number;
  hint: string;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="mt-10">
      <div className="flex items-baseline gap-3">
        <h2 className="field-label !text-[var(--paper-dim)]">{title}</h2>
        <span className="font-mono text-xs text-[var(--paper-faint)]">{count}</span>
      </div>
      <p className="mt-1 text-xs text-[var(--paper-faint)]">{hint}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Row({
  record,
  state,
  origin,
  now,
  network,
  onCleared,
}: {
  record: SealRecord;
  state?: EnvelopeState;
  origin: string;
  now: number;
  network: { explorer: string; id: string };
  onCleared: () => void;
}) {
  const status = state?.status;
  const spent = status === "claimed" || status === "refunded";
  // Locked envelopes are listed by their salt for the same reason they are sent
  // that way: this list is a copy of what was handed over, not a way round it.
  const claimLink = origin
    ? record.lockSalt
      ? encodeClaimLink(origin, record.lockSalt, "locked")
      : encodeClaimLink(origin, record.claimPrivateKey)
    : "";
  const refundLink = origin
    ? encodeRefundLink(origin, record.refundPrivateKey, record.claimPublicKey)
    : "";

  return (
    <div
      className={`row-enter border p-4 transition-colors duration-200 ${
        status === "funded"
          ? "border-[var(--ink-line)] bg-[var(--ink-raised)]"
          : "border-[var(--ink-line)]"
      } ${spent ? "opacity-55 hover:opacity-100" : ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-2xl font-bold tabular-nums">
          {formatAmount(BigInt(record.amount))}{" "}
          <span className="text-base font-semibold text-[var(--paper-dim)]">
            {STRK.symbol}
          </span>
          {record.memo ? (
            <span className="ml-3 font-mono text-xs font-normal text-[var(--paper-faint)]">
              {record.memo}
            </span>
          ) : null}
        </p>

        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs text-[var(--paper-faint)]">
            {timeAgo(record.createdAt)}
          </span>
          <StatusTag status={status} submitted={record.submitted} />
        </div>
      </div>

      {status === "funded" && state ? <Deadline expiry={state.expiry} now={now} /> : null}

      {/* Only a live envelope leads with something to send. A finished one is a
          receipt, and a link nobody can use should not be the loudest thing on
          the row. */}
      {status === "funded" ? (
        <div className="mt-4 space-y-3">
          <LinkRow label="Claim link" value={claimLink} action="Copy claim" emphasis />
          <LinkRow label="Return link" value={refundLink} action="Copy return" />
        </div>
      ) : (
        <details className="group mt-3">
          <summary className="cursor-pointer list-none font-display text-xs font-semibold tracking-[0.16em] text-[var(--paper-faint)] uppercase transition-colors duration-150 hover:text-[var(--paper-dim)]">
            Keys
            <span className="ml-2 font-mono tracking-normal normal-case group-open:hidden">
              show
            </span>
            <span className="ml-2 hidden font-mono tracking-normal normal-case group-open:inline">
              hide
            </span>
          </summary>
          <div className="mt-3 space-y-3">
            <LinkRow label="Claim link" value={claimLink} action="Copy claim" />
            <LinkRow label="Return link" value={refundLink} action="Copy return" />
          </div>
        </details>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {record.transactionHash ? (
          <ExplorerLink
            explorer={network.explorer}
            kind="tx"
            value={record.transactionHash}
          >
            {shortHex(record.transactionHash, 10, 6)}
          </ExplorerLink>
        ) : (
          <span className="font-mono text-xs text-[var(--paper-faint)]">no hash</span>
        )}
        <ClearButton
          onConfirm={() => {
            forget(record.claimPublicKey);
            onCleared();
          }}
        />
      </div>
    </div>
  );
}

/**
 * How long the recipient has left.
 *
 * After the amount, this is the fact that decides what you do with the row: a
 * link you can still send, or one that is now only good for taking the money
 * back. It ticks rather than rounding, because the whole reason for showing a
 * five minute window is to watch it run out.
 *
 * Only rendered for a funded envelope. On a settled one the window is history,
 * and on an envelope that never landed there is nothing on-chain to expire.
 */
function Deadline({ expiry, now }: { expiry: number; now: number }) {
  if (expiry === 0) {
    return (
      <p className="mt-1.5 font-mono text-xs text-[var(--paper-faint)]">
        No expiry. It waits indefinitely, and cannot be taken back.
      </p>
    );
  }

  const left = expiry - Math.floor(now / 1000);

  if (left <= 0) {
    return (
      <p className="mt-1.5 font-mono text-xs" title={formatDeadline(expiry)}>
        <span className="text-[var(--paper-faint)]">Claim window shut. </span>
        <span className="text-[var(--frank)]">Yours to take back.</span>
      </p>
    );
  }

  // Under an hour the window is the story, so it stops being quiet.
  const urgent = left < 3_600;

  return (
    <p className="mt-1.5 font-mono text-xs" title={`Closes ${formatDeadline(expiry)}`}>
      <span className="text-[var(--paper-faint)]">Closes in </span>
      <span
        className="tabular-nums transition-colors duration-300"
        style={{ color: urgent ? "var(--seal)" : "var(--paper-dim)" }}
      >
        {countdown(expiry, now)}
      </span>
    </p>
  );
}

function StatusTag({ status, submitted }: { status?: string; submitted: boolean }) {
  const label =
    status === undefined
      ? submitted
        ? "checking"
        : "never submitted"
      : status === "none"
        ? "not landed"
        : status;

  const colour =
    status === "funded"
      ? "var(--frank)"
      : status === "claimed"
        ? "var(--paper-dim)"
        : status === "none"
          ? "var(--seal)"
          : "var(--paper-faint)";

  return (
    <span
      className="font-display text-[0.65rem] font-semibold tracking-[0.18em] uppercase"
      style={{ color: colour }}
    >
      {label}
    </span>
  );
}

/**
 * A link, kept to one line, with the whole value on the clipboard.
 *
 * Wrapping a hash across two lines makes it unreadable and unscannable, and the
 * full string is never the thing being read: it is the thing being copied.
 */
function LinkRow({
  label,
  value,
  action,
  emphasis = false,
}: {
  label: string;
  value: string;
  /** Named, because the two buttons on a row copy very different things. */
  action: string;
  emphasis?: boolean;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const { play } = useSound();

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-display text-[0.65rem] font-semibold tracking-[0.2em] text-[var(--paper-faint)] uppercase">
          {label}
        </span>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              play("copy");
              setCopyState("copied");
            } catch {
              play("error");
              setCopyState("failed");
            }
            window.setTimeout(() => setCopyState("idle"), 1400);
          }}
          className="font-display text-[0.65rem] font-semibold tracking-[0.2em] uppercase transition-[color,transform] duration-150 ease-out active:scale-95"
          style={{ color: copyState === "idle" ? "var(--paper-dim)" : "var(--frank)" }}
          aria-live="polite"
        >
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : action}
        </button>
      </div>
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        title={value}
        className={`mt-1 block truncate font-mono text-xs underline decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-[var(--frank)] ${
          emphasis ? "text-[var(--paper)]" : "text-[var(--paper-faint)]"
        }`}
      >
        {middleTruncate(value)}
      </a>
    </div>
  );
}

/**
 * Clearing throws away the only key to an envelope, so it asks once.
 *
 * A single quiet click sitting next to a link is too easy to hit by accident
 * for something with no undo.
 */
function ClearButton({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <Button
      variant="quiet"
      className="!px-0 !py-1 !text-[0.65rem]"
      style={{ color: armed ? "var(--seal)" : undefined }}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
    >
      {armed ? "Delete the key?" : "Clear"}
    </Button>
  );
}
