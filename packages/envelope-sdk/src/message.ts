import { ec, hash, shortString } from "starknet";
import { DOMAIN, type ReleaseMode } from "./constants.js";

/** A stark-curve signature, as the anonymizer expects it in calldata. */
export interface ReleaseSignature {
  r: string;
  s: string;
}

export interface ReleaseMessage {
  /** The anonymizer the signature is valid against. */
  anonymizer: string;
  mode: ReleaseMode;
  /** The envelope identifier, the claim public key. */
  claimPublicKey: string;
  /**
   * What the release is bound to: an open-note id for the private paths, or a
   * recipient address for the public one.
   */
  target: string;
}

/**
 * Rebuild the message the anonymizer will hash and verify.
 *
 * Mirrors `envelope::types::release_message_hash`. The two implementations are
 * pinned to each other by a vector in `message.test.ts`, generated from the
 * Cairo test suite. If either side drifts, every signature this SDK produces
 * starts being rejected on-chain, so the vector is the thing that catches it.
 */
export function releaseMessageHash({
  anonymizer,
  mode,
  claimPublicKey,
  target,
}: ReleaseMessage): string {
  return hash.computePoseidonHashOnElements([
    shortString.encodeShortString(DOMAIN),
    anonymizer,
    shortString.encodeShortString(mode),
    claimPublicKey,
    target,
  ]);
}

/**
 * Authorise one release, to one destination, on one anonymizer.
 *
 * The resulting signature is safe to broadcast: it is welded to `target`, so an
 * observer who lifts it out of the mempool cannot redirect the value to
 * themselves.
 */
export function signRelease(
  privateKey: string,
  message: ReleaseMessage,
): ReleaseSignature {
  const signature = ec.starkCurve.sign(releaseMessageHash(message), privateKey);
  return {
    r: "0x" + signature.r.toString(16),
    s: "0x" + signature.s.toString(16),
  };
}
