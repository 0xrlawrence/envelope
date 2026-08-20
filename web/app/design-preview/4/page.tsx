"use client";

import { useState } from "react";
import {
  AMOUNTS, AMOUNT_NOTE, BALANCES, EXPIRIES, FOOT, HEADLINE, LOCKS, MEMO, NAV,
  SOURCES, SOURCE_NOTE, STANDFIRST,
} from "../content";

/**
 * World 4: Banknote.
 *
 * Security printing. A guilloche ground, hairline rules, Bodoni for every
 * figure, and the two inks a note is actually struck in. The page is laid out
 * as a certificate: masthead across the top, the denomination held in the
 * middle, the terms set as a ledger, and a serial along the foot.
 */
export default function Banknote() {
  const [amount, setAmount] = useState("1");
  const [source, setSource] = useState<string>(SOURCES[0]);
  const [expiry, setExpiry] = useState<string>(EXPIRIES[1]);
  const [lock, setLock] = useState<string>(LOCKS[0]);

  return (
    <div className="dp w4" data-preview>
      <div className="dp-chev" />
      <header className="dp-wrap dp-head" style={{ borderBottom: "1px solid rgba(16,20,16,0.35)" }}>
        <span className="dp-mark">Envelope</span>
        <nav className="dp-nav">
          {NAV.map((item) => <span key={item}>{item}</span>)}
          <b>Connect</b>
        </nav>
      </header>

      <main className="dp-body dp-wrap">
        <section className="dp-panel relative px-5 py-8 sm:px-10 sm:py-10">
          <div className="dp-tint pointer-events-none absolute inset-0 opacity-70" />

          <div className="relative border-b pb-6 text-center" style={{ borderColor: "rgba(16,20,16,0.3)" }}>
            <p className="dp-label">Bearer instrument · Starknet Sepolia · STRK20</p>
            <h1 className="dp-h1 mt-3">{HEADLINE}</h1>
            <p className="mx-auto mt-4 max-w-[54ch] text-[0.95rem] leading-relaxed" style={{ color: "var(--dp-dim)" }}>
              {STANDFIRST}
            </p>
          </div>

          <div className="relative mt-8 grid gap-8 lg:grid-cols-[auto_1fr] lg:items-start">
            <div className="text-center lg:w-56">
              <p className="dp-label">Denomination</p>
              <p className="num mt-2 font-[family-name:var(--dp-display)] text-[5.5rem] leading-[0.85]"
                style={{ color: "var(--dp-accent)" }}>
                {amount}
              </p>
              <p className="dp-label mt-1">Strk</p>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {AMOUNTS.map((value) => (
                  <button key={value} className="dp-pick num" data-on={value === amount} onClick={() => setAmount(value)}>
                    {value}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[0.72rem] leading-snug" style={{ color: "var(--dp-faint)" }}>{AMOUNT_NOTE}</p>
              <div className="mt-6 grid place-items-center">
                <div className="dp-frank">Sealed<br />Not yet<br />claimed</div>
              </div>
            </div>

            <dl className="border-t" style={{ borderColor: "rgba(16,20,16,0.3)" }}>
              <Ledger label="Drawn from" note={SOURCE_NOTE}>
                <Picks options={SOURCES} value={source} onPick={setSource} />
              </Ledger>
              <Ledger label="Opens for">
                <Picks options={EXPIRIES} value={expiry} onPick={setExpiry} />
              </Ledger>
              <Ledger label="Addressed to">
                <Picks options={LOCKS} value={lock} onPick={setLock} />
              </Ledger>
              <Ledger label="Reference">
                <p className="font-[family-name:var(--dp-mono)] text-[0.85rem]">{MEMO}</p>
              </Ledger>
              {BALANCES.map((balance) => (
                <Ledger key={balance.label} label={balance.label}>
                  <p className="num font-[family-name:var(--dp-display)] text-xl">
                    {balance.value} <span className="text-[0.7rem]">{balance.unit}</span>
                  </p>
                </Ledger>
              ))}
            </dl>
          </div>

          <div className="relative mt-9 flex flex-wrap items-center justify-between gap-5 border-t pt-6"
            style={{ borderColor: "rgba(16,20,16,0.45)" }}>
            <p className="num font-[family-name:var(--dp-mono)] text-[0.72rem]" style={{ color: "var(--dp-faint)" }}>
              Serial EN-0000-1101 · Pays to bearer on presentation of the link
            </p>
            <button className="dp-cta">Seal and send</button>
          </div>
        </section>
      </main>

      <div className="dp-wrap dp-foot" style={{ borderTop: "1px solid rgba(16,20,16,0.35)" }}>
        <span>{FOOT}</span>
        <span>@0xrlawrence · Source</span>
      </div>
      <div className="dp-chev" />
    </div>
  );
}

function Ledger({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b py-3.5 sm:grid-cols-[10rem_1fr] sm:items-baseline sm:gap-5"
      style={{ borderColor: "rgba(16,20,16,0.18)" }}>
      <dt className="dp-label">{label}</dt>
      <dd>
        {children}
        {note ? (
          <p className="mt-2 max-w-[46ch] text-[0.75rem]" style={{ color: "var(--dp-faint)" }}>{note}</p>
        ) : null}
      </dd>
    </div>
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
