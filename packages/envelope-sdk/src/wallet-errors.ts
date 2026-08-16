/**
 * Reading a thrown wallet error.
 *
 * An app that calls a wallet has to answer one question before it can do
 * anything sensible with a failure: did the person say no, or did something go
 * wrong? The two want opposite responses. A refusal means nothing was ever
 * sent, so the right move is to stop immediately and put the form back. A fault
 * means a transaction may well be in flight, so the right move is to go and ask
 * the chain before claiming anything failed.
 *
 * Getting that backwards is expensive in both directions: report a refusal as a
 * fault and someone watches an envelope fly for a transaction they cancelled;
 * report a fault as a refusal and someone is told nothing moved while their
 * money is in the air.
 *
 * The hard part is that the answer arrives buried. A wallet extension throws
 * its own Error, the bridge wraps that in an RPC envelope, and starknet.js can
 * wrap it again, so the code that matters is as likely to sit at
 * `error.data.code` or on `error.cause` as at the top of the object.
 */

/** `USER_REFUSED_OP`, per the wallet API. */
export const USER_REFUSED_OP = 113;

/** How deep to follow a wrapped error before giving up. */
const MAX_DEPTH = 5;

/** Fields a wallet or a bridge puts an error code in. */
const CODE_KEYS = ["code", "errorCode", "error_code"] as const;

/**
 * Every error code carried anywhere in a thrown value.
 *
 * Only fields actually named as codes are read, so a `113` sitting in calldata
 * or in a block number cannot be mistaken for a refusal. Strings count: the
 * code arrives as `"113"` through some bridges and as `113` through others.
 */
export function walletErrorCodes(
  value: unknown,
  depth = 0,
  seen: Set<unknown> = new Set(),
): number[] {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const found: number[] = [];
  const record = value as Record<string, unknown>;

  for (const key of CODE_KEYS) {
    const raw = record[key];
    if (typeof raw === "number" && Number.isFinite(raw)) found.push(raw);
    if (typeof raw === "string" && /^-?\d+$/.test(raw.trim())) found.push(Number(raw));
  }

  // `cause` is not enumerable on an Error, so it has to be named explicitly.
  const nested = [...Object.values(record), (record as { cause?: unknown }).cause];
  for (const item of nested) found.push(...walletErrorCodes(item, depth + 1, seen));

  return found;
}

/**
 * Everything readable in a thrown value.
 *
 * Reading only `error.message` is the hole this exists to close: an Error whose
 * message is something generic like "Request failed" can still be carrying the
 * real reason in a nested `data`, and neither `name` nor `cause` is enumerable,
 * so a plain `JSON.stringify` misses them too. That same call throws outright
 * on an error object that references itself, which is a crash inside the
 * handler that was supposed to be reporting a problem.
 */
export function walletErrorText(
  value: unknown,
  depth = 0,
  seen: Set<unknown> = new Set(),
): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);
  if (depth > MAX_DEPTH || seen.has(value)) return "";
  seen.add(value);

  const parts: string[] = [];
  if (value instanceof Error) {
    parts.push(value.name, value.message);
    parts.push(walletErrorText((value as { cause?: unknown }).cause, depth + 1, seen));
  }
  if (Array.isArray(value)) {
    for (const item of value) parts.push(walletErrorText(item, depth + 1, seen));
  } else {
    for (const item of Object.values(value as Record<string, unknown>)) {
      parts.push(walletErrorText(item, depth + 1, seen));
    }
  }
  return parts.filter(Boolean).join(" ");
}

/*
 * Careful with the wording. "The wallet rejected the request payload" is
 * `INVALID_REQUEST_PAYLOAD`, a malformed call, and must not match: it is the
 * app's fault, not a refusal, and treating it as one hides a real bug. Every
 * pattern below names the user as the one doing the refusing.
 */
const REFUSAL =
  /USER_REFUSED|USER_DENIED|USER_REJECTED|USER_ABORT|ABORTED_BY_USER|(reject|refus|declin|cancell?|abort)(ed)?\s+by\s+(the\s+)?user|user\s+(rejected|refused|denied|declined|abort(ed)?|cancell?ed)|request\s+(rejected|cancell?ed)/i;

/**
 * Did the person say no?
 *
 * The code is the reliable signal and is checked first, wherever it is nested.
 * The wording is a fallback for wallets that send a refusal with no code at
 * all.
 */
export function looksRejected(error: unknown): boolean {
  if (walletErrorCodes(error).includes(USER_REFUSED_OP)) return true;
  return REFUSAL.test(walletErrorText(error));
}
