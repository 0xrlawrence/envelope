import { walletErrorCodes, walletErrorText } from "strk20-envelope";

/**
 * Telling a refusal from a fault lives in the SDK, where it has tests. What
 * stays here is the copy: what to say to the person once the error is
 * understood, which is this app's business rather than the protocol's.
 */
export { looksRejected } from "strk20-envelope";

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
    /authenticate with the privacy backend|privacy backend/i,
    "The pool's proving service would not authenticate this account. That service belongs to the wallet, not to this app, so nothing here can work around it. When one account shields and another cannot, compare their account contract classes: a STRK20 proof validates the account's own signature inside the proof, so the service has to support that exact class, and wallets put newly created accounts on a different class from ones they have upgraded over time. The class is shown below.",
  ],
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
 * Best available explanation, with the wallet's own words kept for reference.
 *
 * Both lookups run against the whole error rather than against its message.
 * The code that names the problem is routinely nested a layer or two down, and
 * an explanation that misses it falls through to whatever generic sentence the
 * bridge put on the outside.
 */
export function explainWalletError(error: unknown): { message: string; raw: string } {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : walletErrorText(error);

  for (const code of walletErrorCodes(error)) {
    if (BY_CODE[code]) return { message: BY_CODE[code], raw: raw || walletErrorText(error) };
  }

  const searchable = walletErrorText(error) || raw;
  for (const [pattern, message] of BY_NAME) {
    if (pattern.test(searchable)) return { message, raw: raw || searchable };
  }
  return { message: raw || "The wallet could not complete this.", raw };
}
