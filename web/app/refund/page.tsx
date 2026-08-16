"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildRefundActions,
  decodeRefundFragment,
  readEnvelope,
  readEnvelopeHistory,
  resolveOpenNoteId,
  type EnvelopeState,
} from "strk20-envelope";
import { Approvals } from "@/components/Approvals";
import { EnvelopeCard } from "@/components/EnvelopeCard";
import { Receipt } from "@/components/Receipt";
import { SendOff } from "@/components/SendOff";
import { Button, Callout, ExplorerLink, LinkButton } from "@/components/ui";
import { STRK, formatAmount } from "@/lib/config";
import { looksRejected } from "@/lib/errors";
import { useSound } from "@/lib/sound";
import { useWallet } from "@/lib/wallet";
import { watchEnvelope } from "@/lib/watch";

export default function RefundPage() {
  const { account, address, network, provider, supportsStrk20 } = useWallet();
  const { play } = useSound();

  const [refundKey, setRefundKey] = useState<string | null>(null);
  const [claimPublicKey, setClaimPublicKey] = useState("");
  const [envelope, setEnvelope] = useState<EnvelopeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [transactionHash, setTransactionHash] = useState("");
  const [phase, setPhase] = useState<"idle" | "flying" | "sent" | "returned" | "failed">(
    "idle",
  );
  const [flightDone, setFlightDone] = useState(false);
  /**
   * Which wallet prompt is outstanding.
   *
   * A return costs two approvals, not one. The first assembles the transaction
   * so the wallet can say which open note the value will land in; the second
   * signs the real thing. During the flight the page is faded out, so without
   * this the second prompt arrives with nothing on screen to explain it and
   * looks like the wallet asking twice for the same thing.
   */
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (error && phase === "idle") play("error");
  }, [error, phase, play]);

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
    // Reset, so a second attempt after a declined one flies again rather than
    // silently doing nothing visible.
    setFlightDone(false);
    setStep(1);
    setPhase("flying");

    /**
     * Watch the contract, starting now.
     *
     * The wallet's promise is not the event worth waiting on. It proves, hands
     * the transaction to a relayer, and then waits on its own confirmation, so
     * it can be held for many minutes after the return is already mined. The
     * envelope id is known here without asking the wallet anything, so the
     * chain answers first and the flight ends when the money is actually back.
     */
    const watch = { cancelled: false, found: false };
    const watching = watchEnvelope(
      provider,
      network.anonymizer,
      claimPublicKey,
      (state) => state.status === "refunded",
      watch,
    );

    void watching.then(async (state) => {
      if (!state) return;
      setPhase("sent");
      void load();
      const events = await readEnvelopeHistory(
        provider,
        network.anonymizer,
        claimPublicKey,
        network.firstBlock,
      );
      const settled = events.find((event) => event.kind === "refunded");
      if (settled) setTransactionHash(settled.transactionHash);
    });

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

      setStep(2);
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
      setStep(3);

      // Usually already resolved by the time the wallet gets here.
      if (!(await watching)) {
        setPhase("failed");
        setError(
          "The return was submitted but has not come back on-chain yet. The key is kept on the sealed page; try again from there in a minute.",
        );
      }
    } catch (cause) {
      // A wallet can fail on a transaction it has already landed, and the chain
      // is the authority, so a found envelope outranks any error it reports.
      if (watch.found) return;

      if (looksRejected(cause)) {
        watch.cancelled = true;
        setPhase("returned");
        setError("You declined this in your wallet. Nothing was sent and nothing moved.");
        return;
      }

      const late = await Promise.race([
        watching,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 12_000)),
      ]);
      if (late || watch.found) return;

      setPhase("failed");
      setError(cause instanceof Error ? cause.message : "The return failed.");
    } finally {
      setBusy(false);
    }
  }

  const flying = phase !== "idle" && !flightDone;

  if (!refundKey && !loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="headline">
          Nothing to return.
        </h1>
        <p className="mt-4 text-[var(--paper-dim)]">
          A return link carries its key after the <code className="font-mono">#</code>. If
          this was pasted from somewhere that truncates URLs, that is what got cut.
        </p>
      </div>
    );
  }

  if (transactionHash && flightDone) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="headline">
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
        <div className="mt-10">
          <LinkButton href="/">Go back to home page</LinkButton>
        </div>
      </div>
    );
  }

  if (loading || !envelope) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-sm text-[var(--paper-faint)]">Reading the envelope…</p>
      </div>
    );
  }

  return (
    <>
      {flying ? (
        <SendOff
          amount={formatAmount(envelope.amount)}
          symbol={STRK.symbol}
          direction="back"
          phase={phase}
          onDone={() => setFlightDone(true)}
        />
      ) : null}

      {flying ? (
        <Approvals
          title="Returning"
          amount={formatAmount(envelope.amount)}
          symbol={STRK.symbol}
          step={step}
          settled={phase !== "flying"}
          steps={[
            {
              title: "Work out where it lands",
              detail: "Your wallet assembles the return so the pool can name the note.",
            },
            {
              title: "Sign the return",
              detail: "The one that actually moves the money.",
            },
          ]}
        />
      ) : null}

      <div
        className={`mx-auto flex max-w-5xl flex-col gap-6 px-4 py-4 transition-opacity duration-500 sm:px-6 lg:grid lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-8 ${
          flying ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        {/* Headline over the card, matching the seal and claim pages. It used
            to sit in the right-hand column, which on one screen means beside
            the envelope and on a phone means underneath it: the page opened on
            an unlabelled card and only said what had happened to it after a
            scroll. */}
        <div className="lg:sticky lg:top-10">
          <h1 className="headline">
            {envelope.status === "claimed"
              ? "Already opened."
              : envelope.status === "refunded"
                ? "Already returned."
                : envelope.refundable
                  ? "Undelivered."
                  : "Still out for delivery."}
          </h1>

          <p className="mt-3 max-w-[62ch] text-sm text-[var(--paper-dim)] sm:text-base">
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

          <div className="mt-[clamp(1rem,3.5vh,2.25rem)]">
            <EnvelopeCard
              amount={formatAmount(envelope.amount)}
              symbol={STRK.symbol}
              sealed={envelope.status === "funded"}
              expired={envelope.refundable}
            />
          </div>
        </div>

        <div>
          <Receipt claimPublicKey={claimPublicKey} />

          {envelope.refundable ? (
            <div className="space-y-4 lg:mt-8">
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

              <Button
                className="w-full sm:w-auto"
                onClick={reclaim}
                disabled={!address || !supportsStrk20 || busy}
              >
                {busy ? "Returning…" : "Return to sender"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

/**
 * What the wallet is about to ask for, while the envelope is in the air.
 *
 * The flight fades the page out, which leaves someone watching a paper plane
 * with no idea that two separate wallet prompts are coming. The second one is
 * the confusing one: it looks like the wallet asking twice for the same
 * signature, and the natural reaction to that is to decline it.
 *
 * So the two are named and counted, and the one being asked for right now is
 * the only one lit. Pinned to the bottom, clear of the flight path.
 */
