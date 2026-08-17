import type { WALLET_API } from "@starknet-io/types-js";
import { num, shortString } from "starknet";
import { MODE, OP } from "./constants.js";
import { type ReleaseSignature, signRelease } from "./message.js";

/**
 * Placeholders the wallet expands while assembling the transaction. They are
 * literal strings on the wire and must never be hex-normalised. A normalised
 * placeholder reaches the pool as a meaningless felt and the call reverts deep
 * inside `privacy_invoke` with nothing pointing at the real cause.
 */
const OPEN_NOTE_0 = "${openNoteIds[0]}";

/**
 * Normalise a value to the FELT form the Wallet API accepts.
 *
 * The spec pattern is `^0x(0|[a-fA-F1-9]{1}[a-fA-F0-9]{0,62})$`: after `0x`,
 * a leading zero is invalid. Starknet addresses are conventionally written
 * padded to 64 digits, and `validateAndParseAddress` produces exactly that
 * padded form, so handing one straight to the wallet is rejected wholesale as
 * INVALID_REQUEST_PAYLOAD, with nothing to say which field was at fault.
 */
export function felt(value: string | bigint | number): string {
  return num.toHex(BigInt(value));
}

/** Every action list here targets one anonymizer deployment. */
export interface AnonymizerTarget {
  /** The deployed `EnvelopeAnonymizer`. */
  anonymizer: string;
}

export interface FundEnvelopeParams extends AnonymizerTarget {
  /** ERC-20 to park. Must already be shielded, since funding spends a note. */
  token: string;
  /** Amount in the token's smallest unit. */
  amount: bigint;
  /** Envelope identifier; the recipient holds the matching private key. */
  claimPublicKey: string;
  /**
   * Authorised to reclaim after `expiry`. Required whenever `expiry` is set,
   * and the funder must keep the private half or the value strands.
   */
  refundPublicKey?: string;
  /** Unix seconds before which claims are refused. Omit for immediate. */
  unlockAt?: number;
  /** Unix seconds at which claiming closes and refunding opens. Omit for never. */
  expiry?: number;
  /** Short string (≤31 chars) echoed in the funding event. */
  memo?: string;
  /**
   * Where the value comes from.
   *
   * `shielded` spends a note that is already in the pool. `wallet` prepends a
   * deposit, so public tokens are shielded and sealed in the same transaction.
   *
   * The second is possible because a STRK20 transaction is a batch of actions
   * running in a fixed phase order, and deposit, withdraw and invoke fall in
   * that order already. It matters for more than convenience: shielding as a
   * separate transaction leaves a deposit sitting in the pool, visibly yours,
   * until the next one. Folded in, the deposit and the envelope it funds are
   * the same transaction, and there is no intermediate state to observe.
   */
  fundFrom?: "shielded" | "wallet";
}

/**
 * Park value in an envelope.
 *
 * Two actions, in the pool's phase order: a `withdraw` moves the value out to
 * the anonymizer, then the `invoke` records what it is for. There is no `OPEN`
 * transfer here, because funding deliberately credits no note, which is what leaves
 * the value parked for the recipient rather than handing it back to the funder.
 */
export function buildFundActions({
  anonymizer,
  token,
  amount,
  claimPublicKey,
  refundPublicKey = "0x0",
  unlockAt = 0,
  expiry = 0,
  memo = "",
  fundFrom = "shielded",
}: FundEnvelopeParams): WALLET_API.STRK20_ACTION[] {
  if (amount <= 0n) throw new Error("Envelope amount must be positive.");
  if (expiry !== 0 && refundPublicKey === "0x0") {
    throw new Error(
      "An expiring envelope needs a refund key, or its value strands on expiry.",
    );
  }
  if (expiry !== 0 && unlockAt >= expiry) {
    throw new Error("An envelope that unlocks after it expires can never be claimed.");
  }

  return [
    // Phase 3. Only present when funding straight from the wallet.
    ...(fundFrom === "wallet"
      ? ([{ type: "deposit", token: felt(token), amount: felt(amount) }] as const)
      : []),
    // Phase 6.
    {
      type: "withdraw",
      token: felt(token),
      amount: felt(amount),
      recipient: felt(anonymizer),
    },
    {
      type: "invoke",
      contract: felt(anonymizer),
      calldata: [
        felt(OP.fund),
        felt(claimPublicKey),
        felt(token),
        felt(amount),
        felt(refundPublicKey),
        felt(unlockAt),
        felt(expiry),
        memo ? felt(shortString.encodeShortString(memo)) : "0x0",
        "0x0",
        "0x0",
        "0x0",
      ],
    },
  ];
}

/**
 * Move public tokens into the pool.
 *
 * Sealing spends a shielded note, so this is the step that has to happen first
 * for a funder with nothing in the pool yet. On a fresh account the wallet also
 * registers the viewing key as part of this, which is why it can be slow the
 * first time.
 */
export function buildShieldActions({
  token,
  amount,
}: {
  token: string;
  amount: bigint;
}): WALLET_API.STRK20_ACTION[] {
  if (amount <= 0n) throw new Error("Shielded amount must be positive.");
  return [{ type: "deposit", token: felt(token), amount: felt(amount) }];
}

/** Token addresses as the wallet wants them, for balance queries. */
export function feltTokens(tokens: string[]): string[] {
  return tokens.map(felt);
}

/** An ordinary Starknet call, as `account.execute` takes them. */
export interface Call {
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
}

/**
 * Seal an envelope without the pool, from any Starknet wallet.
 *
 * The pool route hides the funder, and needs a wallet that implements the
 * STRK20 methods. Most wallets do not, which leaves the whole product
 * unreachable for the people most likely to want it. These two calls need
 * nothing but an ERC-20 approval, so an envelope can be sent from any wallet
 * at all.
 *
 * What is given up is the funder's privacy, and only the funder's. The claim
 * link, the time lock, the refund and the guarantee that a claim cannot be
 * front-run are all unchanged, and a recipient claiming into the pool is still
 * unobservable.
 */
export function buildPublicFundCalls({
  anonymizer,
  token,
  amount,
  claimPublicKey,
  refundPublicKey = "0x0",
  unlockAt = 0,
  expiry = 0,
  memo = "",
}: Omit<FundEnvelopeParams, "fundFrom">): Call[] {
  if (amount <= 0n) throw new Error("Envelope amount must be positive.");
  if (expiry !== 0 && refundPublicKey === "0x0") {
    throw new Error(
      "An expiring envelope needs a refund key, or its value strands on expiry.",
    );
  }

  return [
    {
      contractAddress: felt(token),
      entrypoint: "approve",
      calldata: [felt(anonymizer), felt(amount), "0x0"],
    },
    {
      contractAddress: felt(anonymizer),
      entrypoint: "fund_public",
      calldata: [
        felt(claimPublicKey),
        felt(token),
        felt(amount),
        felt(refundPublicKey),
        felt(unlockAt),
        felt(expiry),
        memo ? felt(shortString.encodeShortString(memo)) : "0x0",
      ],
    },
  ];
}

export interface ClaimToNoteParams extends AnonymizerTarget {
  /** The claim key from the link. Stays in the claimant's browser. */
  claimPrivateKey: string;
  claimPublicKey: string;
  /** Read from the envelope on-chain, not from the link. */
  token: string;
  /** Who receives the open note, the claimant's own address. */
  recipient: string;
  /**
   * The id of the open note this claim will fill.
   *
   * This is the awkward part of the private path, and it is worth being precise
   * about why. The signature has to commit to the note id, because that is the
   * only thing in the transaction identifying *where the value lands*: bind to
   * anything else and an observer can lift the signature, pair it with a note
   * they own, and take the envelope. But the id is minted by the wallet while
   * it assembles the transaction, so the claimant has to sign a value that does
   * not exist yet.
   *
   * {@link resolveOpenNoteId} is the way out: a dry run that makes the wallet
   * substitute the placeholder so the id can be read back and signed.
   */
  noteId: string;
}

/**
 * Claim into the pool: the value lands as a fresh note the claimant owns, and
 * no observer learns who they are.
 *
 * Pass an empty `noteId` to build the assembly probe; see
 * {@link resolveOpenNoteId}.
 */
export function buildClaimToNoteActions({
  anonymizer,
  claimPrivateKey,
  claimPublicKey,
  token,
  recipient,
  noteId,
}: ClaimToNoteParams): WALLET_API.STRK20_ACTION[] {
  // With no note id yet, this is the assembly probe: the shape is real so the
  // wallet will accept and substitute it, and the signature is a placeholder
  // that simulate mode never checks.
  const signature = noteId
    ? signRelease(claimPrivateKey, {
        anonymizer,
        mode: MODE.note,
        claimPublicKey,
        target: noteId,
      })
    : { r: "0x0", s: "0x0" };

  return [
    { type: "transfer", token: felt(token), amount: "OPEN", recipient: felt(recipient) },
    {
      type: "invoke",
      contract: felt(anonymizer),
      calldata: [
        felt(OP.claim),
        felt(claimPublicKey),
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        felt(signature.r),
        felt(signature.s),
        OPEN_NOTE_0,
      ],
    },
  ];
}

/** The slice of `WalletAccountV6` {@link resolveOpenNoteId} needs. */
export interface PreparesInvokes {
  strk20PrepareInvoke(
    actions: WALLET_API.STRK20_ACTION[],
    simulate?: boolean,
  ): Promise<{ call?: { calldata?: unknown } }>;
}

/**
 * Discover the id the wallet will mint for the open note, by assembling the
 * real transaction and reading back what it substituted.
 *
 * The obvious probe, a lone `OPEN` transfer, is rejected: an open note with
 * nothing to fill it is not a transaction the pool will accept, so the wallet
 * refuses the payload before substituting anything. The assembly has to be the
 * genuine action list, invoke included, with a placeholder signature standing
 * in for the one that cannot exist yet.
 *
 * Simulate mode is what makes that safe. It skips proof generation and returns
 * the assembled call, so the placeholder signature is never checked against
 * anything and nothing is submitted.
 *
 * The substituted id is then located by position rather than by guesswork: the
 * claim public key appears in the invoke calldata, and the note id sits nine
 * felts after it, which is the layout `privacy_invoke` declares.
 */
export async function resolveOpenNoteId(
  account: PreparesInvokes,
  actions: WALLET_API.STRK20_ACTION[],
  claimPublicKey: string,
): Promise<string | null> {
  const prepared = await account.strk20PrepareInvoke(actions, true);

  const calldata = prepared?.call?.calldata;
  if (!Array.isArray(calldata)) return null;

  const felts = calldata.map((item) => (typeof item === "string" ? item : String(item)));
  const wanted = BigInt(felt(claimPublicKey));

  for (let index = 0; index < felts.length; index += 1) {
    let value: bigint;
    try {
      value = BigInt(felts[index]!);
    } catch {
      continue;
    }
    if (value !== wanted) continue;

    // op, claimPubkey, token, amount, refund, unlock, expiry, memo, r, s, noteId
    const noteId = felts[index + 9];
    if (noteId && BigInt(noteId) !== 0n) return felt(noteId);
  }

  return null;
}

export interface RefundParams extends AnonymizerTarget {
  refundPrivateKey: string;
  claimPublicKey: string;
  token: string;
  /** Where the reclaimed note lands, the funder's own address. */
  recipient: string;
  noteId: string;
}

/** Reclaim an expired, unclaimed envelope as a fresh private note. */
export function buildRefundActions({
  anonymizer,
  refundPrivateKey,
  claimPublicKey,
  token,
  recipient,
  noteId,
}: RefundParams): WALLET_API.STRK20_ACTION[] {
  // Empty noteId builds the assembly probe; see resolveOpenNoteId.
  const signature = noteId
    ? signRelease(refundPrivateKey, {
        anonymizer,
        mode: MODE.refund,
        claimPublicKey,
        target: noteId,
      })
    : { r: "0x0", s: "0x0" };

  return [
    { type: "transfer", token: felt(token), amount: "OPEN", recipient: felt(recipient) },
    {
      type: "invoke",
      contract: felt(anonymizer),
      calldata: [
        felt(OP.refund),
        felt(claimPublicKey),
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        felt(signature.r),
        felt(signature.s),
        OPEN_NOTE_0,
      ],
    },
  ];
}

export interface ClaimToAddressParams extends AnonymizerTarget {
  claimPrivateKey: string;
  claimPublicKey: string;
  /** Any Starknet address. Needs no pool registration and no viewing key. */
  recipient: string;
}

/**
 * Claim a publicly funded envelope to an address, as an ordinary Starknet call.
 *
 * This is the path that makes an envelope sendable to someone who has never
 * heard of the pool: no registration, no viewing key, no STRK20-capable wallet.
 * The funder paid publicly, and in exchange the claimant needs nothing but the
 * link. Pool-funded envelopes reject this route on-chain.
 */
export function buildClaimToAddressCall({
  anonymizer,
  claimPrivateKey,
  claimPublicKey,
  recipient,
}: ClaimToAddressParams): {
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
} {
  const signature = signRelease(claimPrivateKey, {
    anonymizer,
    mode: MODE.address,
    claimPublicKey,
    target: recipient,
  });

  return {
    contractAddress: felt(anonymizer),
    entrypoint: "claim_to_address",
    calldata: [felt(claimPublicKey), felt(recipient), felt(signature.r), felt(signature.s)],
  };
}

export type { ReleaseSignature };
