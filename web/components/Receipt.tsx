"use client";

import { useEffect, useState } from "react";
import { readEnvelopeHistory, type EnvelopeEvent } from "strk20-envelope";
import { ExplorerLink } from "@/components/ui";
import { middleTruncate } from "@/lib/config";
import { useWallet } from "@/lib/wallet";

/**
 * The receipt.
 *
 * A page that says an envelope was returned, without saying in which
 * transaction, is asking to be taken on trust. That is the wrong posture for
 * this app in particular: the whole claim is that the chain, not the app, is
 * what makes an envelope real. So every settled envelope shows its own
 * transactions, read from the events rather than from anything the app
 * remembers, and every one of them is a link out to an explorer that can be
 * checked without this site.
 *
 * The app already knows the hash of a transaction it just submitted itself.
 * This is for every other case: a link opened later, on another device, or by
 * the other party.
 */
export function Receipt({ claimPublicKey }: { claimPublicKey: string }) {
  const { network, provider } = useWallet();
  const [events, setEvents] = useState<EnvelopeEvent[] | null>(null);

  useEffect(() => {
    let live = true;
    if (!claimPublicKey) return;
    void readEnvelopeHistory(
      provider,
      network.anonymizer,
      claimPublicKey,
      network.firstBlock,
    ).then((found) => {
      if (live) setEvents(found);
    });
    return () => {
      live = false;
    };
  }, [claimPublicKey, network.anonymizer, network.firstBlock, provider]);

  if (!events?.length) return null;

  const describe = (event: EnvelopeEvent): string => {
    if (event.kind === "funded") return "Sealed";
    if (event.kind === "refunded") return "Returned to sender";
    return event.intoPool ? "Claimed into the pool" : "Claimed to an address";
  };

  return (
    <div className="mt-8 border-t border-[var(--ink-line)] pt-4">
      <p className="field-label">On-chain</p>
      <ul className="mt-3 space-y-3.5">
        {events.map((event) => (
          <li key={event.transactionHash} className="text-sm leading-relaxed">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="text-[var(--paper)]">{describe(event)}</span>
              <span className="font-mono text-xs text-[var(--paper-faint)]">
                block {event.blockNumber.toLocaleString()}
              </span>
            </div>
            <ExplorerLink
              explorer={network.explorer}
              kind="tx"
              value={event.transactionHash}
            >
              {middleTruncate(event.transactionHash, 22, 10)}
            </ExplorerLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
