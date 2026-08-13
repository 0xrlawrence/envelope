import type { ProviderInterface } from "starknet";

/** Lifecycle, mirroring `envelope::types::status`. */
export type EnvelopeStatus = "none" | "funded" | "claimed" | "refunded";

const STATUS: EnvelopeStatus[] = ["none", "funded", "claimed", "refunded"];

export interface EnvelopeState {
  status: EnvelopeStatus;
  token: string;
  amount: bigint;
  refundPublicKey: string;
  /** Unix seconds; 0 means claimable at once. */
  unlockAt: number;
  /** Unix seconds; 0 means it never expires and can never be refunded. */
  expiry: number;
  /** Raw felt, as stored. */
  memo: string;
  /** Convenience: inside the claim window right now. */
  claimable: boolean;
  /** Convenience: past expiry, so only the refund path is open. */
  refundable: boolean;
}

/**
 * Read an envelope straight from the chain.
 *
 * A recipient holds nothing but a key, so everything they are shown (which
 * token, how much, whether it has already been taken, when it expires) is read
 * from here rather than carried in the link. A link that claimed to be worth
 * 100 STRK could otherwise say so without it being true.
 */
export async function readEnvelope(
  provider: ProviderInterface,
  anonymizer: string,
  claimPublicKey: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<EnvelopeState> {
  const raw = await provider.callContract({
    contractAddress: anonymizer,
    entrypoint: "get_envelope",
    calldata: [claimPublicKey],
  });

  const at = (index: number): string => raw[index] ?? "0x0";
  const status = STATUS[Number(BigInt(at(6)))] ?? "none";
  const unlockAt = Number(BigInt(at(3)));
  const expiry = Number(BigInt(at(4)));

  return {
    status,
    token: at(0),
    amount: BigInt(at(1)),
    refundPublicKey: at(2),
    unlockAt,
    expiry,
    memo: at(5),
    claimable:
      status === "funded" && now >= unlockAt && (expiry === 0 || now < expiry),
    refundable: status === "funded" && expiry !== 0 && now >= expiry,
  };
}
