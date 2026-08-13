"use client";

import { createStore, type Store } from "@starknet-io/get-starknet-discovery";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import { WALLET_API } from "@starknet-io/types-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { RpcProvider, WalletAccountV6, validateAndParseAddress, walletV6 } from "starknet";
import { NETWORKS, networkForChainId, type Network } from "./config";

interface WalletState {
  wallets: WalletWithStarknetFeatures[];
  account: WalletAccountV6 | null;
  address: string;
  network: Network;
  /** Wallet API specs the connected wallet reports. Empty when disconnected. */
  specs: string[];
  /** Whether STRK20 actions actually work, confirmed rather than advertised. */
  strk20: boolean;
  connecting: boolean;
  error: string;
}

interface WalletContextValue extends WalletState {
  connect(wallet: WalletWithStarknetFeatures): Promise<void>;
  disconnect(): void;
  /** A read provider for the currently selected network. */
  provider: RpcProvider;
  /** Whether the connected wallet can perform STRK20 actions at all. */
  supportsStrk20: boolean;
}

const WalletContext = createContext<WalletContextValue | null>(null);

/** STRK20 landed in Wallet API 0.10.3. */
const STRK20_SPEC = [0, 10, 3] as const;

/**
 * Compare dotted versions numerically.
 *
 * The obvious `spec >= "0.10.3"` is wrong and fails open, which is the worst
 * direction: string comparison puts "0.9.0" above "0.10.3" because "9" sorts
 * after "1", so a wallet with no STRK20 support passes the check, the action
 * is offered, and the wallet answers "Not implemented" only once the user has
 * committed to it.
 */
function meetsSpec(spec: string, minimum: readonly number[]): boolean {
  const parts = spec.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < minimum.length; index += 1) {
    const found = parts[index] ?? 0;
    const required = minimum[index] ?? 0;
    if (found !== required) return found > required;
  }
  return true;
}

const INITIAL: WalletState = {
  wallets: [],
  account: null,
  address: "",
  network: NETWORKS.sepolia,
  specs: [],
  strk20: false,
  connecting: false,
  error: "",
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(INITIAL);

  // Build the discovery store once on mount so wallets have time to register
  // themselves before anyone opens the picker. `eip1193Adapters: []` keeps
  // MetaMask out of discovery entirely; its Snap probing throws an unlock
  // popup at people who never asked for it.
  useEffect(() => {
    const store: Store = createStore({ eip1193Adapters: [] });
    setState((previous) => ({ ...previous, wallets: store.getWallets().slice() }));
    const unsubscribe = store.subscribe((next) =>
      setState((previous) => ({ ...previous, wallets: next.slice() })),
    );
    return () => unsubscribe();
  }, []);

  const connect = useCallback(async (wallet: WalletWithStarknetFeatures) => {
    setState((previous) => ({ ...previous, connecting: true, error: "" }));
    try {
      const chainId = (await walletV6.requestChainId(wallet)) as string;
      const network = networkForChainId(chainId);

      const account = await WalletAccountV6.connect(
        new RpcProvider({ nodeUrl: network.rpcUrl }),
        wallet,
      );

      const accounts = await walletV6.requestAccounts(wallet);
      if (!Array.isArray(accounts) || accounts.length === 0) {
        throw new Error("This wallet did not return an account.");
      }

      const permissions = (await walletV6.getPermissions(wallet)) as WALLET_API.Permission[];
      if (!permissions.includes(WALLET_API.Permission.ACCOUNTS)) {
        throw new Error("Account access was declined.");
      }

      const specs = (await walletV6.supportedSpecs(wallet)) as string[];

      // The reported spec list is a claim; this is the fact. Wallets have been
      // known to advertise a version whose methods they do not actually serve,
      // so the capability is confirmed against a harmless read before any
      // STRK20 action is offered.
      let strk20 = specs.some((spec) => meetsSpec(spec, STRK20_SPEC));
      if (strk20) {
        try {
          await account.strk20Balances([]);
        } catch (probe) {
          if (looksUnimplemented(probe)) strk20 = false;
        }
      }

      setState((previous) => ({
        ...previous,
        account,
        address: validateAndParseAddress(accounts[0]),
        network,
        specs,
        strk20,
        connecting: false,
      }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        connecting: false,
        error: error instanceof Error ? error.message : "Could not connect to that wallet.",
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState((previous) => ({ ...INITIAL, wallets: previous.wallets }));
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      ...state,
      connect,
      disconnect,
      provider: new RpcProvider({ nodeUrl: state.network.rpcUrl }),
      // A wallet without STRK20 can still sign an ordinary call, which is all
      // the public claim path needs, but cannot shield, seal, or claim
      // privately.
      supportsStrk20: state.strk20,
    }),
    [state, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

/** Recognise a wallet saying it does not serve a method. */
export function looksUnimplemented(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const code = (error as { code?: unknown })?.code;
  return /not implemented|unsupported|unknown method/i.test(message) || code === 163;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside a WalletProvider.");
  return context;
}
