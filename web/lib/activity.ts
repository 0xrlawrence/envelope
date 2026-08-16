import { hash, type RpcProvider } from "starknet";

export interface FundedEnvelope {
  envelopeId: string;
  token: string;
  amount: bigint;
  blockNumber: number;
  transactionHash: string;
  /** True when the funding transaction also emitted pool events. */
  throughPool: boolean;
  /** Who submitted it. A relayer for pool-funded envelopes, never the funder. */
  submittedBy: string;
}

/**
 * Recent envelopes, read from the anonymizer's own events.
 *
 * This is the only view of the product that does not depend on holding a key,
 * and the only one that shows the integration actually working: an envelope
 * funded through the pool carries the pool's events in the same transaction,
 * and is submitted by a relayer rather than by whoever funded it. That
 * separation is the privacy claim, visible rather than asserted.
 */
export async function recentEnvelopes(
  provider: RpcProvider,
  anonymizer: string,
  pool: string,
  fromBlock: number,
  limit = 12,
): Promise<FundedEnvelope[]> {
  if (!anonymizer) return [];

  // Anchored to the block the contract was deployed in, not to a window
  // trailing the chain head. A rolling window empties itself: every envelope
  // drops out of it once the tip has moved on far enough, and this page then
  // says no envelope was ever funded, which is the opposite of what it exists
  // to show. Measured at the point it broke, the newest envelope was already
  // 47,000 blocks behind a 40,000 block window.
  const selector = hash.getSelectorFromName("EnvelopeFunded");
  const found: Array<Awaited<ReturnType<RpcProvider["getEvents"]>>["events"][number]> = [];
  let continuation: string | undefined;

  // Bounded rather than open ended. The page wants the last handful, so it
  // walks forward until the events run out, and gives up rather than paging
  // forever against a contract that has been busy for a long time.
  for (let page = 0; page < 12; page += 1) {
    const chunk = await provider.getEvents({
      address: anonymizer,
      from_block: { block_number: Math.max(0, fromBlock) },
      to_block: "latest",
      keys: [[selector]],
      chunk_size: 100,
      ...(continuation ? { continuation_token: continuation } : {}),
    });
    found.push(...(chunk.events ?? []));
    continuation = chunk.continuation_token;
    if (!continuation) break;
  }

  // Events arrive oldest first, so the tail is the recent end. Taking the head
  // of the first page, which is what a single small chunk gave, showed the
  // twelve oldest envelopes under a heading promising the newest.
  const recent = found.slice(-limit).reverse();

  return Promise.all(
    recent.map(async (event) => {
      let throughPool = false;
      let submittedBy = "";
      try {
        const receipt = (await provider.getTransactionReceipt(
          event.transaction_hash,
        )) as unknown as { events?: Array<{ from_address: string }> };
        throughPool = (receipt.events ?? []).some(
          (entry: { from_address: string }) =>
            BigInt(entry.from_address) === BigInt(pool),
        );
        const tx = await provider.getTransactionByHash(event.transaction_hash);
        submittedBy = (tx as { sender_address?: string }).sender_address ?? "";
      } catch {
        // Classification is a nicety; the envelope itself is already known.
      }

      return {
        envelopeId: event.keys[1] ?? "0x0",
        token: event.keys[2] ?? "0x0",
        amount: BigInt(event.data[0] ?? "0x0"),
        blockNumber: event.block_number ?? 0,
        transactionHash: event.transaction_hash,
        throughPool,
        submittedBy,
      };
    }),
  );
}
