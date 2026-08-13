import { encode } from "starknet";

/** Which key a link carries, and therefore what its holder can do. */
export type LinkKind = "claim" | "refund";

const PREFIX: Record<LinkKind, string> = { claim: "e1", refund: "r1" };
const KEY_BYTES = 32;

/**
 * Encode a key as a URL **fragment**.
 *
 * The fragment matters. Everything after `#` is stripped by the browser before
 * the request goes out, so the key never reaches the app's server, its logs, or
 * its analytics. It exists only in the recipient's tab. Putting it in the path
 * or the query string would quietly hand every envelope to whoever runs the
 * host, which is the opposite of the point.
 *
 * Nothing else is encoded: the envelope's token, amount and expiry are all read
 * from the chain using the public key derived from this one.
 */
export function encodeLinkFragment(privateKey: string, kind: LinkKind): string {
  const raw = encode.removeHexPrefix(privateKey).padStart(KEY_BYTES * 2, "0");
  const bytes = Uint8Array.from(
    raw.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)),
  );
  return `${PREFIX[kind]}.${base64UrlEncode(bytes)}`;
}

/** Build the full URL a funder hands over. */
export function encodeClaimLink(
  baseUrl: string,
  privateKey: string,
  kind: LinkKind = "claim",
): string {
  const path = kind === "claim" ? "claim" : "refund";
  return `${baseUrl.replace(/\/$/, "")}/${path}#${encodeLinkFragment(privateKey, kind)}`;
}

/**
 * Build the funder's own link, the one that reclaims an expired envelope.
 *
 * A refund key alone cannot find its envelope: envelopes are keyed by the
 * *claim* public key, and the refund key is deliberately unrelated to it, so
 * that holding one tells you nothing about the other. The claim public key
 * therefore rides along in the fragment. It is public information, and it is
 * the only way the funder's own link knows what it is reclaiming.
 */
export function encodeRefundLink(
  baseUrl: string,
  refundPrivateKey: string,
  claimPublicKey: string,
): string {
  const fragment = encodeLinkFragment(refundPrivateKey, "refund");
  return `${baseUrl.replace(/\/$/, "")}/refund#${fragment}~${claimPublicKey}`;
}

/**
 * Split a return link back into the refund key and the envelope it belongs to.
 */
export function decodeRefundFragment(
  fragment: string,
): { refundPrivateKey: string; claimPublicKey: string } | null {
  const body = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  const [keyPart, claimPublicKey] = body.split("~");
  if (!keyPart || !claimPublicKey) return null;

  const decoded = decodeLinkFragment(keyPart);
  if (!decoded || decoded.kind !== "refund") return null;

  return { refundPrivateKey: decoded.privateKey, claimPublicKey };
}

/**
 * Recover a key from a link fragment. Accepts the fragment with or without its
 * leading `#`, so `window.location.hash` can be passed straight in.
 */
export function decodeLinkFragment(
  fragment: string,
): { privateKey: string; kind: LinkKind } | null {
  const body = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  const separator = body.indexOf(".");
  if (separator < 0) return null;

  const prefix = body.slice(0, separator);
  const kind = (Object.keys(PREFIX) as LinkKind[]).find(
    (candidate) => PREFIX[candidate] === prefix,
  );
  if (!kind) return null;

  let bytes: Uint8Array;
  try {
    bytes = base64UrlDecode(body.slice(separator + 1));
  } catch {
    return null;
  }
  if (bytes.length !== KEY_BYTES) return null;

  return { privateKey: encode.addHexPrefix(encode.buf2hex(bytes)), kind };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
