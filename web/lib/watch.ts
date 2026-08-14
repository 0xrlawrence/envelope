import { readEnvelope, type EnvelopeState } from "strk20-envelope";
import type { RpcProvider } from "starknet";

/**
 * Watch an envelope until the chain says what you are waiting for.
 *
 * Every screen in this app used to learn what happened from the wallet's
 * promise, and every one of them was wrong in the same way. A wallet that
 * proves, hands the transaction to a relayer and then waits on its own
 * confirmation holds that promise long after the transaction is mined:
 * measured at fifteen seconds to land and over ten minutes to be told. The
 * user watches a spinner for a transaction that finished before they looked
 * away.
 *
 * The envelope id is known before anything is signed, so none of this needs
 * the wallet at all. Start watching when the action starts and race it.
 *
 * Returns the settled state, or null if the deadline passed or the caller
 * cancelled. A read failure is not an answer, so it keeps watching.
 */
export async function watchEnvelope(
  provider: RpcProvider,
  anonymizer: string,
  claimPublicKey: string,
  settled: (state: EnvelopeState) => boolean,
  stop: { cancelled: boolean; found: boolean },
  timeoutMs = 8 * 60_000,
): Promise<EnvelopeState | null> {
  if (!anonymizer || !claimPublicKey) return null;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !stop.cancelled) {
    try {
      const state = await readEnvelope(provider, anonymizer, claimPublicKey);
      if (settled(state)) {
        stop.found = true;
        return state;
      }
    } catch {
      // Keep watching; a read failure is not an answer.
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  return null;
}
