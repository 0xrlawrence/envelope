import { ec, encode } from "starknet";

/**
 * A stark-curve keypair. The private half is the bearer instrument: whoever
 * holds it can release the envelope, and nobody else can.
 */
export interface EnvelopeKeyPair {
  /** Hex, 0x-prefixed. Never transmitted; see {@link encodeClaimLink}. */
  privateKey: string;
  /** Hex, 0x-prefixed. This is the envelope's on-chain identifier. */
  publicKey: string;
}

/**
 * Generate a fresh keypair using the platform CSPRNG.
 *
 * Envelopes are keyed by their public key, so a fresh keypair per envelope is
 * also what keeps two envelopes from the same funder unlinkable to each other.
 * Never derive one from a wallet signature or a user-chosen phrase.
 */
export function generateEnvelopeKey(): EnvelopeKeyPair {
  const privateKey = encode.addHexPrefix(
    encode.buf2hex(ec.starkCurve.utils.randomPrivateKey()),
  );
  return { privateKey, publicKey: toPublicKey(privateKey) };
}

/** Recover the envelope identifier from a claim key held by a recipient. */
export function toPublicKey(privateKey: string): string {
  return encode.addHexPrefix(
    encode.removeHexPrefix(ec.starkCurve.getStarkKey(privateKey)),
  );
}
