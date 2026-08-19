/**
 * Where the CLI is pointed, and what it is allowed to spend.
 *
 * Everything here comes from the environment rather than from a config file on
 * disk. An agent runs in a container with secrets injected, and a key written
 * into a dotfile is one `cat` away from whatever else is on the machine.
 */

export interface Network {
  readonly id: "mainnet" | "sepolia";
  readonly label: string;
  readonly rpcUrl: string;
  readonly anonymizer: string;
  readonly token: string;
  readonly explorer: string;
  /** Where a claim link points. Only the fragment carries the key. */
  readonly appOrigin: string;
}

/** STRK is the same address on both networks. */
const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const NETWORKS: Record<string, Network> = {
  sepolia: {
    id: "sepolia",
    label: "Sepolia",
    rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
    anonymizer: "0x04ff4f083a4667930efe14963645f9bda00bb10d44e4c13a9ee808e66c076211",
    token: STRK,
    explorer: "https://sepolia.voyager.online",
    appOrigin: "https://0xrlawrence.github.io/envelope",
  },
  mainnet: {
    id: "mainnet",
    label: "Mainnet",
    rpcUrl: "https://api.cartridge.gg/x/starknet/mainnet",
    anonymizer: "",
    token: STRK,
    explorer: "https://voyager.online",
    appOrigin: "https://0xrlawrence.github.io/envelope",
  },
};

export class ConfigError extends Error {}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ConfigError(
      `${name} is not set. An envelope is real money, so this refuses to guess at it.`,
    );
  }
  return value;
}

export function network(): Network {
  const wanted = (process.env.ENVELOPE_NETWORK ?? "sepolia").toLowerCase();
  const found = NETWORKS[wanted];
  if (!found) {
    throw new ConfigError(
      `Unknown network ${wanted}. Use one of: ${Object.keys(NETWORKS).join(", ")}.`,
    );
  }
  if (!found.anonymizer) {
    throw new ConfigError(
      `No Envelope contract is deployed on ${found.label} yet. Set ENVELOPE_ANONYMIZER if you have deployed your own.`,
    );
  }
  return {
    ...found,
    rpcUrl: process.env.STARKNET_RPC ?? found.rpcUrl,
    anonymizer: process.env.ENVELOPE_ANONYMIZER ?? found.anonymizer,
    appOrigin: process.env.ENVELOPE_APP_ORIGIN ?? found.appOrigin,
  };
}

/**
 * The account the CLI signs with.
 *
 * Read every time rather than cached in a module, so a process that rotates its
 * environment between calls picks the change up.
 */
export function account(): { address: string; privateKey: string } {
  return {
    address: required("STARKNET_ACCOUNT"),
    privateKey: required("STARKNET_PRIVATE_KEY"),
  };
}
