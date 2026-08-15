import { ec, encode } from "starknet";

/**
 * Password-locked envelopes.
 *
 * The obvious way to build this is to keep the claim key in the link and have
 * the claim page ask for a password before it shows the button. That protects
 * nothing at all: the key is sitting in the URL, and anyone holding the link
 * can read it out of the fragment and call the contract directly without ever
 * loading the page. A check the attacker is not obliged to run is not a check.
 *
 * So the password is not a gate in front of the key, it is half of the key.
 * The link carries a random salt and nothing else; the claim key is derived
 * from the salt and the password together, and neither half on its own produces
 * anything. Intercepting the link gets you a salt. Guessing the password
 * without the link gets you nothing to salt.
 *
 * What this does and does not defend:
 *
 *   - A link that leaks, by forward, screenshot or a chat backup, is no longer
 *     enough to take the money. That is the whole point of the feature.
 *   - Someone holding the link *can* attack the password offline: derive a
 *     candidate key, take its public half, compare against the envelope id,
 *     which is public on-chain. Nothing can prevent that, because verification
 *     is free. It can only be made slow, which is what the iteration count is
 *     for, and it is why a weak password is worth warning about.
 *   - The refund key stays independent and random. Forgetting the password
 *     costs the recipient their claim, not the funder their money.
 */

/**
 * OWASP's 2023 floor for PBKDF2-HMAC-SHA256. Roughly a third of a second on a
 * current laptop, which is unnoticeable once per claim and expensive once per
 * guess across a dictionary.
 */
const ITERATIONS = 600_000;

/** 48 bytes reduced into a 252-bit field leaves the bias below 2^-64. */
const DERIVED_BYTES = 48;

const CURVE_ORDER = ec.starkCurve.CURVE.n;

function subtle(): SubtleCrypto {
  const web = globalThis.crypto;
  if (!web?.subtle) {
    throw new Error("This browser cannot derive a key, so it cannot open a locked envelope.");
  }
  return web.subtle;
}

/** A fresh salt for a locked envelope. This is what travels in the link. */
export function generateLockSalt(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return encode.addHexPrefix(encode.buf2hex(bytes));
}

/**
 * Turn a salt and a password into the envelope's claim private key.
 *
 * Deterministic: the funder runs it to learn which envelope to create, and the
 * recipient runs it to open that same envelope. Both arrive at the same key or
 * neither does.
 */
export async function deriveLockedKey(salt: string, password: string): Promise<string> {
  const normalised = password.normalize("NFKC");
  if (!normalised) throw new Error("A locked envelope needs a password.");

  const material = await subtle().importKey(
    "raw",
    new TextEncoder().encode(normalised),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const saltBytes = Uint8Array.from(
    (encode.removeHexPrefix(salt).padStart(64, "0").match(/.{2}/g) ?? []).map((byte) =>
      Number.parseInt(byte, 16),
    ),
  );

  const derived = await subtle().deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: ITERATIONS },
    material,
    DERIVED_BYTES * 8,
  );

  // Reduce into the curve's scalar field. Rejecting and retrying would be the
  // textbook answer, but there is nothing to retry with here: the input is
  // fixed, so the derivation has to land somewhere valid on the first attempt.
  const wide = BigInt(encode.addHexPrefix(encode.buf2hex(new Uint8Array(derived))));
  const scalar = (wide % (CURVE_ORDER - 1n)) + 1n;

  return encode.addHexPrefix(scalar.toString(16).padStart(64, "0"));
}
