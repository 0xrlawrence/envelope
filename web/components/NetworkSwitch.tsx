"use client";

import { useSound } from "@/lib/sound";
import { useWallet } from "@/lib/wallet";

export function NetworkSwitch() {
  const { network, switchNetwork, switchingNetwork, networkError } = useWallet();
  const { play } = useSound();
  const target = network.id === "sepolia" ? "mainnet" : "sepolia";
  const targetLabel = target === "mainnet" ? "Mainnet" : "Sepolia";

  return (
    <div className="relative">
      <button
        type="button"
        disabled={switchingNetwork}
        onClick={() => {
          play("tap");
          void switchNetwork(target);
        }}
        className={`inline-flex min-h-9 items-center border px-2 py-1.5 font-mono text-[0.65rem] tracking-[0.14em] whitespace-nowrap uppercase transition-[background-color,border-color,color,opacity] duration-150 disabled:cursor-wait disabled:opacity-60 sm:min-h-0 sm:px-3 sm:py-2 sm:text-xs sm:tracking-widest ${
          network.id === "mainnet"
            ? "border-[var(--frank)] bg-[var(--frank)] text-[var(--ink-deep)] hover:border-[var(--paper)] hover:bg-[var(--paper)]"
            : "border-[var(--ink-line)] bg-[var(--ink-raised)] text-[var(--paper-dim)] hover:border-[var(--frank)] hover:text-[var(--frank)]"
        }`}
        aria-label={
          switchingNetwork
            ? `Switching to ${targetLabel}`
            : `${network.label}. Switch to ${targetLabel}`
        }
        title={
          switchingNetwork
            ? `Switching wallet to ${targetLabel}`
            : `Currently on ${network.label}. Switch to ${targetLabel}`
        }
      >
        {switchingNetwork ? "Switching…" : network.label}
      </button>

      {networkError ? (
        <p
          role="alert"
          className="absolute top-[calc(100%+0.5rem)] right-0 z-50 w-[min(18rem,calc(100vw-1.5rem))] border border-[var(--seal)] bg-[var(--ink)] px-3 py-2 text-xs leading-snug text-[var(--paper-dim)] shadow-[0_8px_24px_color-mix(in_srgb,var(--ink-deep)_30%,transparent)]"
        >
          {networkError}
        </p>
      ) : null}
    </div>
  );
}
