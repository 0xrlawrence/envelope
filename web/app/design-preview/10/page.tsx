"use client";

import { useState } from "react";
import {
  AMOUNTS, AMOUNT_NOTE, BALANCES, EXPIRIES, FOOT, LOCKS, MEMO, NAV, SOURCES,
  SOURCE_NOTE, STANDFIRST,
} from "../content";

/**
 * World 10: Pneumatic.
 *
 * The sorting hall downstairs. Enamelled teal plates with brass fittings, and
 * the message loaded into a carrier before it goes down the tube. A serif from
 * the age when a letter arriving in seconds was a machine, not a network.
 */
export default function Pneumatic() {
  const [amount, setAmount] = useState("1");
  const [source, setSource] = useState<string>(SOURCES[0]);
  const [expiry, setExpiry] = useState<string>(EXPIRIES[1]);
  const [lock, setLock] = useState<string>(LOCKS[0]);

  return (
    <div className="dp w10" data-preview>
      <div className="dp-chev" />
      <header className="dp-wrap dp-head">
        <span className="dp-mark">Envelope</span>
        <nav className="dp-nav">
          {NAV.map((item) => <span key={item}>{item}</span>)}
          <span className="rounded-full px-3 py-1" style={{ background: "var(--dp-accent)", color: "#23180a" }}>
            Connect
          </span>
        </nav>
      </header>

      <main className="dp-body dp-wrap">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr] lg:items-center">
          <div>
            <p className="dp-label">Tube 4 · Station STRK20 · Sepolia</p>
            <h1 className="dp-h1 mt-4">
              One line,<br /><i>one envelope.</i>
            </h1>
            <p className="mt-5 max-w-[46ch] text-[1rem] leading-[1.7]" style={{ color: "var(--dp-dim)" }}>
              {STANDFIRST}
            </p>

            {/* The carrier, loaded and ready to drop. */}
            <div className="mt-8 flex items-center gap-4">
              <div className="carrier flex h-16 flex-1 items-center justify-between px-6">
                <span className="font-[family-name:var(--dp-display)] text-2xl" style={{ color: "#23180a" }}>
                  {amount} STRK
                </span>
                <span className="font-[family-name:var(--dp-mono)] text-[0.6rem] tracking-[0.26em]"
                  style={{ color: "#4a3510" }}>
                  LOADED
                </span>
              </div>
              <button className="dp-cta shrink-0">Send it down</button>
            </div>

            <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2">
              {BALANCES.map((balance) => (
                <p key={balance.label}>
                  <span className="dp-label">{balance.label}</span>{" "}
                  <span className="font-[family-name:var(--dp-display)] text-xl" style={{ color: "var(--dp-accent)" }}>
                    {balance.value} {balance.unit}
                  </span>
                </p>
              ))}
            </div>
          </div>

          <section className="dp-panel relative overflow-hidden p-5 sm:p-7">
            <div className="dp-tint absolute inset-0 opacity-70" />
            <div className="relative">
              <Plate label="Contents" note={AMOUNT_NOTE}>
                <div className="flex flex-wrap gap-2">
                  {AMOUNTS.map((value) => (
                    <button key={value} className="dp-pick" data-on={value === amount} onClick={() => setAmount(value)}
                      style={{ minWidth: "3.4rem", fontFamily: "var(--dp-display)", fontSize: "1.15rem" }}>
                      {value}
                    </button>
                  ))}
                </div>
              </Plate>
              <Plate label="Drawn from" note={SOURCE_NOTE}>
                <Picks options={SOURCES} value={source} onPick={setSource} />
              </Plate>
              <Plate label="Opens for">
                <Picks options={EXPIRIES} value={expiry} onPick={setExpiry} />
              </Plate>
              <Plate label="Addressed to">
                <Picks options={LOCKS} value={lock} onPick={setLock} />
              </Plate>
              <Plate label="Reference">
                <p className="font-[family-name:var(--dp-mono)] text-[0.82rem]">{MEMO}</p>
              </Plate>
            </div>
          </section>
        </div>
      </main>

      <div className="dp-wrap dp-foot" style={{ borderTop: "1px solid rgba(215,169,60,0.35)" }}>
        <span>{FOOT}</span>
        <span>@0xrlawrence · Source</span>
      </div>
      <div className="dp-chev" />
    </div>
  );
}

function Plate({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="border-b py-4 first:pt-0 last:border-0 last:pb-0"
      style={{ borderColor: "rgba(215,169,60,0.25)" }}>
      <p className="dp-label">{label}</p>
      <div className="mt-2.5">{children}</div>
      {note ? <p className="mt-2.5 max-w-[46ch] text-[0.78rem]" style={{ color: "var(--dp-faint)" }}>{note}</p> : null}
    </div>
  );
}

function Picks({ options, value, onPick }: { options: readonly string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button key={option} className="dp-pick" data-on={option === value} onClick={() => onPick(option)}>
          {option}
        </button>
      ))}
    </div>
  );
}
