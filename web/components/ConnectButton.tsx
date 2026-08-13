"use client";

import { useState } from "react";
import { shortHex } from "@/lib/config";
import { useWallet } from "@/lib/wallet";
import { Button } from "./ui";

export function ConnectButton() {
  const { wallets, address, network, connect, disconnect, connecting, error } = useWallet();
  const [open, setOpen] = useState(false);

  // Braavos is filtered out of the starter kit's picker; here every detected
  // wallet is offered and the STRK20 capability check happens after connecting,
  // so a wallet without privacy support can still drive the public claim path.
  const pickable = wallets.filter(
    (wallet) => !wallet.name.toLowerCase().replace(/[^a-z]/g, "").includes("metamask"),
  );

  if (address) {
    return (
      <div className="flex items-center gap-3">
        <span className="hidden font-mono text-xs tracking-widest text-[var(--paper-faint)] uppercase sm:inline">
          {network.label}
        </span>
        <button
          onClick={disconnect}
          className="border border-[var(--ink-line)] px-3 py-2 font-mono text-xs text-[var(--paper-dim)] transition hover:border-[var(--seal)] hover:text-[var(--seal)]"
          title="Disconnect"
        >
          {shortHex(address)}
        </button>
      </div>
    );
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="!px-4 !py-2">
        Connect
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm border border-[var(--ink-line)] bg-[var(--ink)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="airmail-edge h-1.5" />
            <div className="p-6">
              <p className="field-label">Select a wallet</p>
              <div className="mt-4 grid gap-2">
                {pickable.length === 0 ? (
                  <p className="text-sm text-[var(--paper-dim)]">
                    No Starknet wallet detected. Install{" "}
                    <a
                      className="text-[var(--frank)] underline"
                      href="https://www.ready.co/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ready
                    </a>{" "}
                    — it is the wallet with STRK20 privacy live on mainnet.
                  </p>
                ) : null}

                {pickable.map((wallet) => (
                  <button
                    key={wallet.name}
                    disabled={connecting}
                    onClick={async () => {
                      await connect(wallet);
                      setOpen(false);
                    }}
                    className="flex items-center gap-3 border border-[var(--ink-line)] px-4 py-3 text-left transition hover:border-[var(--frank)] disabled:opacity-50"
                  >
                    {wallet.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={wallet.icon} alt="" className="h-6 w-6" />
                    ) : null}
                    <span className="font-display text-sm font-semibold">{wallet.name}</span>
                  </button>
                ))}
              </div>

              {error ? <p className="mt-4 text-sm text-[var(--seal)]">{error}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
