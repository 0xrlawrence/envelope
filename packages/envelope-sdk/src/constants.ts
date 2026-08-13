/**
 * Network constants.
 *
 * The pool address is the canonical STRK20 privacy pool. It is verified against
 * the live network in `docs/MAINNET.md`; do not guess at it.
 */

/** The STRK20 privacy pool on Starknet mainnet. */
export const POOL_ADDRESS_MAINNET =
  "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";

/** STRK on Starknet mainnet. */
export const STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

/** Domain separator, mirroring `envelope::types::DOMAIN`. */
export const DOMAIN = "ENVELOPE_V1";

/**
 * Release modes, mirroring `envelope::types::MODE_*`.
 *
 * These tags are what stop an authorisation for one release path being replayed
 * on another: a note id and an address are both bare felts, so the mode is the
 * only thing distinguishing the two messages.
 */
export const MODE = {
  /** Release into an open note inside the pool. */
  note: "CLAIM_TO_NOTE",
  /** Release as a public ERC-20 transfer. */
  address: "CLAIM_TO_ADDRESS",
  /** Return an expired envelope to its funder. */
  refund: "REFUND_TO_NOTE",
} as const;

export type ReleaseMode = (typeof MODE)[keyof typeof MODE];

/**
 * `EnvelopeOp` variant indices. Cairo serializes a payload-free enum as its
 * variant index, so these are the literal felts the pool passes through.
 */
export const OP = {
  fund: 0,
  claim: 1,
  refund: 2,
} as const;
