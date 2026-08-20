"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { shortHex } from "@/lib/config";
import { useSound } from "@/lib/sound";
import { useWallet } from "@/lib/wallet";
import { Button } from "./ui";

export function ConnectButton() {
  const { wallets, address, network, connect, disconnect, connecting, error } = useWallet();
  const { play } = useSound();
  const [open, setOpen] = useState(false);
  /**
   * The portal needs a real `document`, and this app is prerendered to static
   * files, so the target does not exist until the browser has it.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [injected, setInjected] = useState<string[]>([]);

  // Discovery only listens for `wallet-standard:register-wallet`. A wallet that
  // still announces itself the old way, by hanging an object off `window`, is
  // invisible to it and to the picker, which then looks broken rather than
  // incomplete. Listing what is on `window` turns "nothing happened" into
  // something diagnosable.
  useEffect(() => {
    if (!open) return;
    const scan = () =>
      setInjected(
        Object.keys(window).filter((key) => key.toLowerCase().startsWith("starknet")),
      );
    scan();
    // Extensions commonly inject only after the user unlocks them.
    const timer = setInterval(scan, 1000);
    return () => clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      play("tap");
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, play]);

  useEffect(() => {
    if (error) play("error");
  }, [error, play]);

  const standardNames = new Set(wallets.map((w) => w.name.toLowerCase()));
  const unbridged = injected.filter((key) => {
    const name = key.replace(/^starknet_?/i, "").toLowerCase();
    return name && !standardNames.has(name) && name !== "";
  });

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
          onClick={() => {
            play("tap");
            disconnect();
          }}
          /* Shorter on a phone, where eleven characters of hex made this the
             widest and heaviest thing in the bar for no more information: the
             address is here to say which account is connected, and four
             characters at each end say that. */
          className="inline-flex min-h-9 items-center border border-[var(--ink-line)] px-1.5 py-1.5 font-mono text-[0.7rem] whitespace-nowrap text-[var(--paper-dim)] transition hover:border-[var(--seal)] hover:text-[var(--seal)] sm:min-h-0 sm:px-3 sm:py-2 sm:text-xs"
          title="Disconnect"
        >
          <span className="sm:hidden">{shortHex(address, 4, 4)}</span>
          <span className="hidden sm:inline">{shortHex(address)}</span>
        </button>
      </div>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        sound="open"
        onClick={() => setOpen(true)}
        className="!px-3 !py-2 !text-xs sm:!px-4 sm:!text-sm"
      >
        Connect
      </Button>

      {/*
        * Rendered into the body rather than where it sits in the markup.
        *
        * This button lives in the header, and the header is `sticky` with a
        * `z-index`, which makes it a stacking context. A dialog inside one is
        * sealed into it: its own `z-50` competes only with its siblings there,
        * and the whole header stacks at 30 against the page, so on a phone the
        * picker was being painted underneath the page it was supposed to cover.
        * No z-index on the dialog can win that, because the contest is not
        * between the dialog and the page. A portal takes it out of the header
        * entirely, which is also what makes it immune to whatever position or
        * transform the header grows next.
        */}
      {open && mounted
        ? createPortal(
        <div
          /* Scrollable, and centred by an auto margin on the panel rather than
             by `items-center`, so that a phone in landscape with the keyboard
             up can still reach the top of the dialog. */
          className="fixed inset-0 z-50 flex overflow-y-auto overscroll-contain bg-[color-mix(in_srgb,var(--ink-deep)_78%,transparent)] p-3 backdrop-blur-sm sm:p-6"
          onClick={() => {
            play("tap");
            setOpen(false);
          }}
          role="presentation"
        >
          <div
            className="m-auto w-full max-w-sm border border-[var(--ink-line)] bg-[var(--ink)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-picker-title"
          >
            <div className="airmail-edge h-1 sm:h-1.5" />
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <p id="wallet-picker-title" className="field-label">
                  Select a wallet
                </p>
                <button
                  type="button"
                  onClick={() => {
                    play("tap");
                    setOpen(false);
                  }}
                  className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-end p-2 font-display text-[0.65rem] font-semibold tracking-[0.16em] text-[var(--paper-faint)] uppercase transition-colors hover:text-[var(--paper)] sm:m-0 sm:min-h-0 sm:min-w-0 sm:p-0"
                >
                  Close
                </button>
              </div>
              <div className="mt-3 grid gap-1.5 sm:mt-4 sm:gap-2">
                {pickable.length === 0 ? (
                  <p className="text-sm text-[var(--paper-dim)]">
                    No Starknet wallet announced itself.{" "}
                    <a
                      className="text-[var(--frank)] underline"
                      href="https://www.ready.co/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ready
                    </a>{" "}
                    is the wallet with STRK20 privacy live. If it is installed, unlock
                    it and reopen this list, since extensions usually inject only once
                    unlocked.
                  </p>
                ) : null}

                {pickable.map((wallet) => (
                  <button
                    key={wallet.name}
                    disabled={connecting}
                    onClick={async () => {
                      play("tap");
                      await connect(wallet);
                      setOpen(false);
                    }}
                    className="flex min-h-11 items-center gap-2.5 border border-[var(--ink-line)] px-3 py-2.5 text-left transition hover:border-[var(--frank)] disabled:opacity-50 sm:gap-3 sm:px-4 sm:py-3"
                  >
                    {wallet.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={wallet.icon} alt="" className="h-6 w-6" />
                    ) : null}
                    <span className="font-display text-sm font-semibold">{wallet.name}</span>
                  </button>
                ))}
              </div>

              {error ? <p className="mt-3 text-sm text-[var(--seal)] sm:mt-4">{error}</p> : null}

              <div className="mt-3 border-t border-[var(--ink-line)] pt-2.5 sm:mt-4 sm:pt-3">
                <p className="font-mono text-[0.65rem] tracking-widest text-[var(--paper-faint)] uppercase">
                  {pickable.length} announced
                  {injected.length ? ` · ${injected.length} on window` : ""}
                </p>
                {unbridged.length ? (
                  <p className="mt-1.5 font-mono text-[0.65rem] break-all text-[var(--paper-faint)]">
                    Present but not announcing itself the modern way, so it cannot be
                    connected here: {unbridged.join(", ")}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>,
            document.body,
          )
        : null}
    </>
  );
}
