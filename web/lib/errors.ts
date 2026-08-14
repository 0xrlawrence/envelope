/**
 * Wallet API error codes, mapped to something a person can act on.
 *
 * The wallet returns a code and a terse message, and for the catch-all it
 * returns nothing useful at all. Every one of these has a specific cause and a
 * specific next step, so the app should say which rather than forwarding
 * "UNKNOWN_ERROR" and leaving the user to guess.
 */
const BY_CODE: Record<number, string> = {
  113: "The wallet rejected the request payload. This is a bug in this app, not something you can fix.",
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
    "The wallet could not complete this and did not say why. The usual cause is nothing to spend: no viewing key registered, or no shielded balance. Check the balances above.",
  ],
];

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
