"use client";

import { useState } from "react";
import {
  AMOUNTS, AMOUNT_NOTE, BALANCES, EXPIRIES, FOOT, LOCKS, MEMO, NAV, SOURCES,
  SOURCE_NOTE, STANDFIRST,
} from "../content";

/**
 * World 8: Riso overprint.
 *
 * Two ink drums on newsprint: fluorescent pink and reflex blue, multiplied
 * where they cross and a hair out of registration, because that is what the
 * machine actually does. Everything is set as loud as the stock allows.
 */
export default function Riso() {
  const [amount, setAmount] = useState("1");
  const [source, setSource] = useState<string>(SOURCES[0]);
  const [expiry, setExpiry] = useState<string>(EXPIRIES[1]);
  const [lock, setLock] = useState<string>(LOCKS[0]);

  return (
    <div className="dp w8" data-preview>
      <div className="dp-chev" />
      <header className="dp-wrap dp-head" style={{ borderBottom: "3px solid var(--dp-ink)" }}>
        <span className="dp-mark" style={{ color: "var(--dp-accent2)" }}>Envelope</span>
        <nav className="dp-nav" style={{ fontFamily: "var(--dp-display)", fontSize: "0.95rem" }}>
          {NAV.map((item) => <span key={item}>{item}</span>)}
          <span className="px-2 py-0.5" style={{ background: "var(--dp-accent)", color: "#fff" }}>Connect</span>
        </nav>
      </header>

      <main className="dp-body dp-wrap">
        <h1 className="dp-h1">One line,<br />one envelope.</h1>
        <p className="mt-5 max-w-[54ch] text-[1rem] leading-relaxed" style={{ color: "var(--dp-dim)" }}>
          {STANDFIRST}
        </p>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_20rem] lg:items-start">
          <section className="dp-panel relative">
            <div className="dp-tint absolute inset-0" />
            <div className="relative p-5 sm:p-7">
              <p className="dp-label">Contents</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {AMOUNTS.map((value) => (
                  <button key={value} className="dp-pick" data-on={value === amount} onClick={() => setAmount(value)}
                    style={{ fontSize: "2rem", padding: "0.5rem 1.2rem" }}>
                    {value}
                  </button>
                ))}
              </div>
              <p className="mt-3 max-w-[54ch] text-[0.8rem] leading-snug" style={{ color: "var(--dp-faint)" }}>
                {AMOUNT_NOTE}
              </p>

              <div className="mt-7 grid gap-6 sm:grid-cols-2">
                <Block label="Drawn from" note={SOURCE_NOTE}>
                  <Picks options={SOURCES} value={source} onPick={setSource} />
                </Block>
                <Block label="Opens for">
                  <Picks options={EXPIRIES} value={expiry} onPick={setExpiry} />
                </Block>
                <Block label="Addressed to">
                  <Picks options={LOCKS} value={lock} onPick={setLock} />
                </Block>
                <Block label="Reference">
                  <p className="font-[family-name:var(--dp-mono)] text-[0.82rem]">{MEMO}</p>
                </Block>
              </div>
            </div>
          </section>

          <aside className="grid gap-4">
            <div className="p-5" style={{ background: "var(--dp-accent2)", color: "#fffdf6" }}>
              <p className="font-[family-name:var(--dp-display)] text-[1rem] tracking-[0.2em]">Total sealed</p>
              <p className="font-[family-name:var(--dp-display)] text-[5rem] leading-[0.8]"
                style={{ textShadow: "3px 3px 0 var(--dp-accent)" }}>
                {amount}
              </p>
              <p className="font-[family-name:var(--dp-mono)] text-[0.65rem] tracking-[0.24em]">STRK · SEPOLIA</p>
            </div>
            <div className="dp-panel p-5">
              {BALANCES.map((balance) => (
                <div key={balance.label} className="flex items-baseline justify-between border-b py-2 last:border-0"
                  style={{ borderColor: "rgba(27,26,23,0.15)" }}>
                  <span className="dp-label">{balance.label}</span>
                  <span className="font-[family-name:var(--dp-display)] text-xl">
                    {balance.value} {balance.unit}
                  </span>
                </div>
              ))}
            </div>
            <button className="dp-cta">Seal and send</button>
          </aside>
        </div>
      </main>

      <div className="dp-wrap dp-foot" style={{ borderTop: "3px solid var(--dp-ink)" }}>
        <span>{FOOT}</span>
        <span>@0xrlawrence · Source</span>
      </div>
      <div className="dp-chev" />
    </div>
  );
}

function Block({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="border-t-2 pt-3" style={{ borderColor: "var(--dp-accent2)" }}>
      <p className="dp-label">{label}</p>
      <div className="mt-2.5">{children}</div>
      {note ? <p className="mt-2.5 text-[0.78rem] leading-snug" style={{ color: "var(--dp-faint)" }}>{note}</p> : null}
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
