import type { FundedLedger, FundedRecord } from "@/lib/activity";

/**
 * How much cover an envelope has, in rough bands.
 *
 * "none" is a fact rather than a judgement: one envelope of a size is the only
 * envelope of that size, and there is nothing to be mistaken for. The other two
 * are bands, and are labelled as bands in the interface rather than dressed up
 * as a score, because the honest answer to "is this enough" depends on who is
 * looking and what else they already know.
 */
export type Cover = "none" | "thin" | "fair";

export interface Crowd {
  /** The denomination, in the token's smallest unit. */
  amount: bigint;
  token: string;
  /** Envelopes of this size funded on this contract, yours included. */
  size: number;
  /** How many of those were funded after yours. */
  after: number;
  cover: Cover;
  /**
   * True when the search did not reach the contract's first block, so both
   * counts are floors rather than totals.
   */
  partial: boolean;
}

/** Felts are compared by value: the same key can be written with or without
 * leading zeroes, and a string compare quietly says two of them differ. */
function sameFelt(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
}

function band(size: number): Cover {
  if (size <= 1) return "none";
  return size < 10 ? "thin" : "fair";
}

/**
 * The crowd one envelope is standing in.
 *
 * An envelope's funding and its claim carry the same public amount, so a
 * distinctive figure links the two and narrows the set of funders a given claim
 * could have come from. Everything funded at the same size on the same contract
 * is what stands between that link and a name, which is why the app offers a
 * short list of round denominations rather than an open field.
 *
 * The second number is the one that changes after the fact. The crowd an
 * envelope was sealed into is fixed at that moment, but every envelope of the
 * same size funded afterwards is one more transaction an observer has to
 * separate from yours on timing alone. Sealing into an empty hour and handing
 * the link over immediately is the case this is here to make visible.
 *
 * Returns null when the funding is not in the ledger at all, which means the
 * envelope is not on-chain rather than that it is alone.
 */
export function crowdFor(ledger: FundedLedger, envelopeId: string): Crowd | null {
  const mine = ledger.records.findIndex((record) =>
    sameFelt(record.envelopeId, envelopeId),
  );
  if (mine < 0) return null;

  const target = ledger.records[mine];
  let size = 0;
  let after = 0;

  ledger.records.forEach((record, index) => {
    if (record.amount !== target.amount) return;
    if (!sameFelt(record.token, target.token)) return;
    size += 1;
    if (index > mine) after += 1;
  });

  return {
    amount: target.amount,
    token: target.token,
    size,
    after,
    cover: band(size),
    partial: !ledger.complete,
  };
}

export interface CrowdSize {
  amount: bigint;
  token: string;
  count: number;
}

/**
 * Every denomination the contract holds, and how many sit at each.
 *
 * The same figure the row shows, read the other way round: not "how well is
 * mine hidden" but "which sizes on this contract are worth sealing into". A
 * size with one envelope in it is a size that hides nobody, and that is easier
 * to act on before sealing than after.
 */
export function crowdSizes(ledger: FundedLedger): CrowdSize[] {
  const bySize = new Map<string, CrowdSize>();

  for (const record of ledger.records) {
    const key = `${record.amount}:${normalise(record.token)}`;
    const seen = bySize.get(key);
    if (seen) {
      seen.count += 1;
    } else {
      bySize.set(key, { amount: record.amount, token: record.token, count: 1 });
    }
  }

  return [...bySize.values()].sort((a, b) => (a.amount < b.amount ? -1 : 1));
}

function normalise(felt: string): string {
  try {
    return BigInt(felt).toString();
  } catch {
    return felt;
  }
}

/** Convenience for tests and callers holding raw records rather than a ledger. */
export function ledgerOf(records: FundedRecord[], complete = true): FundedLedger {
  return {
    records,
    scannedFrom: records[0]?.blockNumber ?? 0,
    complete,
  };
}
