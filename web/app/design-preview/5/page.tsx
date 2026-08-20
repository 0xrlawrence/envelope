"use client";

import { useState } from "react";
import {
  AMOUNTS, AMOUNT_NOTE, BALANCES, EXPIRIES, FOOT, LOCKS, MEMO, NAV, SOURCES,
  SOURCE_NOTE, STANDFIRST,
} from "../content";

/**
 * World 5: Stamp sheet.
 *
 * A saturated airmail blue ground with a sheet of stamps laid on it. Every
 * block on the page is a perforated tile, so choosing an amount and sending
 * the envelope are the same gesture: tear one off and frank it.
 */
export default function StampSheet() {
  const [amount, setAmount] = useState("1");
  const [source, setSource] = useState<string>(SOURCES[0]);
  const [expiry, setExpiry] = useState<string>(EXPIRIES[1]);
  const [lock, setLock] = useState<string>(LOCKS[0]);

  return (
    <div className="dp w5" data-preview>
      <div className="dp-chev" />
      <header className="dp-wrap dp-head">
        <span className="dp-mark">Envelope</span>
        <nav className="dp-nav">
          {NAV.map((item) => <span key={item}>{item}</span>)}
          <span className="px-3 py-1" style={{ background: "var(--dp-accent2)", color: "#101318" }}>
            Connect
          </span>
        </nav>
      </header>

      <main className="dp-body dp-wrap">
        <div className="grid gap-4 md:grid-cols-3">
          <Tile className="md:col-span-2">
            <div className="relative">
              <div className="dp-tint absolute inset-0 opacity-80" />
              <div className="relative p-6 sm:p-8">
                <p className="dp-label">Postage paid · STRK20 · Sepolia</p>
                <h1 className="dp-h1 mt-3">One line,<br />one envelope.</h1>
                <p className="mt-4 max-w-[44ch] text-[0.95rem] leading-relaxed" style={{ color: "#3d4552" }}>
                  {STANDFIRST}
                </p>
              </div>
            </div>
          </Tile>

          <Tile solid="var(--dp-accent)">
            <div className="grid h-full place-content-center px-4 py-8 text-center" style={{ color: "#fff6ee" }}>
              <span className="font-[family-name:var(--dp-display)] text-[6rem] leading-[0.8]">{amount}</span>
              <span className="mt-2 font-[family-name:var(--dp-mono)] text-[0.7rem] tracking-[0.3em]">STRK</span>
              <span className="mt-4 font-[family-name:var(--dp-mono)] text-[0.6rem] tracking-[0.18em] opacity-85">
                Envelope · sealed
              </span>
            </div>
          </Tile>

          <Tile className="md:col-span-3">
            <div className="p-5 sm:p-6">
              <p className="dp-label">Contents</p>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {AMOUNTS.map((value) => (
                  <button key={value} className="dp-pick" data-on={value === amount} onClick={() => setAmount(value)}
                    style={{ fontSize: "1.4rem", padding: "1rem 0" }}>
                    {value}
                  </button>
                ))}
              </div>
              <p className="mt-3 max-w-[62ch] text-[0.78rem] leading-snug" style={{ color: "#5a6270" }}>
                {AMOUNT_NOTE}
              </p>
            </div>
          </Tile>

          <Tile>
            <Block label="Drawn from" note={SOURCE_NOTE}>
              <Picks options={SOURCES} value={source} onPick={setSource} stack />
            </Block>
          </Tile>

          <Tile>
            <Block label="Opens for">
              <Picks options={EXPIRIES} value={expiry} onPick={setExpiry} stack />
            </Block>
          </Tile>

          <Tile>
            <Block label="Addressed to">
              <Picks options={LOCKS} value={lock} onPick={setLock} stack />
            </Block>
            <div className="px-5 pb-5">
              <p className="dp-label">Reference</p>
              <p className="mt-2 font-[family-name:var(--dp-mono)] text-[0.8rem]">{MEMO}</p>
            </div>
          </Tile>

          <Tile className="md:col-span-2">
            <div className="grid grid-cols-2 gap-px p-5" >
              {BALANCES.map((balance) => (
                <div key={balance.label}>
                  <p className="dp-label">{balance.label}</p>
                  <p className="mt-1 font-[family-name:var(--dp-display)] text-2xl">
                    {balance.value}<span className="ml-1 text-[0.7rem]">{balance.unit}</span>
                  </p>
                </div>
              ))}
            </div>
          </Tile>

          <Tile solid="var(--dp-accent2)">
            <div className="grid h-full place-content-center p-5 text-center">
              <p className="font-[family-name:var(--dp-mono)] text-[0.6rem] tracking-[0.24em] uppercase"
                style={{ color: "#3a2f00" }}>
                Total sealed
              </p>
              <p className="mt-1 font-[family-name:var(--dp-display)] text-4xl" style={{ color: "#101318" }}>
                {amount} STRK
              </p>
              <button className="dp-cta mt-4">Frank it</button>
            </div>
          </Tile>
        </div>
      </main>

      <div className="dp-wrap dp-foot">
        <span>{FOOT}</span>
        <span>@0xrlawrence · Source</span>
      </div>
      <div className="dp-chev" />
    </div>
  );
}

function Tile({ children, className = "", solid }: { children: React.ReactNode; className?: string; solid?: string }) {
  return (
    <div className={`dp-perf ${className}`} style={{ background: solid ?? "var(--dp-panel)" }}>
      <div className="dp-tile h-full" style={solid ? { background: solid, color: "#fff6ee" } : undefined}>
        {children}
      </div>
    </div>
  );
}

function Block({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="p-5">
      <p className="dp-label">{label}</p>
      <div className="mt-3">{children}</div>
      {note ? <p className="mt-3 text-[0.75rem] leading-snug" style={{ color: "#5a6270" }}>{note}</p> : null}
    </div>
  );
}

function Picks({ options, value, onPick, stack }: {
  options: readonly string[]; value: string; onPick: (v: string) => void; stack?: boolean;
}) {
  return (
    <div className={stack ? "grid gap-1.5" : "flex flex-wrap gap-1.5"}>
      {options.map((option) => (
        <button key={option} className="dp-pick" data-on={option === value} onClick={() => onPick(option)}
          style={{ fontSize: "0.85rem", textAlign: "left", paddingLeft: "0.7rem" }}>
          {option}
        </button>
      ))}
    </div>
  );
}
