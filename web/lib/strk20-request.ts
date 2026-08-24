/**
 * Wallet transaction requests that have already been opened by this page.
 *
 * A private envelope has a fresh claim public key, so its operation key is
 * unique even when the amount and every visible choice match a previous seal.
 * Keeping the original promise for the lifetime of the page makes submission
 * idempotent across React remounts, wallet events, and late async callbacks.
 * A repeated call for the same envelope can observe the first request; it can
 * never ask the wallet to spend the note again.
 */
const strk20Requests = new Map<string, Promise<unknown>>();

export function submitStrk20Once<T>(
  operationKey: string,
  submit: () => Promise<T>,
): Promise<T> {
  const existing = strk20Requests.get(operationKey);
  if (existing) return existing as Promise<T>;

  // Put the promise in the map before calling the wallet on the next microtask.
  // That closes even a same-tick re-entry gap without invoking `submit` twice.
  const request = Promise.resolve().then(submit);
  strk20Requests.set(operationKey, request);
  return request;
}
