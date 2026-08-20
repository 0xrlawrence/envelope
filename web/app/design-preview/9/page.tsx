"use client";

import { useState } from "react";
import {
  AMOUNTS, AMOUNT_NOTE, BALANCES, EXPIRIES, FOOT, LOCKS, MEMO, NAV, SOURCES,
  SOURCE_NOTE, STANDFIRST,
} from "../content";

/**
 * World 9: Blueprint.
 *
 * The envelope as a drawing rather than a form. A cyanotype ground on a real
 * drafting grid, white hairlines, dimension lines calling out what each choice
 * actually sets, and a title block in the corner the way a sheet is signed.
 */
export default function Blueprint() {
  const [amount, setAmount] = useState("1");
  const [source, setSource] = useState<string>(SOURCES[0]);
  const [expiry, setExpiry] = useState<string>(EXPIRIES[1]);
  const [lock, setLock] = useState<string>(LOCKS[0]);

  return (
    <div className="dp w9" data-preview>
      <div className="dp-chev" />
      <header className="dp-wrap dp-head" style={{ borderBottom: "1px solid rgba(232,244,255,0.35)" }}>
        <span className="dp-mark">Envelope</span>
        <nav className="dp-nav">
          {NAV.map((item) => <span key={item}>{item}</span>)}
          <span className="border px-3 py-1" style={{ color: "var(--dp-accent)", borderColor: "var(--dp-accent)" }}>
            Connect
          </span>
        </nav>
      </header>

      <main className="dp-body dp-wrap">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="dp-label">Sheet 1 of 1 · Rev. A · Scale 1:1</p>
          <p className="dp-label">Drawing EN-0000-1101</p>
        </div>

        <h1 className="dp-h1 mt-4">
          One line,<br /><b>one envelope.</b>
        </h1>
        <p className="mt-4 max-w-[56ch] text-[0.95rem] leading-relaxed" style={{ color: "var(--dp-dim)", fontWeight: 300 }}>
          {STANDFIRST}
        </p>

        {/* The elevation: the envelope drawn, with the amount called out. */}
        <section className="dp-panel relative mt-8 p-5 sm:p-8">
          <div className="dp-tint absolute inset-0 opacity-50" />
          <div className="relative grid gap-8 lg:grid-cols-[22rem_1fr] lg:items-start">
            <figure>
              <div className="relative aspect-[16/10] border" style={{ borderColor: "var(--dp-ink)" }}>
                {/* The flap, drawn as two construction lines. */}
                <div className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "linear-gradient(to bottom right, transparent calc(50% - 0.5px), var(--dp-ink) 50%, transparent calc(50% + 0.5px)), linear-gradient(to bottom left, transparent calc(50% - 0.5px), var(--dp-ink) 50%, transparent calc(50% + 0.5px))",
                    opacity: 0.55,
                  }}
                />
                <span className="absolute inset-x-0 bottom-3 text-center font-[family-name:var(--dp-display)] text-4xl"
                  style={{ color: "var(--dp-accent)" }}>
                  {amount} STRK
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="dim flex-1" />
                <span className="dp-label">Opens for {expiry}</span>
                <div className="dim flex-1" />
              </div>
              <figcaption className="dp-label mt-3">Fig. 1 · Sealed envelope, front elevation</figcaption>
            </figure>

            <dl className="grid gap-0">
              <Note k="A" label="Contents" note={AMOUNT_NOTE}>
                <Picks options={AMOUNTS} value={amount} onPick={setAmount} />
              </Note>
              <Note k="B" label="Drawn from" note={SOURCE_NOTE}>
                <Picks options={SOURCES} value={source} onPick={setSource} />
              </Note>
              <Note k="C" label="Opens for">
                <Picks options={EXPIRIES} value={expiry} onPick={setExpiry} />
              </Note>
              <Note k="D" label="Addressed to">
                <Picks options={LOCKS} value={lock} onPick={setLock} />
              </Note>
              <Note k="E" label="Reference">
                <p className="font-[family-name:var(--dp-mono)] text-[0.82rem]">{MEMO}</p>
              </Note>
            </dl>
          </div>
        </section>

        {/* The title block, bottom right, the way a sheet is signed off. */}
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="dp-panel grid grid-cols-2 sm:grid-cols-4">
            {BALANCES.map((balance) => (
              <div key={balance.label} className="border-r p-3 last:border-0"
                style={{ borderColor: "rgba(232,244,255,0.3)" }}>
                <p className="dp-label">{balance.label}</p>
                <p className="mt-1 font-[family-name:var(--dp-mono)] text-base">{balance.value} {balance.unit}</p>
              </div>
            ))}
            <div className="border-r p-3" style={{ borderColor: "rgba(232,244,255,0.3)" }}>
              <p className="dp-label">Network</p>
              <p className="mt-1 font-[family-name:var(--dp-mono)] text-base">Sepolia</p>
            </div>
            <div className="p-3">
              <p className="dp-label">Total</p>
              <p className="mt-1 font-[family-name:var(--dp-mono)] text-base" style={{ color: "var(--dp-accent)" }}>
                {amount} STRK
              </p>
            </div>
          </div>
          <button className="dp-cta">Seal and send</button>
        </div>
      </main>

      <div className="dp-wrap dp-foot" style={{ borderTop: "1px solid rgba(232,244,255,0.35)" }}>
        <span>{FOOT}</span>
        <span>@0xrlawrence · Source</span>
      </div>
      <div className="dp-chev" />
    </div>
  );
}

function Note({ k, label, note, children }: {
  k: string; label: string; note?: string; children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 border-b py-3.5 sm:grid-cols-[1.6rem_8rem_1fr] sm:items-start sm:gap-3"
      style={{ borderColor: "rgba(232,244,255,0.22)" }}>
      <span className="grid h-6 w-6 place-content-center rounded-full border text-[0.62rem]"
        style={{ borderColor: "var(--dp-accent)", color: "var(--dp-accent)", fontFamily: "var(--dp-mono)" }}>
        {k}
      </span>
      <dt className="dp-label pt-1.5">{label}</dt>
      <dd>
        {children}
        {note ? <p className="mt-2 max-w-[46ch] text-[0.75rem]" style={{ color: "var(--dp-faint)" }}>{note}</p> : null}
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
