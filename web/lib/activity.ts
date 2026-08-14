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
  span = 40_000,
  limit = 12,
): Promise<FundedEnvelope[]> {
  if (!anonymizer) return [];

  const latest = await provider.getBlockLatestAccepted();
  const events = await provider.getEvents({
    address: anonymizer,
    from_block: { block_number: Math.max(0, latest.block_number - span) },
    to_block: "latest",
    keys: [[hash.getSelectorFromName("EnvelopeFunded")]],
    chunk_size: limit,
  });

  const recent = events.events.slice(-limit).reverse();

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
