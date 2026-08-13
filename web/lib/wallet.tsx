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
  /** What the wallet said when STRK20 was probed, if it objected. */
  strk20Reason: string;
  /** Display name of the connected wallet. */
  walletName: string;
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
  strk20: false,
  strk20Reason: "",
  walletName: "",
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
      // Order matters, and it is not obvious. Ready and Argent X answer almost
      // nothing until the dapp is authorised, and authorisation is what
      // `wallet_requestAccounts` asks for. Leading with any other call, even
      // one as innocuous as asking which chain we are on, is refused with
      // "Not preauthorized" before the user is ever shown a prompt.
      const accounts = await walletV6.requestAccounts(wallet);
      if (!Array.isArray(accounts) || accounts.length === 0) {
        throw new Error("This wallet did not return an account.");
      }

      const permissions = (await walletV6.getPermissions(wallet)) as WALLET_API.Permission[];
      if (!permissions.includes(WALLET_API.Permission.ACCOUNTS)) {
        throw new Error("Account access was declined.");
      }

      // Only now is the wallet willing to talk, so the chain can be read and
      // the account built against the matching provider.
      const chainId = (await walletV6.requestChainId(wallet)) as string;
      const network = networkForChainId(chainId);

      const account = await WalletAccountV6.connect(
        new RpcProvider({ nodeUrl: network.rpcUrl }),
        wallet,
      );

      const specs = (await walletV6.supportedSpecs(wallet)) as string[];

      // `wallet_supportedSpecs` reports supported Starknet JSON-RPC versions
      // (0.7, 0.8, ...), not Wallet API versions, so it cannot say whether
      // STRK20 exists. The only reliable answer is to call a STRK20 method and
      // see. Assume support, and withdraw it only when the wallet says it does
      // not serve the method; an unregistered viewing key or an empty balance
      // still means STRK20 is there.
      let strk20 = true;
      let strk20Reason = "";
      try {
        await account.strk20Balances([]);
      } catch (probe) {
        strk20Reason =
          probe instanceof Error ? probe.message : String(probe ?? "unknown error");
        if (looksUnimplemented(probe)) strk20 = false;
        else console.debug("[envelope] STRK20 probe returned", probe);
      }

      setState((previous) => ({
        ...previous,
        account,
        address: validateAndParseAddress(accounts[0]),
        network,
        specs,
        strk20,
        strk20Reason,
        walletName: wallet.name,
        connecting: false,
      }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        connecting: false,
        error: describeConnectFailure(error),
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

/** Turn a wallet's connection refusal into something actionable. */
function describeConnectFailure(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/preauthor/i.test(message)) {
    return "The wallet refused before prompting. Unlock it, then try again; if it still refuses, remove this site from the wallet's connected dapps and reconnect.";
  }
  if (/reject|refused|denied|declined/i.test(message)) {
    return "Connection was declined in the wallet.";
  }
  return message || "Could not connect to that wallet.";
}

/** Recognise a wallet saying it does not serve a method. */
export function looksUnimplemented(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const code = (error as { code?: unknown })?.code;
  return (
    /not implemented|not_implemented|method not found|unknown method|unsupported method|does not support/i.test(
      message,
    ) || code === -32601
  );
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside a WalletProvider.");
  return context;
}
