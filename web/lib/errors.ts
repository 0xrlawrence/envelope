/**
 * Wallet API error codes, mapped to something a person can act on.
 *
 * The wallet returns a code and a terse message, and for the catch-all it
 * returns nothing useful at all. Every one of these has a specific cause and a
 * specific next step, so the app should say which rather than forwarding
 * "UNKNOWN_ERROR" and leaving the user to guess.
 */
const BY_CODE: Record<number, string> = {
  // 113 and 114 were the wrong way round here, which is worse than it sounds:
  // it meant a person declining in their wallet was told they had hit a bug in
  // this app, and the refusal check below never recognised its own code. See
  // @starknet-io/types-js wallet-api/errors.
  113: "You declined the request in the wallet. Nothing was sent and nothing moved.",
  114: "The wallet rejected the request payload. This is a bug in this app, not something you can fix.",
  118: "This account has no viewing key registered with the pool yet. Registration happens once, on-chain. Shield through your wallet or the STRK20 app first, then come back.",
  119: "Not enough shielded balance in the pool to cover this. Shield more first.",
  162: "The wallet does not support the API version this app is asking for.",
};

const BY_NAME: Array<[RegExp, string]> = [
  [
    /NOT_REGISTERED/i,
    "This account has no viewing key registered with the pool yet. Registration happens once, on-chain. Shield through your wallet or the STRK20 app first, then come back.",
  ],
  [
    /INSUFFICIENT_PRIVATE_BALANCE/i,
    "Not enough shielded balance in the pool to cover this. Shield more first.",
  ],
  [
    /INVALID_REQUEST_PAYLOAD/i,
    "The wallet rejected the request payload. This is a bug in this app, not something you can fix.",
  ],
  [/USER_REFUSED/i, "You declined the request in the wallet."],
  [
    /timeout|timed out/i,
    "The wallet stopped waiting for the proving service. The transaction may still land: check the sealed page in a minute before trying again, so you do not fund two envelopes.",
  ],
  [
    /UNKNOWN_ERROR/i,
    "The wallet could not complete this and did not say why. On a claim, the usual cause is that this account has no viewing key with the pool, so it cannot receive a private note; take it to your address instead. On a seal, it is usually nothing to spend.",
  ],
];

/**
 * Did the person say no?
 *
 * This has to be told apart from every other failure, because the app's answer
 * to a failed seal is to spend forty seconds asking the chain whether the
 * transaction landed anyway. That is right for a wallet that timed out holding
 * a transaction it had already submitted. It is wrong for a refusal: nothing
 * was ever sent, there is nothing to find, and the user is left watching an
 * envelope fly for a transaction they cancelled.
 */
export function looksRejected(error: unknown): boolean {
  // The code is the reliable signal. Wallets word the message however they
  // like, and some send none at all, but `USER_REFUSED_OP` is 113 by spec.
  if ((error as { code?: unknown })?.code === 113) return true;

  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error ?? {});
  // Careful with the wording: "the wallet rejected the request payload" is a
  // malformed call, not a refusal, and must not land here. Every pattern below
  // names the user as the one doing the refusing.
  return /USER_REFUSED|USER_DENIED|USER_REJECTED|USER_ABORT|ABORTED_BY_USER|(reject|refus|declin|cancell?|abort)(ed)?\s+by\s+(the\s+)?user|user\s+(rejected|refused|denied|declined|abort(ed)?|cancell?ed)|request\s+(rejected|cancell?ed)/i.test(
    raw,
  );
}

/** Best available explanation, with the wallet's own words kept for reference. */
export function explainWalletError(error: unknown): { message: string; raw: string } {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error ?? {});

  const code = (error as { code?: unknown })?.code;
  if (typeof code === "number" && BY_CODE[code]) {
    return { message: BY_CODE[code], raw };
  }
  for (const [pattern, message] of BY_NAME) {
    if (pattern.test(raw)) return { message, raw };
  }
  return { message: raw || "The wallet could not complete this.", raw };
}
