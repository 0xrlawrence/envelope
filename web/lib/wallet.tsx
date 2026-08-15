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
  useRef,
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
  /** Class hash of the connected account, when it could be read. */
  accountClass: string;
  /** False when the account contract is not on-chain yet. */
  accountDeployed: boolean;
  connecting: boolean;
  error: string;
}

interface WalletContextValue extends WalletState {
  connect(wallet: WalletWithStarknetFeatures): Promise<void>;
  disconnect(): void;
  /** Called when a real STRK20 call reports the method is not served. */
  reportStrk20Unsupported(reason: string): void;
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
  accountClass: "",
  accountDeployed: true,
  connecting: false,
  error: "",
};

/**
 * Which wallet was used last, so a refresh does not start from nothing.
 *
 * Only the name is kept. There is no session to store and this grants no
 * access: the wallet decides whether the site is still authorised, and this is
 * a note about which one to ask.
 */
const LAST_WALLET = "envelope.wallet";

function rememberWallet(name: string): void {
  try {
    window.localStorage.setItem(LAST_WALLET, name);
  } catch {
    // A blocked store costs the reconnect and nothing else.
  }
}

function forgetWallet(): void {
  try {
    window.localStorage.removeItem(LAST_WALLET);
  } catch {
    // The reconnect fails closed anyway.
  }
}

function rememberedWallet(): string {
  try {
    return window.localStorage.getItem(LAST_WALLET) ?? "";
  } catch {
    return "";
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(INITIAL);
  // One attempt per load. Discovery fills in over several ticks, so without
  // this the effect below would fire again for every wallet that registers.
  const tried = useRef(false);

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
      // Which account contract the wallet is driving. A STRK20 proof validates
      // the account's own signature inside the proof, so a wallet can generally
      // only prove for account classes it implements. Driving an imported
      // account of another wallet's class is a common reason for the privacy
      // path to fail with nothing specific to say.
      let accountClass = "";
      try {
        accountClass = await new RpcProvider({ nodeUrl: network.rpcUrl }).getClassHashAt(
          accounts[0],
        );
      } catch {
        // No class hash means the account contract is not on-chain yet. Wallets
        // let you create and fund an account before it is deployed, and it is
        // only deployed by its first outgoing transaction. Nothing in the pool
        // can work until then: registration proves against the account's own
        // storage, and an account that does not exist has none.
        accountClass = "";
      }

      // No probe here any more. Asking `strk20Balances` whether the method
      // exists costs a "share your private balances" prompt, and the page then
      // asks the same question again a moment later to read the balance it
      // actually needs, so connecting raised that modal twice. Since the
      // reconnect happens on every load, that was twice per refresh.
      //
      // Support is assumed and withdrawn only if a real call comes back saying
      // the method is absent. The read the page already makes answers it.
      setState((previous) => ({
        ...previous,
        account,
        address: validateAndParseAddress(accounts[0]),
        network,
        specs,
        strk20: true,
        strk20Reason: "",
        walletName: wallet.name,
        accountClass,
        accountDeployed: accountClass !== "",
        connecting: false,
      }));
      rememberWallet(wallet.name);
    } catch (error) {
      setState((previous) => ({
        ...previous,
        connecting: false,
        error: describeConnectFailure(error),
      }));
    }
  }, []);

  /**
   * Withdraw STRK20 support after a real call says the method is absent.
   *
   * The alternative is asking up front, which cannot be done without spending
   * a consent prompt on a question the next call answers for free.
   */
  const reportStrk20Unsupported = useCallback((reason: string) => {
    setState((previous) =>
      previous.strk20 ? { ...previous, strk20: false, strk20Reason: reason } : previous,
    );
  }, []);

  const disconnect = useCallback(() => {
    forgetWallet();
    setState((previous) => ({ ...INITIAL, wallets: previous.wallets }));
  }, []);

  /**
   * Come back connected, without raising a prompt nobody asked for.
   *
   * `wallet_getPermissions` is the one call a wallet answers before it trusts
   * you, so it decides whether this site is still authorised. Only once it says
   * yes is the ordinary connect run, and by then it resolves without a prompt
   * because the authorisation it would ask for already exists. A site that has
   * been revoked in the wallet simply loads disconnected.
   */
  const reconnect = useCallback(
    async (wallet: WalletWithStarknetFeatures) => {
      try {
        const granted = (await walletV6.getPermissions(wallet)) as WALLET_API.Permission[];
        if (!granted.includes(WALLET_API.Permission.ACCOUNTS)) {
          forgetWallet();
          return;
        }
      } catch {
        // A wallet that will not answer this is one that will not have us.
        forgetWallet();
        return;
      }
      await connect(wallet);
    },
    [connect],
  );

  // Runs against each update of the wallet list rather than once on mount,
  // because discovery is asynchronous and the extension may not have
  // registered itself yet when the page first renders.
  useEffect(() => {
    if (tried.current || state.address || state.connecting) return;
    const name = rememberedWallet();
    if (!name) return;
    const wallet = state.wallets.find((candidate) => candidate.name === name);
    if (!wallet) return;
    tried.current = true;
    void reconnect(wallet);
  }, [state.wallets, state.address, state.connecting, reconnect]);

  const value = useMemo<WalletContextValue>(
    () => ({
      ...state,
      connect,
      disconnect,
      reportStrk20Unsupported,
      provider: new RpcProvider({ nodeUrl: state.network.rpcUrl }),
      // A wallet without STRK20 can still sign an ordinary call, which is all
      // the public claim path needs, but cannot shield, seal, or claim
      // privately.
      supportsStrk20: state.strk20,
    }),
    [state, connect, disconnect, reportStrk20Unsupported],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

/**
 * Known account contract classes, so a wallet driving somebody else's account
 * can be named rather than guessed at.
 */
const ACCOUNT_CLASSES: Record<string, string> = {
  "0x3957f9f5a1cbfe918cedc2015c85200ca51a5f7506ecb6de98a5207b759bf8a": "Braavos",
  // Observed on freshly created Ready accounts. Distinguished from the class
  // below because the difference between them is the difference between an
  // account that can prove a STRK20 action and one that reports "failed to
  // authenticate with the privacy backend".
  "0x36078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f": "Ready, new account class",
  "0x1a736d6ed154502257f02b1ccdf4d9d1089f80811cd6acad48e6b6a9d1f2003": "Ready, upgraded",
  "0x29927c8af6bccf3f6fda035981e765a7bdbf18a2dc0d630494f8758aa908e2b": "Ready",
};

/** The account contract's maker, if recognised. */
export function accountClassName(classHash: string): string {
  if (!classHash) return "";
  const normalised = classHash.startsWith("0x")
    ? "0x" + classHash.slice(2).replace(/^0+/, "")
    : classHash;
  return ACCOUNT_CLASSES[normalised] ?? "";
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
