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

const INITIAL: WalletState = {
  wallets: [],
  account: null,
  address: "",
  network: NETWORKS.sepolia,
  specs: [],
  connecting: false,
  error: "",
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(INITIAL);

  // Build the discovery store once on mount so wallets have time to register
  // themselves before anyone opens the picker. `eip1193Adapters: []` keeps
  // MetaMask out of discovery entirely — its Snap probing throws an unlock
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

      setState((previous) => ({
        ...previous,
        account,
        address: validateAndParseAddress(accounts[0]),
        network,
        specs,
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
      // STRK20 landed in Wallet API 0.10.3. A wallet reporting anything older
      // can still sign an ordinary call — which is all the public claim path
      // needs — but cannot shield, seal, or claim privately.
      supportsStrk20: state.specs.some((spec) => spec >= "0.10.3"),
    }),
    [state, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside a WalletProvider.");
  return context;
}
