"use client";

import { useState } from "react";
import {
  AMOUNTS, AMOUNT_NOTE, BALANCES, EXPIRIES, FOOT, LOCKS, MEMO, NAV, SOURCES,
  SOURCE_NOTE,
} from "../content";

/**
 * World 2: Telex.
 *
 * A wire terminal. One face at one size, amber on soot, everything on a fixed
 * character grid. The form is a message being composed and the panel under it
 * is the read-back, which is how a wire operator checks a transfer before
 * sending it: the machine repeats what it is about to do, in its own words.
 */
export default function Telex() {
  const [amount, setAmount] = useState("1");
  const [source, setSource] = useState<string>(SOURCES[0]);
  const [expiry, setExpiry] = useState<string>(EXPIRIES[1]);
  const [lock, setLock] = useState<string>(LOCKS[0]);

  return (
    <div className="dp w2" data-preview>
      <div className="dp-chev" />
      <header className="dp-wrap dp-head" style={{ borderBottom: "1px solid #1e2a30" }}>
        <span className="dp-mark">Envelope</span>
        <nav className="dp-nav">
          {NAV.map((item) => <span key={item}>{item}</span>)}
          <b>[ CONNECT ]</b>
        </nav>
      </header>

      <main className="dp-body dp-wrap">
        <p className="text-[0.68rem] tracking-[0.24em] uppercase" style={{ color: "var(--dp-faint)" }}>
          STRK20 · Sepolia · link 000 ready
        </p>
        <h1 className="dp-h1 mt-3">
          One line,<br />one envelope<span className="caret" />
        </h1>
        <p className="mt-4 max-w-[62ch] text-[0.82rem] leading-relaxed" style={{ color: "var(--dp-dim)" }}>
          Declare what is inside, who may open it and for how long. The link that comes
          out is the instrument: whoever holds it takes the contents.
        </p>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.35fr_1fr] lg:items-start">
          <section className="dp-panel relative">
            <div className="dp-tint absolute inset-0" />
            <div className="relative p-4 sm:p-5">
              <Line k="AMOUNT" v={`${amount} STRK`}>
                <Picks options={AMOUNTS} value={amount} onPick={setAmount} />
              </Line>
              <Note>{AMOUNT_NOTE}</Note>
              <Line k="SOURCE" v={source === SOURCES[0] ? "SHIELDED" : "PUBLIC"}>
                <Picks options={SOURCES} value={source} onPick={setSource} />
              </Line>
              <Note>{SOURCE_NOTE}</Note>
              <Line k="EXPIRY" v={expiry.toUpperCase()}>
                <Picks options={EXPIRIES} value={expiry} onPick={setExpiry} />
              </Line>
              <Line k="LOCK" v={lock.toUpperCase()}>
                <Picks options={LOCKS} value={lock} onPick={setLock} />
              </Line>
              <Line k="MEMO" v="PUBLIC">
                <p className="text-[0.8rem]" style={{ color: "var(--dp-ink)" }}>{MEMO}</p>
              </Line>
            </div>
          </section>

          <aside className="dp-panel p-4 sm:p-5">
            <p className="dp-label">Read-back</p>
            <pre className="mt-3 overflow-x-auto text-[0.72rem] leading-relaxed" style={{ color: "var(--dp-accent2)" }}>
{`> seal --amount ${amount}
       --from ${source === SOURCES[0] ? "shielded" : "wallet"}
       --expiry ${expiry.replace(" ", "")}
       --lock ${lock.toLowerCase()}

  net    sepolia
  pool   strk20
  claim  ${lock === "Bearer" ? "bearer link" : "link + password"}`}
            </pre>
            <div className="mt-4 border-t pt-3" style={{ borderColor: "#1e2a30" }}>
              {BALANCES.map((balance) => (
                <div key={balance.label} className="flex items-baseline justify-between py-1 text-[0.72rem]">
                  <span style={{ color: "var(--dp-faint)" }}>{balance.label.toUpperCase()}</span>
                  <span style={{ color: "var(--dp-ink)" }}>{balance.value} {balance.unit}</span>
                </div>
              ))}
            </div>
            <button className="dp-cta mt-5 w-full">Transmit</button>
          </aside>
        </div>
      </main>

      <div className="dp-wrap dp-foot" style={{ borderTop: "1px solid #1e2a30" }}>
        <span>{FOOT}</span>
        <span>@0xrlawrence · Source</span>
      </div>
      <div className="dp-chev" />
    </div>
  );
}

function Line({ k, v, children }: { k: string; v: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 border-b py-3 sm:grid-cols-[5.5rem_1fr_7rem] sm:items-start sm:gap-3"
      style={{ borderColor: "#151f24" }}>
      <span className="dp-label pt-1">{k}</span>
      <div>{children}</div>
      <span className="text-right text-[0.7rem] tracking-[0.1em]" style={{ color: "var(--dp-accent)" }}>{v}</span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-[52ch] pt-1.5 pb-1 text-[0.68rem] leading-snug sm:pl-[6.5rem]"
      style={{ color: "var(--dp-faint)" }}>
      {children}
    </p>
  );
}

function Picks({ options, value, onPick }: { options: readonly string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button key={option} className="dp-pick" data-on={option === value} onClick={() => onPick(option)}>
          {option}
        </button>
      ))}
    </div>
  );
}
