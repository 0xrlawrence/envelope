import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { WalletProvider } from "@/lib/wallet";
import "./globals.css";

const condensed = IBM_Plex_Sans_Condensed({
  variable: "--font-plex-condensed",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const sans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Envelope — private money, sent as a link",
  description:
    "Seal shielded tokens into an envelope and hand over a link. The STRK20 pool hides who paid; the recipient needs no viewing key, no registration, and no privacy wallet to get paid.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${condensed.variable} ${sans.variable} ${mono.variable} antialiased`}>
        <WalletProvider>
          <div className="min-h-dvh">
            <SiteHeader />
            <main>{children}</main>
            <footer className="mt-24 border-t border-[var(--ink-line)]">
              <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-8 text-sm text-[var(--paper-faint)] sm:flex-row sm:items-center sm:justify-between">
                <p>
                  Unaudited. It moves real money on mainnet — read it before you trust it.
                </p>
                <a
                  className="font-mono text-xs tracking-widest uppercase underline decoration-dotted underline-offset-4 hover:text-[var(--frank)]"
                  href="https://github.com/0xrlawrence/envelope"
                  target="_blank"
                  rel="noreferrer"
                >
                  Source
                </a>
              </div>
            </footer>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
