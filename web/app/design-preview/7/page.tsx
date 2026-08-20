"use client";

import { useState } from "react";
import {
  AMOUNTS, AMOUNT_NOTE, BALANCES, EXPIRIES, FOOT, LOCKS, MEMO, NAV, SOURCES,
  SOURCE_NOTE, STANDFIRST,
} from "../content";

/**
 * World 7: Wax and parchment.
 *
 * The oldest version of this product. A sealed letter is the original bearer
 * instrument: whoever breaks the wax has the contents, and the wax is the only
 * proof nobody did it first. Laid stock, gilt rules, a garalde cut, and the
 * seal struck once at the foot.
 */
export default function Wax() {
  const [amount, setAmount] = useState("1");
  const [source, setSource] = useState<string>(SOURCES[0]);
  const [expiry, setExpiry] = useState<string>(EXPIRIES[1]);
  const [lock, setLock] = useState<string>(LOCKS[0]);

  return (
    <div className="dp w7" data-preview>
      <div className="dp-chev" />
      <header className="dp-wrap dp-head">
        <span className="dp-mark">Envelope</span>
        <nav className="dp-nav" style={{ fontFamily: "var(--dp-display)", letterSpacing: "0.24em" }}>
          {NAV.map((item) => <span key={item}>{item}</span>)}
          <span style={{ color: "var(--dp-accent)" }}>Connect</span>
        </nav>
      </header>

      <main className="dp-body dp-wrap">
        <section className="dp-panel relative mx-auto max-w-3xl px-6 py-10 sm:px-12 sm:py-14">
          <div className="dp-tint pointer-events-none absolute inset-0 opacity-50" />

          <div className="relative text-center">
            <Rule />
            <p className="dp-label mt-5">Sealed under hand · Starknet Sepolia</p>
            <h1 className="dp-h1 mt-4">
              One line, <i>one envelope.</i>
            </h1>
            <p className="mx-auto mt-5 max-w-[54ch] text-[1.08rem] leading-[1.75]" style={{ color: "var(--dp-dim)" }}>
              {STANDFIRST}
            </p>
            <Rule className="mt-8" />
          </div>

          <div className="relative mt-10">
            <div className="text-center">
              <p className="dp-label">Contents</p>
              <div className="mt-3 flex flex-wrap justify-center gap-3">
                {AMOUNTS.map((value) => (
                  <button key={value} className="dp-pick" data-on={value === amount} onClick={() => setAmount(value)}
                    style={{ fontFamily: "var(--dp-display)", fontSize: "1.6rem", fontWeight: 700 }}>
                    {value}
                  </button>
                ))}
              </div>
              <p className="mx-auto mt-3 max-w-[44ch] text-[0.9rem] italic" style={{ color: "var(--dp-faint)" }}>
                {AMOUNT_NOTE}
              </p>
            </div>

            <dl className="mt-10 grid gap-x-12 sm:grid-cols-2">
              <Term label="Drawn from" note={SOURCE_NOTE}>
                <Picks options={SOURCES} value={source} onPick={setSource} />
              </Term>
              <Term label="Opens for">
                <Picks options={EXPIRIES} value={expiry} onPick={setExpiry} />
              </Term>
              <Term label="Addressed to">
                <Picks options={LOCKS} value={lock} onPick={setLock} />
              </Term>
              <Term label="Reference">
                <p className="font-[family-name:var(--dp-mono)] text-[0.85rem]">{MEMO}</p>
              </Term>
            </dl>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 border-y py-4 text-center"
              style={{ borderColor: "rgba(154,116,32,0.5)" }}>
              {BALANCES.map((balance) => (
                <p key={balance.label} className="text-[0.95rem]">
                  <span className="dp-label" style={{ fontSize: "0.7rem" }}>{balance.label}</span>{" "}
                  <span className="font-[family-name:var(--dp-display)] text-xl font-bold">
                    {balance.value} {balance.unit}
                  </span>
                </p>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-8">
              <div className="wax">Envelope<br />MMXXVI</div>
              <div className="text-center">
                <p className="dp-label">Total sealed</p>
                <p className="font-[family-name:var(--dp-display)] text-6xl leading-none font-bold">
                  {amount}<span className="ml-2 text-xl">STRK</span>
                </p>
                <button className="dp-cta mt-5">Seal and send</button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <div className="dp-wrap dp-foot" style={{ fontFamily: "var(--dp-body)" }}>
        <span>{FOOT}</span>
        <span>@0xrlawrence · Source</span>
      </div>
      <div className="dp-chev" />
    </div>
  );
}

/** A gilt rule with a lozenge in the middle, the way a letterpress page breaks. */
function Rule({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      <span className="h-px flex-1" style={{ background: "rgba(154,116,32,0.6)" }} />
      <span className="rotate-45" style={{ width: 6, height: 6, background: "var(--dp-accent)" }} />
      <span className="h-px flex-1" style={{ background: "rgba(154,116,32,0.6)" }} />
    </div>
  );
}

function Term({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="border-t py-4" style={{ borderColor: "rgba(42,28,20,0.2)" }}>
      <dt className="dp-label">{label}</dt>
      <dd className="mt-2">
        {children}
        {note ? <p className="mt-2 text-[0.9rem] italic" style={{ color: "var(--dp-faint)" }}>{note}</p> : null}
      </dd>
    </div>
  );
}

function Picks({ options, value, onPick }: { options: readonly string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1">
      {options.map((option) => (
        <button key={option} className="dp-pick" data-on={option === value} onClick={() => onPick(option)}>
          {option}
        </button>
      ))}
    </div>
  );
}
