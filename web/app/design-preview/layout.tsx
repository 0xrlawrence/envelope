import {
  Anton, Archivo, Archivo_Black, Bebas_Neue, Bodoni_Moda, Cormorant_Garamond,
  Courier_Prime, DM_Sans, DM_Serif_Display, EB_Garamond, Inter_Tight,
  JetBrains_Mono, Karla, Oswald, Playfair_Display, Roboto_Mono, Space_Grotesk,
  Space_Mono,
} from "next/font/google";
import type { ReactNode } from "react";
import { VariantBar } from "./shell";
import "./preview.css";

/*
 * Every face the ten worlds are set in.
 *
 * Loaded through next/font rather than an @import in the stylesheet: the build
 * resolves @import at compile time and drops the remote one, which silently
 * leaves all ten worlds rendering in Times and Helvetica. This is also how the
 * shipping app loads its own three, so a world that gets picked is already
 * wired the way the rest of the site is.
 */
const anton = Anton({ variable: "--f-anton", subsets: ["latin"], weight: "400" });
const archivo = Archivo({ variable: "--f-archivo", subsets: ["latin"] });
const archivoBlack = Archivo_Black({ variable: "--f-archivo-black", subsets: ["latin"], weight: "400" });
const bebas = Bebas_Neue({ variable: "--f-bebas", subsets: ["latin"], weight: "400" });
const bodoni = Bodoni_Moda({ variable: "--f-bodoni", subsets: ["latin"], style: ["normal", "italic"] });
const cormorant = Cormorant_Garamond({
  variable: "--f-cormorant", subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"],
});
const courier = Courier_Prime({ variable: "--f-courier", subsets: ["latin"], weight: ["400", "700"] });
const dmSans = DM_Sans({ variable: "--f-dm-sans", subsets: ["latin"] });
const dmSerif = DM_Serif_Display({
  variable: "--f-dm-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"],
});
const garamond = EB_Garamond({ variable: "--f-garamond", subsets: ["latin"], style: ["normal", "italic"] });
const interTight = Inter_Tight({ variable: "--f-inter-tight", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--f-jetbrains", subsets: ["latin"] });
const karla = Karla({ variable: "--f-karla", subsets: ["latin"] });
const oswald = Oswald({ variable: "--f-oswald", subsets: ["latin"] });
const playfair = Playfair_Display({
  variable: "--f-playfair", subsets: ["latin"], style: ["normal", "italic"],
});
const robotoMono = Roboto_Mono({ variable: "--f-roboto-mono", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ variable: "--f-space-grotesk", subsets: ["latin"] });
const spaceMono = Space_Mono({ variable: "--f-space-mono", subsets: ["latin"], weight: ["400", "700"] });

const FACES = [
  anton, archivo, archivoBlack, bebas, bodoni, cormorant, courier, dmSans,
  dmSerif, garamond, interTight, jetbrains, karla, oswald, playfair, robotoMono,
  spaceGrotesk, spaceMono,
].map((face) => face.variable).join(" ");

/** Every variant gets the faces and the switcher without knowing about either. */
export default function PreviewLayout({ children }: { children: ReactNode }) {
  return (
    <div className={FACES}>
      {children}
      <VariantBar />
    </div>
  );
}
