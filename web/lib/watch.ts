import { felt, readEnvelope, type EnvelopeState } from "strk20-envelope";
import { hash, type RpcProvider } from "starknet";

const TRANSFER_SELECTOR = hash.getSelectorFromName("Transfer");

/** Read an ERC-20 balance without depending on the connected wallet. */
export async function readTokenBalance(
  provider: RpcProvider,
  token: string,
  owner: string,
): Promise<bigint> {
  const raw = await provider.callContract({
    contractAddress: felt(token),
    entrypoint: "balanceOf",
    calldata: [felt(owner)],
  });
  return BigInt(raw[0] ?? "0x0") + (BigInt(raw[1] ?? "0x0") << 128n);
}

export interface TokenDeposit {
  /** Empty only when the balance fallback detected the deposit before events did. */
  transactionHash: string;
  /** Latest public balance, when the node answered the balance read. */
  publicBalance: bigint | null;
}

function sameFelt(left: string | undefined, right: string): boolean {
  try {
    return BigInt(left ?? "0x0") === BigInt(right);
  } catch {
    return false;
  }
}

/** A Cairo `u256` as emitted in an ERC-20 Transfer event. */
function eventAmount(data: readonly string[]): bigint {
  return BigInt(data[0] ?? "0x0") + (BigInt(data[1] ?? "0x0") << 128n);
}

/**
 * Watch a public-token deposit into the STRK20 pool.
 *
 * Some privacy wallets submit and confirm a transaction but never settle the
 * Wallet API promise they returned to the dapp. The chain is the authority in
 * that case. An exact Transfer from this account to this pool is definitive;
 * the public balance decrease is a fallback for RPC nodes that cannot serve
 * event filters promptly.
 */
export async function watchTokenDeposit(
  provider: RpcProvider,
  token: string,
  owner: string,
  pool: string,
  amount: bigint,
  fromBlock: number,
  publicBalanceBefore: bigint | null,
  stop: { cancelled: boolean; found: boolean },
  timeoutMs = 2 * 60_000,
): Promise<TokenDeposit | null> {
  const tokenAddress = felt(token);
  const ownerAddress = felt(owner);
  const poolAddress = felt(pool);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline && !stop.cancelled) {
    let publicBalance: bigint | null = null;
    try {
      publicBalance = await readTokenBalance(provider, tokenAddress, ownerAddress);
    } catch {
      // The event is still authoritative when the balance endpoint is behind.
    }

    if (fromBlock > 0) {
      try {
        const chunk = await provider.getEvents({
          from_block: { block_number: fromBlock },
          to_block: "latest",
          address: tokenAddress,
          keys: [[TRANSFER_SELECTOR], [ownerAddress], [poolAddress]],
          chunk_size: 32,
        });
        const transfer = (chunk.events ?? []).find(
          (event) =>
            sameFelt(event.keys[0], TRANSFER_SELECTOR) &&
            sameFelt(event.keys[1], ownerAddress) &&
            sameFelt(event.keys[2], poolAddress) &&
            eventAmount(event.data) === amount,
        );
        if (transfer) {
          stop.found = true;
          return {
            transactionHash: transfer.transaction_hash,
            publicBalance,
          };
        }
      } catch {
        // Keep watching. A filtered event read failure is not a failed deposit.
      }
    }

    if (
      publicBalance !== null &&
      publicBalanceBefore !== null &&
      publicBalanceBefore >= amount &&
      publicBalance <= publicBalanceBefore - amount
    ) {
      stop.found = true;
      return { transactionHash: "", publicBalance };
    }

    await new Promise((resolve) => setTimeout(resolve, 2500));
  }

  return null;
}

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
