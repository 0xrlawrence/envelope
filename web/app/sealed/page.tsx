"use client";

import { useEffect, useState } from "react";
import {
  encodeClaimLink,
  encodeRefundLink,
  readEnvelope,
  type EnvelopeState,
} from "strk20-envelope";
import { Reel } from "@/components/Reel";
import { Tabs } from "@/components/Tabs";
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
import {
  classifyFunding,
  fundedLedger,
  recentFrom,
  type FundedEnvelope,
  type FundedLedger,
} from "@/lib/activity";
import { crowdFor, crowdSizes, type Crowd } from "@/lib/anonymity";
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
  // Every funding the contract has emitted, which is what both the crowd
  // figures and the list below are counted from. One scan serves both.
  const [ledger, setLedger] = useState<FundedLedger | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Yours first. The other tab is the same contract seen from outside, which is
  // worth showing but is not what anyone opens this page to do.
  const [tab, setTab] = useState<"mine" | "chain">("mine");
  // These work queues are mutually exclusive: hand the claim link over, take
  // the envelope back, investigate one that never landed, or read a receipt.
  // Tabs keep any one backlog from pushing the other jobs out of sight.
  const [actionTab, setActionTab] = useState<
    "out" | "return" | "failed" | "finished"
  >("out");

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
    (async () => {
      try {
        const found = await fundedLedger(
          provider,
          network.anonymizer,
          network.firstBlock,
        );
        if (cancelled) return;
        // Published before the classification below, which costs a receipt per
        // envelope. The crowd figures do not need it, and holding them back
        // behind a dozen round trips would leave the rows saying nothing for
        // several seconds after the answer was already in hand.
        setLedger(found);

        const classified = await classifyFunding(
          provider,
          network.pool,
          recentFrom(found),
        );
        if (!cancelled) setOnChain(classified);
      } catch {
        if (cancelled) return;
        setLedger({ records: [], scannedFrom: network.firstBlock, complete: false });
        setOnChain([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider, network.anonymizer, network.pool, network.firstBlock]);

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
    <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6 sm:py-10">
      {/* The reel is placed out of flow, anchored to the right of the heading
          and the tabs together. In flow it would have to take its width from
          somewhere, and the only thing next to it is the tab rule, which runs
          the width of the page on purpose. Absolute keeps that rule intact and
          lets the object sit in the empty half of the row beside it. Hidden on
          a phone, where there is no empty half. */}
      <div className="relative">
        <div
          aria-hidden
          /* Centred with auto margins rather than a translate. `translate` is
             its own CSS property and, like `transform`, it opens a stacking
             context, which isolates the blend below to this box: the black in
             the footage then has only its own transparent container to blend
             against, and stays a black rectangle. Auto margins against a full
             inset centre it just as well and leave the video blending against
             the page. */
          className="reel pointer-events-none absolute inset-y-0 right-0 my-auto hidden h-fit w-[clamp(7rem,17vw,10.5rem)] sm:block"
        >
          <Reel />
        </div>

        <h1 className="headline">Envelopes.</h1>

        <div className="mt-3 sm:mt-6">
          <Tabs
            label="Envelopes"
            active={tab}
            onSelect={(id) => setTab(id as "mine" | "chain")}
            tabs={[
              { id: "mine", label: "From this browser", count: records.length },
              {
                id: "chain",
                label: "On this anonymizer",
                // The whole ledger, not the handful listed below it. The list is
                // capped for reading; the tab is answering how many exist.
                count: ledger?.records.length,
              },
            ]}
          />
        </div>
      </div>

      <div
        role="tabpanel"
        id="panel-mine"
        aria-labelledby="tab-mine"
        hidden={tab !== "mine"}
      >
      <p className="mt-3 max-w-[62ch] text-[0.78rem] leading-snug text-[var(--paper-dim)] sm:mt-6 sm:text-base sm:leading-normal">
        The key is the envelope, so it is written here before anything is signed and an
        interrupted seal cannot strand the money. Anyone holding a claim link can take
        the contents.
      </p>

      {origin.includes("localhost") && records.length > 0 ? (
        <div className="mt-3 sm:mt-6">
          <Callout tone="warn" title="These links only work on this machine">
            They point at <code className="font-mono">{origin}</code>. The envelopes are
            already on-chain and do not change; only the links do.
          </Callout>
        </div>
      ) : null}

      {records.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--paper-faint)] sm:mt-10">
          Nothing sealed from this browser on {network.label} yet.
        </p>
      ) : null}

      {records.length > 0 ? (
        <div className="mt-5 sm:mt-10">
          <Tabs
            label="Envelope actions"
            active={actionTab}
            onSelect={(id) =>
              setActionTab(id as "out" | "return" | "failed" | "finished")
            }
            tabs={[
              { id: "out", label: "Out there", count: live.length, tone: "send" },
              {
                id: "return",
                label: "Yours to take back",
                count: reclaimable.length,
                tone: "frank",
              },
              {
                id: "failed",
                label: "Not landed (Failed TXNS)",
                count: unknown.length,
                tone: "seal",
              },
              {
                id: "finished",
                label: "Finished",
                count: settled.length,
                tone: "credit",
              },
            ]}
          />

          <div
            role="tabpanel"
            id="panel-out"
            aria-labelledby="tab-out"
            hidden={actionTab !== "out"}
          >
            <p className="mt-2 text-[0.7rem] text-[var(--paper-faint)] sm:mt-3 sm:text-xs">
              Send these. They can be claimed.
            </p>
            {live.length > 0 ? (
              <div className="mt-2.5 space-y-2 sm:mt-4 sm:space-y-3">
                {live.map((record) => (
                  <Row
                    key={record.claimPublicKey}
                    record={record}
                    state={states[record.claimPublicKey]}
                    crowd={ledger ? crowdFor(ledger, record.claimPublicKey) : undefined}
                    origin={origin}
                    now={now}
                    network={network}
                    onCleared={refresh}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--paper-faint)] sm:mt-4">
                No envelopes waiting to be claimed.
              </p>
            )}
          </div>

          <div
            role="tabpanel"
            id="panel-return"
            aria-labelledby="tab-return"
            hidden={actionTab !== "return"}
          >
            <p className="mt-2 text-[0.7rem] text-[var(--paper-faint)] sm:mt-3 sm:text-xs">
              The claim window shut with nobody opening them. The return link works now.
            </p>
            {reclaimable.length > 0 ? (
              <div className="mt-2.5 space-y-2 sm:mt-4 sm:space-y-3">
                {reclaimable.map((record) => (
                  <Row
                    key={record.claimPublicKey}
                    record={record}
                    state={states[record.claimPublicKey]}
                    crowd={ledger ? crowdFor(ledger, record.claimPublicKey) : undefined}
                    origin={origin}
                    now={now}
                    network={network}
                    onCleared={refresh}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--paper-faint)] sm:mt-4">
                Nothing ready to take back.
              </p>
            )}
          </div>

          <div
            role="tabpanel"
            id="panel-failed"
            aria-labelledby="tab-failed"
            hidden={actionTab !== "failed"}
          >
            <p className="mt-2 text-[0.7rem] text-[var(--paper-faint)] sm:mt-3 sm:text-xs">
              No envelope on-chain against these keys. Kept in case a transaction arrives
              late.
            </p>
            {unknown.length > 0 ? (
              <div className="mt-2.5 space-y-2 sm:mt-4 sm:space-y-3">
                {unknown.map((record) => (
                  <Row
                    key={record.claimPublicKey}
                    record={record}
                    state={states[record.claimPublicKey]}
                    crowd={ledger ? crowdFor(ledger, record.claimPublicKey) : undefined}
                    origin={origin}
                    now={now}
                    network={network}
                    onCleared={refresh}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--paper-faint)] sm:mt-4">
                No transactions are waiting to land.
              </p>
            )}
          </div>

          <div
            role="tabpanel"
            id="panel-finished"
            aria-labelledby="tab-finished"
            hidden={actionTab !== "finished"}
          >
            <p className="mt-2 text-[0.7rem] text-[var(--paper-faint)] sm:mt-3 sm:text-xs">
              Receipts. Nothing to send.
            </p>
            {settled.length > 0 ? (
              <div className="mt-2.5 space-y-2 sm:mt-4 sm:space-y-3">
                {settled.map((record) => (
                  <Row
                    key={record.claimPublicKey}
                    record={record}
                    state={states[record.claimPublicKey]}
                    crowd={ledger ? crowdFor(ledger, record.claimPublicKey) : undefined}
                    origin={origin}
                    now={now}
                    network={network}
                    onCleared={refresh}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--paper-faint)] sm:mt-4">
                No finished envelopes yet.
              </p>
            )}
          </div>
        </div>
      ) : null}

      </div>

      <div
        role="tabpanel"
        id="panel-chain"
        aria-labelledby="tab-chain"
        hidden={tab !== "chain"}
      >
        <p className="mt-3 max-w-[62ch] text-[0.75rem] leading-snug text-[var(--paper-dim)] sm:mt-6 sm:text-sm sm:leading-normal">
          Every envelope the contract has funded, from its own events. One funded through
          the pool carries the pool&rsquo;s events in the same transaction and is
          submitted by a relayer rather than by whoever funded it. That separation is the
          privacy claim, visible rather than asserted.
        </p>

        {ledger && ledger.records.length > 0 ? <CrowdSizes ledger={ledger} /> : null}

        {onChain === null ? (
          <p className="mt-3 text-sm text-[var(--paper-faint)] sm:mt-4">Reading the chain…</p>
        ) : onChain.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--paper-faint)] sm:mt-4">
            No envelopes funded on this contract yet.
          </p>
        ) : (
          <div className="mt-3 space-y-1.5 sm:mt-5 sm:space-y-2">
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

            {ledger && ledger.records.length > onChain.length ? (
              <p className="pt-1 font-mono text-xs text-[var(--paper-faint)]">
                The {onChain.length} most recent of {ledger.complete ? "" : "at least "}
                {ledger.records.length}.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  record,
  state,
  crowd,
  origin,
  now,
  network,
  onCleared,
}: {
  record: SealRecord;
  state?: EnvelopeState;
  /** Null once the chain has been read and this envelope is not on it. */
  crowd?: Crowd | null;
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
      className={`row-enter border p-2.5 transition-colors duration-200 sm:p-4 ${
        status === "funded"
          ? "border-[var(--ink-line)] bg-[var(--ink-raised)]"
          : "border-[var(--ink-line)]"
      } ${spent ? "opacity-55 hover:opacity-100" : ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-lg font-bold tabular-nums sm:text-2xl">
          {formatAmount(BigInt(record.amount))}{" "}
          <span className="text-sm font-semibold text-[var(--paper-dim)] sm:text-base">
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

      {/* Only on a live envelope. On a receipt the crowd is history and there
          is nothing left to decide; here it is the second half of the question
          the countdown asks, which is whether to hand the link over now. */}
      {status === "funded" && crowd ? <CrowdLine crowd={crowd} /> : null}

      {/* Only a live envelope leads with something to send. A finished one is a
          receipt, and a link nobody can use should not be the loudest thing on
          the row. */}
      {status === "funded" ? (
        <div className="mt-3 space-y-2.5 sm:mt-4 sm:space-y-3">
          <LinkRow label="Claim link" value={claimLink} action="Copy claim" emphasis />
          <LinkRow label="Return link" value={refundLink} action="Copy return" />
        </div>
      ) : (
        <details className="group mt-2.5 sm:mt-3">
          <summary className="cursor-pointer list-none font-display text-xs font-semibold tracking-[0.16em] text-[var(--paper-faint)] uppercase transition-colors duration-150 hover:text-[var(--paper-dim)]">
            Keys
            <span className="ml-2 font-mono tracking-normal normal-case group-open:hidden">
              show
            </span>
            <span className="ml-2 hidden font-mono tracking-normal normal-case group-open:inline">
              hide
            </span>
          </summary>
          <div className="mt-2.5 space-y-2.5 sm:mt-3 sm:space-y-3">
            <LinkRow label="Claim link" value={claimLink} action="Copy claim" />
            <LinkRow label="Return link" value={refundLink} action="Copy return" />
          </div>
        </details>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 sm:mt-4 sm:gap-3">
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

/**
 * How much company an envelope is keeping.
 *
 * An envelope's funding and its claim carry the same public amount, so a
 * distinctive figure links the two and narrows the set of funders a claim could
 * have come from. What stands between that link and a name is every other
 * envelope funded at the same size, which is why the app offers a short list of
 * round denominations rather than an open field.
 *
 * The second figure is the one that keeps moving. The crowd an envelope was
 * sealed into is fixed at that moment, but each envelope of the same size
 * funded afterwards is one more transaction an observer has to tell apart from
 * yours on timing alone. Sealing into a quiet hour and handing the link over
 * straight away is the case this exists to make visible, and it is not visible
 * anywhere else: nothing else on the page changes after the envelope is sealed.
 */
function CrowdLine({ crowd }: { crowd: Crowd }) {
  const tone =
    crowd.cover === "none"
      ? "var(--seal)"
      : crowd.cover === "thin"
        ? "var(--frank)"
        : "var(--credit)";

  // A truncated scan can only ever undercount, so its figures are floors. Saying
  // so matters more here than anywhere else on the page, because the number
  // being read is the one that decides whether an envelope looks safe to send.
  const least = crowd.partial ? "at least " : "";

  // Keyed on the count rather than on the band, so the sentence stays true if
  // the bands are ever retuned. One envelope of a size is the only claim here
  // that is structural rather than a judgement, and it should read that way.
  if (crowd.size === 1) {
    return (
      <p
        className="mt-1.5 font-mono text-xs"
        title="Nothing else of this size has been funded on this contract, so the amount on the claim ties straight back to the funding."
      >
        <span style={{ color: tone }}>Only envelope of this size. </span>
        <span className="text-[var(--paper-faint)]">Nothing to be mistaken for.</span>
      </p>
    );
  }

  return (
    <p
      className="mt-1.5 font-mono text-xs"
      title={`Both legs of an envelope carry the same public amount, so every envelope funded at this size is one this claim could have come from. ${crowd.after} of them were funded after yours.`}
    >
      <span className="text-[var(--paper-faint)]">One of {least}</span>
      <span className="tabular-nums" style={{ color: tone }}>
        {crowd.size}
      </span>
      <span className="text-[var(--paper-faint)]"> envelopes of this size. </span>
      {crowd.after > 0 ? (
        <>
          <span className="tabular-nums text-[var(--credit)]">{crowd.after}</span>
          <span className="text-[var(--paper-faint)]"> sealed after yours.</span>
        </>
      ) : (
        <span className="text-[var(--paper-faint)]">None sealed since.</span>
      )}
    </p>
  );
}

/**
 * Every denomination the contract holds, and how many sit at each.
 *
 * The same figure a row shows, read the other way round: not how well one
 * envelope is hidden, but which sizes on this contract hide anything at all.
 * That is worth knowing before sealing rather than after, which is the one
 * thing the per-row line cannot do.
 */
function CrowdSizes({ ledger }: { ledger: FundedLedger }) {
  const sizes = crowdSizes(ledger);
  if (sizes.length === 0) return null;

  const largest = sizes.reduce((most, size) => Math.max(most, size.count), 0);

  return (
    <div className="mt-3 border border-[var(--ink-line)] bg-[var(--ink-raised)] p-3 sm:mt-5 sm:p-4">
      <p className="field-label">
        Crowd by size{ledger.complete ? "" : " (at least)"}
      </p>
      <p className="mt-1.5 max-w-[58ch] text-[0.72rem] leading-snug text-[var(--paper-faint)] sm:text-xs">
        Funding and claiming carry the same public amount, so everything sealed at one
        size is the crowd a claim of that size could have come from. A size holding a
        single envelope hides nobody.
      </p>

      <ul className="mt-2.5 space-y-1.5 sm:mt-3.5 sm:space-y-2">
        {sizes.map((size) => (
          <li key={`${size.token}:${size.amount}`} className="flex items-center gap-2.5 sm:gap-3">
            <span className="w-[5.5rem] shrink-0 text-right font-mono text-xs tabular-nums text-[var(--paper-dim)]">
              {formatAmount(size.amount, STRK, 5)} {STRK.symbol}
            </span>
            <span
              className="h-2 flex-1 bg-[var(--ink-line)]"
              role="presentation"
            >
              {/* Floored at a sliver rather than scaled to nothing: a size with
                  one envelope in it is the case worth seeing, and a bar too
                  short to render would hide exactly that. */}
              <span
                className="block h-full transition-[width] duration-500 ease-out"
                style={{
                  width: `max(3px, ${(size.count / largest) * 100}%)`,
                  backgroundColor: size.count > 1 ? "var(--frank)" : "var(--seal)",
                }}
              />
            </span>
            <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--paper)]">
              {size.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
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
        <span className="font-display text-[0.65rem] font-semibold tracking-[0.2em] text-[var(--frank)] uppercase">
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
          /* Handing the link over is what this page is for, and on a phone the
             control for it was a 10px word with no hit area of its own. */
          className="inline-flex min-h-11 items-center border px-2.5 font-display text-[0.65rem] font-semibold tracking-[0.18em] uppercase transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-95 sm:min-h-9 sm:px-3"
          style={{
            backgroundColor:
              copyState === "copied"
                ? "var(--credit)"
                : copyState === "failed"
                  ? "var(--seal)"
                  : "var(--frank)",
            borderColor:
              copyState === "copied"
                ? "var(--credit)"
                : copyState === "failed"
                  ? "var(--seal)"
                  : "var(--frank)",
            color: "var(--ink-deep)",
          }}
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
