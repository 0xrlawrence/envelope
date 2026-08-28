import { hash, shortString, type RpcProvider } from "starknet";

/**
 * What happened to an envelope, and in which transaction.
 *
 * `get_envelope` returns the current status and nothing else, because that is
 * all the contract needs to store. It cannot say which transaction set that
 * status, so a page that did not itself submit the transaction has no hash to
 * show and can only assert that something happened. The events carry it: both
 * settlement events are indexed by `envelope_id`, so one filtered query returns
 * the whole life of one envelope and nothing about any other.
 */
export type EnvelopeEventKind = "funded" | "claimed" | "refunded";

export interface EnvelopeEvent {
  kind: EnvelopeEventKind;
  transactionHash: string;
  blockNumber: number;
  /**
   * For a claim, whether the recipient took it as a private note or to a
   * public address. Undefined for the other two.
   */
  intoPool?: boolean;
  /**
   * For a funding, whether it went through the pool. Only meaningful when a
   * pool address was supplied, since it is decided by whether the pool emitted
   * anything in the same transaction.
   */
  throughPool?: boolean;
}

const EVENTS: ReadonlyArray<readonly [string, EnvelopeEventKind]> = [
  ["EnvelopeFunded", "funded"],
  ["EnvelopeClaimed", "claimed"],
  ["EnvelopeRefunded", "refunded"],
];

/** `envelope::types::MODE_NOTE`, as a felt. */
const MODE_NOTE = BigInt(shortString.encodeShortString("CLAIM_TO_NOTE"));

const SELECTORS = EVENTS.map(([name]) => hash.getSelectorFromName(name));
const KIND_BY_SELECTOR = new Map<bigint, EnvelopeEventKind>(
  EVENTS.map(([name, kind]) => [BigInt(hash.getSelectorFromName(name)), kind]),
);

/**
 * Every transaction that touched one envelope, oldest first.
 *
 * Searched backwards from the chain tip, one window at a time.
 *
 * Nodes serve `starknet_getEvents` by walking block ranges rather than by an
 * address index, and they return a continuation token for every range they
 * scan whether or not anything in it matched. A forward scan from the
 * anonymizer's deployment block therefore spends its whole page budget
 * crossing empty history: measured against Sepolia, six pages advanced from
 * 13,420,000 to 13,911,520 while the tip was at 14,174,103, so nothing funded
 * in the last quarter of a million blocks could be found at all. That is every
 * envelope anyone is actually holding a link to, and the gap grows daily.
 *
 * Going backwards inverts the odds. An envelope being read is nearly always a
 * recent one, so the first window usually answers, and the walk stops the
 * moment the funding event is in hand because nothing precedes it.
 *
 * A read failure is not an answer, so this returns what it has rather than
 * throwing: the page is showing what it already knows from the contract, and a
 * missing receipt should not take that down with it.
 */
export async function readEnvelopeHistory(
  provider: RpcProvider,
  anonymizer: string,
  claimPublicKey: string,
  fromBlock: number,
  pool?: string,
): Promise<EnvelopeEvent[]> {
  if (!anonymizer) return [];

  const found: EnvelopeEvent[] = [];

  /** Roughly what one page of `getEvents` covers, so a window is ~one call. */
  const WINDOW = 80_000;
  /** A window that somehow needs more than this is not worth waiting on. */
  const PAGES_PER_WINDOW = 4;

  try {
    let end = await provider.getBlockNumber();

    // Walk backwards until the funding event is in hand, or history runs out.
    while (end >= fromBlock && !found.some((event) => event.kind === "funded")) {
      const start = Math.max(fromBlock, end - WINDOW);
      let continuation: string | undefined;

      for (let page = 0; page < PAGES_PER_WINDOW; page += 1) {
        const chunk = await provider.getEvents({
          from_block: { block_number: start },
          to_block: { block_number: end },
          address: anonymizer,
          keys: [SELECTORS, [claimPublicKey]],
          chunk_size: 32,
          ...(continuation ? { continuation_token: continuation } : {}),
        });

        for (const event of chunk.events ?? []) {
          const kind = KIND_BY_SELECTOR.get(BigInt(event.keys[0] ?? "0x0"));
          if (!kind) continue;
          found.push({
            kind,
            transactionHash: event.transaction_hash,
            blockNumber: event.block_number ?? 0,
            // Claimed carries [amount, mode, target]; mode says which route the
            // recipient took out.
            intoPool:
              kind === "claimed"
                ? BigInt(event.data[1] ?? "0x0") === MODE_NOTE
                : undefined,
          });
        }

        continuation = chunk.continuation_token;
        if (!continuation) break;
      }

      if (start === fromBlock) break;
      end = start - 1;
    }
  } catch {
    return found;
  }

  found.sort((a, b) => a.blockNumber - b.blockNumber);

  // Whether the funding went through the pool is not in the envelope's own
  // event: the anonymizer records the same thing either way. It is decided by
  // whether the pool emitted anything in that transaction, which costs one
  // receipt and is only worth fetching when a caller asks.
  const funded = pool ? found.find((event) => event.kind === "funded") : undefined;
  if (funded) {
    try {
      const receipt = (await provider.getTransactionReceipt(
        funded.transactionHash,
      )) as unknown as { events?: Array<{ from_address: string }> };
      funded.throughPool = (receipt.events ?? []).some(
        (entry) => BigInt(entry.from_address) === BigInt(pool!),
      );
    } catch {
      // Left undefined, which reads as "not known" rather than "not private".
    }
  }

  return found;
}
