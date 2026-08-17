import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";
import type { ReactNode } from "react";
import { SecurityField } from "@/components/SecurityField";
import { MobileNav } from "@/components/MobileNav";
import { SiteHeader } from "@/components/SiteHeader";
import { SoundProvider } from "@/lib/sound";
import { THEME_SCRIPT, ThemeProvider } from "@/lib/theme";
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
  title: "Envelope: private money, sent as a link",
  description:
    "Seal shielded tokens into an envelope and hand over a link. The STRK20 pool hides who paid, and shielded-funded envelopes can only be claimed into a private balance.",
};

/**
 * `viewportFit: "cover"` lets the page paint under a notch and a home
 * indicator, which is what the airmail edge at the top wants to do. It also
 * turns on the `env(safe-area-inset-*)` values the header, footer and the
 * pinned approvals panel use to keep their own contents clear of both.
 *
 * Zoom is deliberately left alone. Pinning `maximum-scale` is the usual
 * companion to this and it takes magnification away from anyone who needs it,
 * on a page about money.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The dark value, because dark is the default. The theme is a stored choice
  // rather than an OS preference, so a `prefers-color-scheme` pair here would
  // be wrong half the time; the provider rewrites this tag when it knows.
  themeColor: "#080c11",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Before the first paint, so a reader who chose light paper never gets
            a frame of black on the way in. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${condensed.variable} ${sans.variable} ${mono.variable} antialiased`}>
        <ThemeProvider>
        <SoundProvider>
          <WalletProvider>
            <SecurityField />
            <div className="flex min-h-dvh flex-col pb-[calc(3.65rem+env(safe-area-inset-bottom))] sm:pb-0">
              <SiteHeader />
              {/* The centring is done with an auto margin rather than
                  `items-center`. They look identical while the page fits, and
                  differ entirely when it does not: a centred flex item taller
                  than its container overflows in both directions, and the part
                  that goes off the top cannot be scrolled back to. That is the
                  normal case on a phone, where every page is taller than the
                  screen. An auto margin resolves to zero when there is no room
                  to spare, so the page simply starts at the top and scrolls. */}
              <main className="flex flex-1 flex-col">
                {/* Centred on a wide screen, where the layout is two columns
                    sized to fit the viewport and the balance is the point.
                    Pinned to the top below that, because a stacked page on a
                    phone is nearly always taller than the screen, and on the
                    few that are not, floating the content down into the middle
                    just puts a blank band under the header. */}
                <div className="mx-auto mb-auto w-full lg:my-auto">{children}</div>
              </main>
              <footer className="pad-safe-b border-t border-[var(--ink-line)]">
                <div className="mx-auto flex max-w-5xl flex-col gap-0.5 px-3 py-2 text-[var(--paper-faint)] sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6 sm:py-[clamp(0.6rem,1.7vh,1.25rem)] sm:text-sm">
                  <p className="text-[0.68rem] leading-snug sm:text-sm">
                    Unaudited. It moves real money on mainnet. Read it before you trust it.
                  </p>
                  <nav
                    aria-label="Project links"
                    className="flex self-start font-mono text-[0.65rem] tracking-widest uppercase sm:self-auto sm:text-xs"
                  >
                    <a
                      className="inline-flex min-h-9 items-center pr-3 underline decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-[var(--frank)] focus-visible:text-[var(--frank)] sm:min-h-0 sm:pr-4"
                      href="https://x.com/0xrlawrence"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="0xrlawrence on X (opens in a new tab)"
                    >
                      @0xrlawrence
                    </a>
                    <a
                      className="inline-flex min-h-9 items-center border-l border-[var(--ink-line)] pl-3 underline decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-[var(--frank)] focus-visible:text-[var(--frank)] sm:min-h-0 sm:pl-4"
                      href="https://github.com/0xrlawrence/envelope"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Source
                    </a>
                  </nav>
                </div>
              </footer>
              <MobileNav />
            </div>
          </WalletProvider>
        </SoundProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
