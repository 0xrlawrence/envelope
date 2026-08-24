"use client";

import { createStore, type Store } from "@starknet-io/get-starknet-discovery";
import {
  isStarknetWallet,
  type WalletWithStarknetFeatures,
} from "@starknet-io/get-starknet-wallet-standard/features";
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
import {
  NETWORKS,
  networkForChainId,
  type Network,
  type NetworkId,
} from "./config";

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
  switchingNetwork: boolean;
  networkError: string;
  error: string;
}

interface WalletContextValue extends WalletState {
  connect(wallet: WalletWithStarknetFeatures): Promise<void>;
  disconnect(): void;
  switchNetwork(network: NetworkId): Promise<void>;
  /** Re-scan for extensions that injected after the page first loaded. */
  refreshWallets(): void;
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
  switchingNetwork: false,
  networkError: "",
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
const LAST_NETWORK = "envelope.network";

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

function rememberNetwork(network: NetworkId): void {
  try {
    window.localStorage.setItem(LAST_NETWORK, network);
  } catch {
    // A blocked store only means the choice starts on Sepolia next time.
  }
}

function rememberedNetwork(): Network {
  try {
    const saved = window.localStorage.getItem(LAST_NETWORK);
    return saved === "mainnet" ? NETWORKS.mainnet : NETWORKS.sepolia;
  } catch {
    return NETWORKS.sepolia;
  }
}

/** Stable identity for the account data carried by wallet-standard events. */
function walletAccountSignature(
  accounts: readonly {
    readonly address: string;
    readonly chains: readonly string[];
  }[],
): string {
  return accounts
    .map(
      (account) =>
        `${account.address.toLowerCase()}@${[...account.chains].sort().join(",")}`,
    )
    .sort()
    .join("|");
}

async function connectedAccount(
  wallet: WalletWithStarknetFeatures,
  network: Network,
  address: string,
): Promise<{
  account: WalletAccountV6;
  accountClass: string;
}> {
  const provider = new RpcProvider({ nodeUrl: network.rpcUrl });
  // The account address has already been authorised and read immediately
  // before this helper runs. `WalletAccountV6.connect` performs another
  // standard-connect request, and its default is deliberately non-silent.
  // Ready emits wallet-standard change events while a STRK20 request is being
  // confirmed; rebuilding through that method could therefore reopen the
  // wallet UI over an envelope the chain had already funded. Constructing the
  // adapter from the known address performs no wallet request at all.
  const account = new WalletAccountV6({
    provider,
    walletProvider: wallet,
    address,
  });
  let accountClass = "";
  try {
    accountClass = await provider.getClassHashAt(address);
  } catch {
    // A missing class means the account has not sent its first transaction on
    // this network yet. The public address may still hold tokens there.
  }
  return { account, accountClass };
}

function requireKnownNetwork(chainId: string): Network {
  const network = networkForChainId(chainId);
  if (!network) {
    throw new Error(
      `This wallet is on an unsupported Starknet network (${chainId}). Switch it to Mainnet or Sepolia.`,
    );
  }
  return network;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(INITIAL);
  const discoveryStore = useRef<Store | null>(null);
  const lateStandardWallets = useRef(new Map<string, WalletWithStarknetFeatures>());
  const selectedNetwork = useRef<Network>(NETWORKS.sepolia);
  const connectedWallet = useRef<WalletWithStarknetFeatures | null>(null);
  const walletEventCleanup = useRef<(() => void) | null>(null);
  const networkSwitchInFlight = useRef(false);
  const walletSyncInFlight = useRef(false);
  const walletAccountsSignature = useRef("");
  // One attempt per load. Discovery fills in over several ticks, so without
  // this the effect below would fire again for every wallet that registers.
  const tried = useRef(false);

  // The choice belongs to the app even before a wallet is connected. Reading
  // it after mount avoids a server/client mismatch while still making every
  // route follow the remembered network as soon as the browser is available.
  useEffect(() => {
    const preferred = rememberedNetwork();
    selectedNetwork.current = preferred;
    setState((previous) =>
      previous.address ? previous : { ...previous, network: preferred },
    );
  }, []);

  useEffect(
    () => () => {
      walletEventCleanup.current?.();
    },
    [],
  );

  // Build the discovery store once on mount so wallets have time to register
  // themselves before anyone opens the picker. `eip1193Adapters: []` keeps
  // MetaMask out of discovery entirely; its Snap probing throws an unlock
  // popup at people who never asked for it.
  useEffect(() => {
    const store: Store = createStore({ eip1193Adapters: [] });
    discoveryStore.current = store;

    const publish = (discovered: readonly WalletWithStarknetFeatures[]) => {
      const merged = new Map(discovered.map((wallet) => [wallet.name, wallet]));
      // A wallet answering our late app-ready request is the modern standard
      // implementation, so prefer it over a legacy wrapper with the same name.
      for (const wallet of lateStandardWallets.current.values()) {
        merged.set(wallet.name, wallet);
      }
      setState((previous) => ({ ...previous, wallets: [...merged.values()] }));
    };

    publish(store.getWallets());
    const unsubscribe = store.subscribe(publish);
    return () => {
      unsubscribe();
      if (discoveryStore.current === store) discoveryStore.current = null;
      lateStandardWallets.current.clear();
    };
  }, []);

  // Browser extensions do not all inject at the same point in page startup.
  // Ready can appear after this provider has already performed its initial
  // scan, especially on a first visit while the extension is still unlocking.
  // The discovery package deliberately exposes a legacy-injection refresh for
  // that case. Re-dispatching the standard app-ready event covers wallets that
  // implement only the modern protocol but missed the event sent on mount.
  const refreshWallets = useCallback(() => {
    const store = discoveryStore.current;
    if (!store) return;

    store._refreshInjectedWallets();

    const register = (candidate: Parameters<typeof isStarknetWallet>[0]) => {
      if (!isStarknetWallet(candidate)) return () => undefined;
      if (lateStandardWallets.current.has(candidate.name)) return () => undefined;

      lateStandardWallets.current.set(candidate.name, candidate);
      const merged = new Map(store.getWallets().map((wallet) => [wallet.name, wallet]));
      for (const wallet of lateStandardWallets.current.values()) {
        merged.set(wallet.name, wallet);
      }
      setState((previous) => ({ ...previous, wallets: [...merged.values()] }));

      return () => {
        if (lateStandardWallets.current.get(candidate.name) !== candidate) return;
        lateStandardWallets.current.delete(candidate.name);
        const remaining = new Map(
          store.getWallets().map((wallet) => [wallet.name, wallet]),
        );
        for (const wallet of lateStandardWallets.current.values()) {
          remaining.set(wallet.name, wallet);
        }
        setState((previous) => ({ ...previous, wallets: [...remaining.values()] }));
      };
    };

    window.dispatchEvent(
      new CustomEvent("wallet-standard:app-ready", {
        detail: Object.freeze({ register }),
      }),
    );
  }, []);

  const synchronizeConnectedWallet = useCallback(
    async (wallet: WalletWithStarknetFeatures) => {
      if (networkSwitchInFlight.current || walletSyncInFlight.current) return;
      walletSyncInFlight.current = true;
      try {
        const chainId = (await walletV6.requestChainId(wallet)) as string;
        const network = requireKnownNetwork(chainId);
        const accounts = await walletV6.requestAccounts(wallet, true);
        if (!Array.isArray(accounts) || accounts.length === 0) {
          forgetWallet();
          connectedWallet.current = null;
          walletAccountsSignature.current = "";
          walletEventCleanup.current?.();
          walletEventCleanup.current = null;
          setState((previous) => ({
            ...INITIAL,
            wallets: previous.wallets,
            network: previous.network,
          }));
          return;
        }

        const address = validateAndParseAddress(accounts[0]);
        const details = await connectedAccount(wallet, network, address);
        selectedNetwork.current = network;
        walletAccountsSignature.current = walletAccountSignature(wallet.accounts);
        rememberNetwork(network.id);
        setState((previous) => ({
          ...previous,
          ...details,
          address,
          network,
          strk20: true,
          strk20Reason: "",
          accountDeployed: details.accountClass !== "",
          switchingNetwork: false,
          networkError: "",
        }));
      } catch (error) {
        setState((previous) => ({
          ...previous,
          networkError: describeNetworkFailure(error),
        }));
      } finally {
        walletSyncInFlight.current = false;
      }
    },
    [],
  );

  const connect = useCallback(async (wallet: WalletWithStarknetFeatures) => {
    setState((previous) => ({
      ...previous,
      connecting: true,
      error: "",
      networkError: "",
    }));
    try {
      // Order matters, and it is not obvious. Ready and Argent X answer almost
      // nothing until the dapp is authorised, and authorisation is what
      // `wallet_requestAccounts` asks for. Leading with any other call, even
      // one as innocuous as asking which chain we are on, is refused with
      // "Not preauthorized" before the user is ever shown a prompt.
      const authorisedAccounts = await walletV6.requestAccounts(wallet);
      if (!Array.isArray(authorisedAccounts) || authorisedAccounts.length === 0) {
        throw new Error("This wallet did not return an account.");
      }

      const permissions = (await walletV6.getPermissions(wallet)) as WALLET_API.Permission[];
      if (!permissions.includes(WALLET_API.Permission.ACCOUNTS)) {
        throw new Error("Account access was declined.");
      }

      // Only now is the wallet willing to talk. The network printed in the
      // header is a real selection, so connection must bring the wallet to it
      // rather than silently replacing the app's choice with whatever chain
      // the extension happened to be showing last.
      const wanted = selectedNetwork.current;
      let actual = requireKnownNetwork(
        (await walletV6.requestChainId(wallet)) as string,
      );
      if (actual.id !== wanted.id) {
        await walletV6.switchStarknetChain(wallet, wanted.chainId);
        actual = requireKnownNetwork(
          (await walletV6.requestChainId(wallet)) as string,
        );
        if (actual.id !== wanted.id) {
          throw new Error(`The wallet is still on ${actual.label}.`);
        }
      }

      const accounts = await walletV6.requestAccounts(wallet, true);
      if (!Array.isArray(accounts) || accounts.length === 0) {
        throw new Error(`This wallet has no account available on ${wanted.label}.`);
      }
      const address = validateAndParseAddress(accounts[0]);
      const details = await connectedAccount(wallet, wanted, address);

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
      try {
        // Prime the standard wrapper after authorisation so account/network
        // changes made inside the extension reach this app without another
        // permission prompt.
        await walletV6.standardConnect(wallet, true);
      } catch {
        // Some native standard wallets do not need this compatibility step.
      }

      walletEventCleanup.current?.();
      walletAccountsSignature.current = walletAccountSignature(wallet.accounts);
      walletEventCleanup.current = walletV6.subscribeWalletEvent(
        wallet,
        (properties) => {
          // `change` also reports feature and supported-chain metadata. Those
          // events do not mean the authorised account changed, and querying
          // the wallet again while it is presenting a transaction can reopen
          // or duplicate that approval surface. Only an accounts payload can
          // require rebuilding the connected adapter, and an identical payload
          // is a no-op.
          if (!properties.accounts) return;
          const signature = walletAccountSignature(properties.accounts);
          if (signature === walletAccountsSignature.current) return;
          walletAccountsSignature.current = signature;
          void synchronizeConnectedWallet(wallet);
        },
      );
      connectedWallet.current = wallet;

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
        ...details,
        address,
        network: wanted,
        specs,
        strk20: true,
        strk20Reason: "",
        walletName: wallet.name,
        accountDeployed: details.accountClass !== "",
        connecting: false,
        switchingNetwork: false,
        networkError: "",
      }));
      rememberWallet(wallet.name);
      rememberNetwork(wanted.id);
    } catch (error) {
      setState((previous) => ({
        ...previous,
        connecting: false,
        error: describeConnectFailure(error),
      }));
    }
  }, [synchronizeConnectedWallet]);

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

  const switchNetwork = useCallback(async (networkId: NetworkId) => {
    const wanted = NETWORKS[networkId];
    const wallet = connectedWallet.current;

    if (!wallet) {
      selectedNetwork.current = wanted;
      rememberNetwork(wanted.id);
      setState((previous) => ({
        ...previous,
        network: wanted,
        networkError: "",
      }));
      return;
    }

    networkSwitchInFlight.current = true;
    setState((previous) => ({
      ...previous,
      switchingNetwork: true,
      networkError: "",
    }));
    try {
      const current = requireKnownNetwork(
        (await walletV6.requestChainId(wallet)) as string,
      );
      if (current.id !== wanted.id) {
        await walletV6.switchStarknetChain(wallet, wanted.chainId);
      }

      const actual = requireKnownNetwork(
        (await walletV6.requestChainId(wallet)) as string,
      );
      if (actual.id !== wanted.id) {
        throw new Error(`The wallet is still on ${actual.label}.`);
      }

      const accounts = await walletV6.requestAccounts(wallet, true);
      if (!Array.isArray(accounts) || accounts.length === 0) {
        throw new Error(`This wallet has no account available on ${wanted.label}.`);
      }
      const address = validateAndParseAddress(accounts[0]);
      const details = await connectedAccount(wallet, wanted, address);

      selectedNetwork.current = wanted;
      walletAccountsSignature.current = walletAccountSignature(wallet.accounts);
      rememberNetwork(wanted.id);
      setState((previous) => ({
        ...previous,
        ...details,
        address,
        network: wanted,
        strk20: true,
        strk20Reason: "",
        accountDeployed: details.accountClass !== "",
        switchingNetwork: false,
        networkError: "",
      }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        switchingNetwork: false,
        networkError: describeNetworkFailure(error),
      }));
    } finally {
      networkSwitchInFlight.current = false;
    }
  }, []);

  const disconnect = useCallback(() => {
    const wallet = connectedWallet.current;
    // Wallet Standard defines disconnect as cleanup without revoking account
    // permission. Tell the adapter before dropping our references so any
    // outstanding request UI is detached from this page as well.
    void wallet?.features["standard:disconnect"].disconnect().catch(() => undefined);
    forgetWallet();
    walletEventCleanup.current?.();
    walletEventCleanup.current = null;
    connectedWallet.current = null;
    walletAccountsSignature.current = "";
    setState((previous) => ({
      ...INITIAL,
      wallets: previous.wallets,
      network: selectedNetwork.current,
    }));
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

      try {
        const actual = requireKnownNetwork(
          (await walletV6.requestChainId(wallet)) as string,
        );
        const wanted = selectedNetwork.current;
        if (actual.id !== wanted.id) {
          setState((previous) => ({
            ...previous,
            networkError: `Your wallet is on ${actual.label}. Click Connect to switch it to ${wanted.label}.`,
          }));
          return;
        }
      } catch (error) {
        setState((previous) => ({
          ...previous,
          networkError: describeNetworkFailure(error),
        }));
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

  const provider = useMemo(
    () => new RpcProvider({ nodeUrl: state.network.rpcUrl }),
    [state.network.rpcUrl],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      ...state,
      connect,
      disconnect,
      switchNetwork,
      refreshWallets,
      reportStrk20Unsupported,
      provider,
      // A wallet without STRK20 can still sign an ordinary call, which is all
      // the public claim path needs, but cannot shield, seal, or claim
      // privately.
      supportsStrk20: state.strk20,
    }),
    [
      state,
      connect,
      disconnect,
      switchNetwork,
      refreshWallets,
      reportStrk20Unsupported,
      provider,
    ],
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

function describeNetworkFailure(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/reject|refused|denied|declined/i.test(message)) {
    return "The network switch was declined in the wallet. The app stayed on the previous network.";
  }
  return message || "The wallet could not switch networks. Try again from the network button.";
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
