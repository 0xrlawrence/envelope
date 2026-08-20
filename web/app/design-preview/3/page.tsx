"use client";

import { useState } from "react";
import {
  AMOUNTS, AMOUNT_NOTE, BALANCES, EXPIRIES, FOOT, LOCKS, MEMO, NAV, SOURCES,
  SOURCE_NOTE, STANDFIRST,
} from "../content";

/**
 * World 3: Par avion.
 *
 * Cream airmail stock, one blue ink and one red. The headline is set in a high
 * contrast serif because this world is a letter rather than an interface, and
 * the composition is the face of the envelope: stamp in the corner, address
 * block ranged left, postmark struck over it on the way out.
 */
export default function ParAvion() {
  const [amount, setAmount] = useState("1");
  const [source, setSource] = useState<string>(SOURCES[0]);
  const [expiry, setExpiry] = useState<string>(EXPIRIES[1]);
  const [lock, setLock] = useState<string>(LOCKS[0]);

  return (
    <div className="dp w3" data-preview>
      <div className="dp-chev" />
      <header className="dp-wrap dp-head">
        <span className="dp-mark">Envelope</span>
        <nav className="dp-nav">
          {NAV.map((item) => <span key={item}>{item}</span>)}
          <span className="border-b-2 pb-0.5" style={{ color: "var(--dp-accent)", borderColor: "var(--dp-accent)" }}>
            Connect
          </span>
        </nav>
      </header>

      <main className="dp-body dp-wrap">
        <section className="dp-panel relative overflow-hidden px-5 py-8 sm:px-10 sm:py-12">
          <div className="dp-tint pointer-events-none absolute inset-0 opacity-60" />

          <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-start">
            <div className="max-w-[36rem]">
              <p className="dp-label">Par avion · By air mail</p>
              <h1 className="dp-h1 mt-4">
                One line,<br /><em>one envelope.</em>
              </h1>
              <p className="mt-5 max-w-[52ch] text-[1.02rem] leading-[1.7]" style={{ color: "var(--dp-dim)" }}>
                {STANDFIRST}
              </p>
            </div>

            <div className="dp-perf shrink-0 justify-self-start lg:justify-self-end"
              style={{ background: "var(--dp-accent)" }}>
              <div className="grid h-28 w-24 place-content-center px-2 text-center"
                style={{ background: "var(--dp-accent)", color: "#fbf8f1" }}>
                <span className="font-[family-name:var(--dp-display)] text-4xl leading-none">{amount}</span>
                <span className="mt-1 font-[family-name:var(--dp-mono)] text-[0.55rem] tracking-[0.2em]">STRK</span>
                <span className="mt-2 font-[family-name:var(--dp-mono)] text-[0.5rem] tracking-[0.14em] opacity-80">
                  STRK20
                </span>
              </div>
            </div>
          </div>

          <div className="relative mt-12 grid gap-x-12 gap-y-8 sm:grid-cols-2">
            <Field label="Contents">
              <div className="flex flex-wrap gap-4">
                {AMOUNTS.map((value) => (
                  <button key={value} className="dp-pick" data-on={value === amount} onClick={() => setAmount(value)}
                    style={{ fontSize: "1.15rem", fontFamily: "var(--dp-display)" }}>
                    {value}
                  </button>
                ))}
              </div>
              <Note>{AMOUNT_NOTE}</Note>
            </Field>

            <Field label="Drawn from">
              <Picks options={SOURCES} value={source} onPick={setSource} />
              <Note>{SOURCE_NOTE}</Note>
            </Field>

            <Field label="Opens for">
              <Picks options={EXPIRIES} value={expiry} onPick={setExpiry} />
            </Field>

            <Field label="Addressed to">
              <Picks options={LOCKS} value={lock} onPick={setLock} />
            </Field>

            <Field label="Reference">
              <p className="font-[family-name:var(--dp-mono)] text-[0.85rem]">{MEMO}</p>
            </Field>

            <Field label="Held today">
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                {BALANCES.map((balance) => (
                  <p key={balance.label} className="font-[family-name:var(--dp-mono)] text-[0.85rem]">
                    <span style={{ color: "var(--dp-faint)" }}>{balance.label}</span>{" "}
                    {balance.value} {balance.unit}
                  </p>
                ))}
              </div>
            </Field>
          </div>

          <div className="relative mt-12 flex flex-wrap items-center justify-between gap-6 border-t pt-7"
            style={{ borderColor: "rgba(20,33,61,0.16)" }}>
            <div>
              <p className="dp-label">Total sealed</p>
              <p className="mt-1 font-[family-name:var(--dp-display)] text-5xl leading-none">
                {amount}<span className="ml-2 text-lg align-super">STRK</span>
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div className="dp-frank">Sealed<br />Sepolia<br />00-1101</div>
              <button className="dp-cta">Seal and send</button>
            </div>
          </div>
        </section>
      </main>

      <div className="dp-wrap dp-foot">
        <span>{FOOT}</span>
        <span>@0xrlawrence · Source</span>
      </div>
      <div className="dp-chev" />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t pt-4" style={{ borderColor: "rgba(20,33,61,0.16)" }}>
      <p className="dp-label">{label}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 max-w-[38ch] text-[0.8rem] leading-relaxed" style={{ color: "var(--dp-faint)" }}>
      {children}
    </p>
  );
}

function Picks({ options, value, onPick }: { options: readonly string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1">
      {options.map((option) => (
        <button key={option} className="dp-pick" data-on={option === value} onClick={() => onPick(option)}>
          {option}
        </button>
      ))}
    </div>
  );
}
