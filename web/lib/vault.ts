/**
 * Local record of every envelope this browser has sealed.
 *
 * The claim key is the envelope. It is generated in the page, never sent
 * anywhere, and until now existed only in a React state variable, which meant a
 * reload or a crash between signing and the success screen destroyed it while
 * the money sat funded on-chain. Unreachable by the recipient, and unreachable
 * by the funder, because the refund key went the same way.
 *
 * So keys are written here *before* the transaction is submitted. The cost is
 * that they sit in localStorage, which is why they are labelled as bearer
 * material in the interface and can be cleared once the link is safely handed
 * over.
 */
const KEY = "envelope.sealed.v1";

export interface SealRecord {
  claimPrivateKey: string;
  claimPublicKey: string;
  refundPrivateKey: string;
  amount: string;
  memo: string;
  network: string;
  anonymizer: string;
  createdAt: number;
  transactionHash?: string;
  /** False until the transaction is known to have been submitted. */
  submitted: boolean;
}

function read(): SealRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as SealRecord[]) : [];
  } catch {
    return [];
  }
}

function write(records: SealRecord[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(records.slice(-50)));
  } catch {
    // A full or disabled store must not stop someone sealing an envelope.
  }
}

/** Record an envelope before it is submitted, so a reload cannot lose it. */
export function remember(record: SealRecord): void {
  write([...read(), record]);
}

/** Note that the transaction went out, and under which hash. */
export function markSubmitted(claimPublicKey: string, transactionHash: string): void {
  write(
    read().map((record) =>
      record.claimPublicKey === claimPublicKey
        ? { ...record, submitted: true, transactionHash }
        : record,
    ),
  );
}

/** Everything sealed from this browser, newest first. */
export function recall(network?: string): SealRecord[] {
  const all = read().sort((a, b) => b.createdAt - a.createdAt);
  return network ? all.filter((record) => record.network === network) : all;
}

export function forget(claimPublicKey: string): void {
  write(read().filter((record) => record.claimPublicKey !== claimPublicKey));
}
