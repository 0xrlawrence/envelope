import {
  Archivo, Bricolage_Grotesque, Familjen_Grotesk, Instrument_Serif, Newsreader,
  Space_Grotesk,
} from "next/font/google";

/**
 * Display-face candidates, set on the real paper.
 *
 * Every row is the same four things the display face actually has to carry on
 * this site: the wordmark, the headline with its italic turn, a button, and the
 * denomination figures. A face that looks good in a specimen and falls apart at
 * 10px tracked-out caps is no use here, so all four are shown together.
 */
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const newsreader = Newsreader({ subsets: ["latin"], style: ["normal", "italic"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"] });
const archivo = Archivo({ subsets: ["latin"], style: ["normal", "italic"] });
const familjen = Familjen_Grotesk({ subsets: ["latin"], style: ["normal", "italic"] });

const FACES = [
  { n: 1, name: "Instrument Serif", note: "High contrast, tight, editorial. True italic. One weight only, so emphasis comes from size.", cls: instrumentSerif.className, weight: 400, track: "-0.02em" },
  { n: 2, name: "Newsreader", note: "A reading serif with a genuinely good italic. Quieter than a display face.", cls: newsreader.className, weight: 600, track: "-0.02em" },
  { n: 3, name: "Space Grotesk", note: "Signage grotesque. Already family with the Space Mono on the page. No true italic.", cls: spaceGrotesk.className, weight: 700, track: "-0.04em" },
  { n: 4, name: "Bricolage Grotesque", note: "Variable grotesque with ink traps and real quirk. No true italic.", cls: bricolage.className, weight: 800, track: "-0.035em" },
  { n: 5, name: "Archivo", name2: "", note: "Clean, solid, postal. True italic. The safe one.", cls: archivo.className, weight: 800, track: "-0.035em" },
  { n: 6, name: "Familjen Grotesk", note: "Grotesque with slightly odd curves. True italic.", cls: familjen.className, weight: 700, track: "-0.03em" },
] as const;

export default function TypeSpecimen() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 pb-28 sm:px-8">
      <p className="field-label">Display face, candidates</p>
      <h1 className="headline mt-2">Pick a number.</h1>
      <p className="mt-3 max-w-[62ch] text-[var(--paper-dim)]">
        The body face stays Karla and the machine face stays Space Mono. Only the
        display face changes: the wordmark, the headline, the buttons and the figures.
      </p>

      {FACES.map((face) => (
        <section key={face.n} className="mt-10 border-t border-[var(--ink-line)] pt-5">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-mono text-sm text-[var(--frank)] tabular-nums">
              {String(face.n).padStart(2, "0")}
            </span>
            <span className="font-mono text-sm tracking-[0.16em] uppercase">{face.name}</span>
            <span className="text-sm text-[var(--paper-dim)]">{face.note}</span>
          </div>

          <div className={`${face.cls} mt-5`}>
            <div className="flex items-baseline gap-5 border-b border-[var(--ink-line)] pb-3">
              <span
                className="uppercase"
                style={{ fontWeight: face.weight, letterSpacing: "0.34em", fontSize: "1.05rem" }}
              >
                Envelope
              </span>
              <span className="font-mono text-[0.65rem] tracking-[0.24em] text-[var(--paper-faint)] uppercase">
                STRK20 · Sealed · Agent
              </span>
            </div>

            <p
              className="mt-5"
              style={{
                fontWeight: face.weight,
                fontSize: "clamp(1.9rem, 4.6vw, 3rem)",
                lineHeight: 1,
                letterSpacing: face.track,
              }}
            >
              Private money{" "}
              <em style={{ fontStyle: "italic", color: "var(--frank)" }}>
                you can send as a link.
              </em>
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4">
              <span
                className="inline-flex items-center px-6 py-2.5"
                style={{ background: "var(--send)", color: "var(--ink-deep)", fontWeight: face.weight, fontSize: "1rem" }}
              >
                Seal and send
              </span>
              <span className="inline-flex items-baseline gap-6">
                {["1", "5", "10", "25", "100"].map((value, index) => (
                  <span
                    key={value}
                    style={{
                      fontWeight: face.weight,
                      fontSize: "1.35rem",
                      color: index === 0 ? "var(--frank)" : "var(--paper-dim)",
                      borderBottom: index === 0 ? "2px solid var(--frank)" : "2px solid transparent",
                      paddingBottom: "0.15rem",
                    }}
                  >
                    {value}
                  </span>
                ))}
              </span>
              <span style={{ fontWeight: face.weight, fontSize: "1.6rem" }}>
                1 <span className="font-mono text-[0.7rem] tracking-[0.2em]">STRK</span>
              </span>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
