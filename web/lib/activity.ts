import { hash, type RpcProvider } from "starknet";

export interface FundedRecord {
  envelopeId: string;
  token: string;
  amount: bigint;
  blockNumber: number;
  transactionHash: string;
}

export interface FundedEnvelope extends FundedRecord {
  /** True when the funding transaction also emitted pool events. */
  throughPool: boolean;
  /** Who submitted it. A relayer for pool-funded envelopes, never the funder. */
  submittedBy: string;
}

/** Every funding the contract has emitted, plus how far back the search got. */
export interface FundedLedger {
  records: FundedRecord[];
  /** The oldest block actually searched. */
  scannedFrom: number;
  /** True when the search reached the contract's first block. */
  complete: boolean;
}

/** Roughly what one page of `getEvents` covers, so a window is about one call. */
const WINDOW = 80_000;
/**
 * A window needing more than this is not worth holding the page for. Four
 * pages of a hundred is 400 fundings in 80,000 blocks, which this contract has
 * never come close to; a window that does hit the ceiling says so rather than
 * dropping the overflow, so the count degrades to a floor instead of a lie.
 */
const PAGES_PER_WINDOW = 4;
/** The furthest back the walk reaches: 3.2 million blocks, well past both deployments. */
const MAX_WINDOWS = 40;
/** Windows in flight at once. Enough to be quick without hammering the node. */
const CONCURRENCY = 4;

/**
 * Every envelope the contract has ever funded, oldest first.
 *
 * Two things read this. One is a list of the recent handful, where missing the
 * odd envelope would only be untidy. The other counts them, and a count that
 * silently omits history is worse than no count at all: it is the number
 * someone looks at to decide whether their envelope is one of many or the only
 * one of its size, and a short answer there reads as "you are alone" when the
 * truth may be the opposite.
 *
 * So this scans in windows anchored to the chain tip rather than paging
 * forward from the contract's first block. Nodes serve `starknet_getEvents` by
 * walking block ranges, not by an address index, and hand back a continuation
 * token for every range they cross whether or not anything matched. A forward
 * scan therefore spends its budget on empty history and stops short of the
 * present. Measured on Sepolia, twelve pages reached block 14,403,040 with the
 * tip at 14,696,824, so anything funded in the last 293,000 blocks could not be
 * found at all. That is every envelope sealed today, including the one whose
 * count is being asked for, and the gap grows with the chain.
 *
 * Windows are independent ranges, so they go out together rather than one
 * after another, and the walk is bounded by block span rather than by how busy
 * the contract has been.
 */
export async function fundedLedger(
  provider: RpcProvider,
  anonymizer: string,
  fromBlock: number,
): Promise<FundedLedger> {
  const empty: FundedLedger = { records: [], scannedFrom: fromBlock, complete: false };
  if (!anonymizer) return { ...empty, complete: true };

  const selector = hash.getSelectorFromName("EnvelopeFunded");

  let tip: number;
  try {
    tip = await provider.getBlockNumber();
  } catch {
    return empty;
  }

  const floor = Math.max(0, fromBlock);
  const reach = Math.max(floor, tip - MAX_WINDOWS * WINDOW);

  // Oldest first, so the flattened result is already in chain order.
  const windows: Array<{ start: number; end: number }> = [];
  for (let end = tip; end >= reach; end -= WINDOW + 1) {
    windows.unshift({ start: Math.max(reach, end - WINDOW), end });
  }

  let truncated = false;

  const readWindow = async (range: { start: number; end: number }) => {
    const events: FundedRecord[] = [];
    let continuation: string | undefined;

    for (let page = 0; page < PAGES_PER_WINDOW; page += 1) {
      const chunk = await provider.getEvents({
        address: anonymizer,
        from_block: { block_number: range.start },
        to_block: { block_number: range.end },
        keys: [[selector]],
        chunk_size: 100,
        ...(continuation ? { continuation_token: continuation } : {}),
      });

      for (const event of chunk.events ?? []) {
        events.push({
          envelopeId: event.keys[1] ?? "0x0",
          token: event.keys[2] ?? "0x0",
          amount: BigInt(event.data[0] ?? "0x0"),
          blockNumber: event.block_number ?? 0,
          transactionHash: event.transaction_hash,
        });
      }

      continuation = chunk.continuation_token;
      if (!continuation) break;
      if (page === PAGES_PER_WINDOW - 1) truncated = true;
    }

    return events;
  };

  const pages: FundedRecord[][] = new Array(windows.length).fill(null).map(() => []);
  let failed = false;

  for (let batch = 0; batch < windows.length; batch += CONCURRENCY) {
    const slice = windows.slice(batch, batch + CONCURRENCY);
    const done = await Promise.all(
      slice.map((range) =>
        readWindow(range).catch(() => {
          // One window failing leaves a hole in the count, and a count with a
          // hole in it must not present itself as the whole history.
          failed = true;
          return [] as FundedRecord[];
        }),
      ),
    );
    done.forEach((events, index) => {
      pages[batch + index] = events;
    });
  }

  const records = pages.flat();
  records.sort((a, b) => a.blockNumber - b.blockNumber);

  return {
    records,
    scannedFrom: reach,
    complete: !failed && !truncated && reach <= floor,
  };
}

/**
 * How each of these envelopes was funded.
 *
 * The anonymizer records the same event either way, so the route is decided by
 * whether the pool emitted anything in the same transaction, and that costs a
 * receipt apiece. Only ever asked for the handful actually being listed.
 */
export async function classifyFunding(
  provider: RpcProvider,
  pool: string,
  records: FundedRecord[],
): Promise<FundedEnvelope[]> {
  return Promise.all(
    records.map(async (record) => {
      let throughPool = false;
      let submittedBy = "";
      try {
        const receipt = (await provider.getTransactionReceipt(
          record.transactionHash,
        )) as unknown as { events?: Array<{ from_address: string }> };
        throughPool = (receipt.events ?? []).some(
          (entry: { from_address: string }) =>
            BigInt(entry.from_address) === BigInt(pool),
        );
        const tx = await provider.getTransactionByHash(record.transactionHash);
        submittedBy = (tx as { sender_address?: string }).sender_address ?? "";
      } catch {
        // Classification is a nicety; the envelope itself is already known.
      }

      return { ...record, throughPool, submittedBy };
    }),
  );
}

/**
 * The most recent envelopes, newest first.
 *
 * This is the only view of the product that does not depend on holding a key,
 * and the only one that shows the integration actually working: an envelope
 * funded through the pool carries the pool's events in the same transaction,
 * and is submitted by a relayer rather than by whoever funded it. That
 * separation is the privacy claim, visible rather than asserted, and it is
 * the one thing here worth a receipt apiece to establish.
 */
export function recentFrom(ledger: FundedLedger, limit = 12): FundedRecord[] {
  return ledger.records.slice(-limit).reverse();
}
