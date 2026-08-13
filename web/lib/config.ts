import { POOL_ADDRESS_MAINNET, STRK_ADDRESS } from "strk20-envelope";

export type NetworkId = "mainnet" | "sepolia";

export interface Network {
  id: NetworkId;
  label: string;
  chainId: string;
  rpcUrl: string;
  pool: string;
  /** The deployed `EnvelopeAnonymizer`. Empty until it exists on that network. */
  anonymizer: string;
  explorer: string;
}

/**
 * Addresses are cross-checked in `docs/MAINNET.md`. The mainnet anonymizer is
 * read from the environment so a deploy does not need a code change. But an
 * empty value is treated as "not deployed" and disables the network in the UI,
 * rather than silently sending transactions to address zero.
 */
export const NETWORKS: Record<NetworkId, Network> = {
  mainnet: {
    id: "mainnet",
    label: "Mainnet",
    chainId: "0x534e5f4d41494e",
    rpcUrl: "https://rpc.starknet.lava.build",
    pool: POOL_ADDRESS_MAINNET,
    anonymizer: process.env.NEXT_PUBLIC_ANONYMIZER_MAINNET ?? "",
    explorer: "https://starkscan.co",
  },
  sepolia: {
    id: "sepolia",
    label: "Sepolia",
    chainId: "0x534e5f5345504f4c4941",
    rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
    pool: "0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91",
    anonymizer:
      process.env.NEXT_PUBLIC_ANONYMIZER_SEPOLIA ??
      "0x05c5cdd9a2983bb4842d1a2c0b7ccdfa29d704e7217623349eb76cb237805604",
    explorer: "https://sepolia.starkscan.co",
  },
};

export function networkForChainId(chainId: string | undefined): Network {
  return chainId === NETWORKS.mainnet.chainId ? NETWORKS.mainnet : NETWORKS.sepolia;
}

export interface Token {
  symbol: string;
  address: string;
  decimals: number;
}

export const STRK: Token = { symbol: "STRK", address: STRK_ADDRESS, decimals: 18 };

/**
 * Fixed denominations.
 *
 * An envelope's funding leg and its claim leg carry the same public amount, so
 * a distinctive figure links the two and narrows the crowd a funder is hiding
 * in. Offering a short list of round sizes is the cheapest defence available:
 * every 10 STRK envelope looks like every other one.
 */
export const DENOMINATIONS = [1n, 5n, 10n, 25n, 100n];

export function toSmallestUnit(whole: bigint, token: Token = STRK): bigint {
  return whole * 10n ** BigInt(token.decimals);
}

export function formatAmount(amount: bigint, token: Token = STRK): string {
  const unit = 10n ** BigInt(token.decimals);
  const whole = amount / unit;
  const fraction = amount % unit;
  if (fraction === 0n) return whole.toString();
  const digits = fraction.toString().padStart(token.decimals, "0").replace(/0+$/, "");
  return `${whole}.${digits}`;
}

export const EXPIRY_CHOICES = [
  { label: "No expiry", seconds: 0 },
  { label: "24 hours", seconds: 86_400 },
  { label: "7 days", seconds: 7 * 86_400 },
  { label: "30 days", seconds: 30 * 86_400 },
];

export function shortHex(value: string, lead = 6, tail = 4): string {
  return value.length <= lead + tail + 1 ? value : `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

/** "21 Aug 2026, 05:08" rather than a raw locale string. */
export function formatDeadline(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** How long is left, in the largest unit that still reads naturally. */
export function timeRemaining(unixSeconds: number): string {
  const seconds = unixSeconds - Math.floor(Date.now() / 1000);
  if (seconds <= 0) return "closed";
  const days = Math.floor(seconds / 86_400);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} left`;
  const hours = Math.floor(seconds / 3_600);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} left`;
  const minutes = Math.max(1, Math.floor(seconds / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"} left`;
}

/** Decode a felt memo back to the short string the funder typed. */
export function decodeMemo(felt: string): string {
  try {
    const value = BigInt(felt);
    if (value === 0n) return "";
    let hex = value.toString(16);
    if (hex.length % 2) hex = "0" + hex;
    const text = (hex.match(/.{2}/g) ?? [])
      .map((byte) => String.fromCharCode(Number.parseInt(byte, 16)))
      .join("");
    return /^[\x20-\x7e]*$/.test(text) ? text : "";
  } catch {
    return "";
  }
}
