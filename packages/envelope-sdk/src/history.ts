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
 * `fromBlock` matters. Nodes serve `starknet_getEvents` by walking block ranges
 * rather than by an address index, so asking from genesis returns page after
 * empty page and the answer never arrives. Pass the block the anonymizer was
 * deployed in.
 *
 * A read failure is not an answer, so this returns an empty list rather than
 * throwing: the page is showing what it already knows from the contract, and a
 * missing receipt should not take that down with it.
 */
export async function readEnvelopeHistory(
  provider: RpcProvider,
  anonymizer: string,
  claimPublicKey: string,
  fromBlock: number,
): Promise<EnvelopeEvent[]> {
  if (!anonymizer) return [];

  const found: EnvelopeEvent[] = [];
  let continuation: string | undefined;

  try {
    // Bounded. An envelope has at most two events, so more than a few pages
    // means the filter is not doing what it is supposed to.
    for (let page = 0; page < 6; page += 1) {
      const chunk = await provider.getEvents({
        from_block: { block_number: fromBlock },
        to_block: "latest",
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
  } catch {
    return found;
  }

  return found.sort((a, b) => a.blockNumber - b.blockNumber);
}
