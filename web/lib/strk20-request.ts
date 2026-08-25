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

interface ActiveStrk20Request {
  operationKey: string;
  request: Promise<unknown>;
}

/** One transaction prompt at a time for each connected account. */
const activeStrk20Requests = new Map<string, ActiveStrk20Request>();

/**
 * Private balance reads already opened for an account in this tab.
 *
 * Ready can emit an account-change event while a relayed STRK20 transaction is
 * finishing. React then re-runs the page's balance effect. Sending a second
 * `wallet_strk20Balances` request at that point can make Ready surface the
 * completed transaction review again, even though the app did not submit a
 * second transaction. Reusing the first read makes those lifecycle re-runs
 * side-effect free.
 */
const strk20BalanceReads = new Map<string, Promise<unknown>>();

/**
 * Wallet probes currently in flight.
 *
 * Working out where a claim or a return lands means asking the wallet to
 * assemble the transaction first, and in Ready that assembly is a prompt of its
 * own. It is a real wallet call, so it needs the same protection the submission
 * has: the button is disabled through React state, which does not close the gap
 * between two clicks landing in the same tick, and the second one used to reach
 * the wallet and open a second dialog for one return.
 *
 * Unlike a submission this is dropped once it settles. A submission is kept
 * forever so a spent note can never be spent twice; a probe moves nothing, and
 * caching a refusal would leave someone who declined by mistake unable to try
 * the same envelope again.
 */
const strk20Probes = new Map<string, Promise<unknown>>();

export function probeStrk20Once<T>(probeKey: string, probe: () => Promise<T>): Promise<T> {
  const existing = strk20Probes.get(probeKey);
  if (existing) return existing as Promise<T>;

  // Registered before the wallet is called on the next microtask, which is what
  // closes the same-tick re-entry.
  const request = Promise.resolve().then(probe);
  strk20Probes.set(probeKey, request);
  const drop = () => {
    if (strk20Probes.get(probeKey) === request) strk20Probes.delete(probeKey);
  };
  void request.then(drop, drop);
  return request;
}

export function submitStrk20Once<T>(
  operationKey: string,
  submit: () => Promise<T>,
  accountKey?: string,
): Promise<T> {
  const existing = strk20Requests.get(operationKey);
  if (existing) return existing as Promise<T>;

  if (accountKey) {
    const active = activeStrk20Requests.get(accountKey);
    if (active) {
      if (active.operationKey === operationKey) return active.request as Promise<T>;
      return Promise.reject(
        new Error(
          "A private wallet transaction is already open for this account. Close or finish it before starting another.",
        ),
      );
    }
  }

  // Put the promise in the map before calling the wallet on the next microtask.
  // That closes even a same-tick re-entry gap without invoking `submit` twice.
  const request = Promise.resolve().then(submit);
  strk20Requests.set(operationKey, request);
  if (accountKey) {
    activeStrk20Requests.set(accountKey, { operationKey, request });
    // Wallets normally settle the API promise on approval or rejection. Clear
    // the account lock then, but only if it still belongs to this operation: a
    // late answer from an old Ready request must not unlock a newer one.
    void request.then(
      () => releaseStrk20Request(accountKey, operationKey),
      () => releaseStrk20Request(accountKey, operationKey),
    );
  }
  return request;
}

/**
 * Release an account lock when the chain proves the operation finished.
 *
 * Ready sometimes leaves its Wallet API promise pending after its relayer has
 * landed the transaction. The chain watcher is authoritative in that case and
 * must release the lock so "Seal another" remains usable.
 */
export function releaseStrk20Request(
  accountKey: string,
  operationKey: string,
): void {
  const active = activeStrk20Requests.get(accountKey);
  if (active?.operationKey === operationKey) activeStrk20Requests.delete(accountKey);
}

/** Read a private balance at most once for a particular account and token set. */
export function readStrk20BalancesOnce<T>(
  balanceKey: string,
  read: () => Promise<T>,
): Promise<T> {
  const existing = strk20BalanceReads.get(balanceKey);
  if (existing) return existing as Promise<T>;

  // Cache before the wallet is called, closing the same-tick effect/remount
  // gap as the transaction guard above. Rejections are deliberately retained:
  // an automatic React retry must not spend a second wallet prompt either.
  const request = Promise.resolve().then(read);
  strk20BalanceReads.set(balanceKey, request);
  return request;
}

/**
 * Allow the next balance read to reach the wallet after an explicit balance-
 * changing action. Callers must only use this once the transaction request has
 * answered; invalidating while it is still pending recreates the approval bug.
 */
export function invalidateStrk20BalanceRead(balanceKey: string): void {
  strk20BalanceReads.delete(balanceKey);
}
