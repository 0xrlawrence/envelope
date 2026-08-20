"use client";

import { useState } from "react";
import {
  AMOUNTS, AMOUNT_NOTE, BALANCES, EXPIRIES, FOOT, LOCKS, MEMO, NAV, SOURCES,
  SOURCE_NOTE, STANDFIRST,
} from "../content";

/**
 * World 6: Boarding pass.
 *
 * Transit printing. The page is one ticket: the declaration on the left, a
 * stub torn off down the right that carries the figure and the barcode, and
 * the whole thing set in a signage grotesque with the corners left on.
 */
export default function BoardingPass() {
  const [amount, setAmount] = useState("1");
  const [source, setSource] = useState<string>(SOURCES[0]);
  const [expiry, setExpiry] = useState<string>(EXPIRIES[1]);
  const [lock, setLock] = useState<string>(LOCKS[0]);

  return (
    <div className="dp w6" data-preview>
      <div className="dp-chev" />
      <header className="dp-wrap dp-head" style={{ borderBottom: "2px solid var(--dp-ink)" }}>
        <span className="dp-mark">Envelope</span>
        <nav className="dp-nav">
          {NAV.map((item) => <span key={item}>{item}</span>)}
          <span className="px-3 py-1" style={{ background: "var(--dp-accent)", color: "#fff" }}>Connect</span>
        </nav>
      </header>

      <main className="dp-body dp-wrap">
        <div className="dp-panel grid lg:grid-cols-[1fr_16rem]">
          <div className="relative p-5 sm:p-8">
            <div className="dp-tint absolute inset-0 opacity-50" />
            <div className="relative">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <span className="dp-label">Envelope / boarding</span>
                <span className="dp-label">Gate STRK20</span>
                <span className="dp-label">Seq 0000-1101</span>
              </div>
              <h1 className="dp-h1 mt-4">One line,<br />one envelope</h1>
              <p className="mt-4 max-w-[48ch] text-[0.92rem] leading-relaxed" style={{ color: "var(--dp-dim)" }}>
                {STANDFIRST}
              </p>

              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                <Cell label="Contents">
                  <div className="flex flex-wrap gap-1.5">
                    {AMOUNTS.map((value) => (
                      <button key={value} className="dp-pick" data-on={value === amount} onClick={() => setAmount(value)}>
                        {value}
                      </button>
                    ))}
                  </div>
                  <Note>{AMOUNT_NOTE}</Note>
                </Cell>
                <Cell label="Drawn from">
                  <Picks options={SOURCES} value={source} onPick={setSource} />
                  <Note>{SOURCE_NOTE}</Note>
                </Cell>
                <Cell label="Opens for">
                  <Picks options={EXPIRIES} value={expiry} onPick={setExpiry} />
                </Cell>
                <Cell label="Addressed to">
                  <Picks options={LOCKS} value={lock} onPick={setLock} />
                </Cell>
                <Cell label="Reference">
                  <p className="font-[family-name:var(--dp-mono)] text-[0.82rem]">{MEMO}</p>
                </Cell>
                <Cell label="Held today">
                  {BALANCES.map((balance) => (
                    <p key={balance.label} className="font-[family-name:var(--dp-mono)] text-[0.82rem]">
                      {balance.label}: {balance.value} {balance.unit}
                    </p>
                  ))}
                </Cell>
              </div>

              <button className="dp-cta mt-8 w-full sm:w-auto">Seal and send</button>
            </div>
          </div>

          <aside className="flex flex-col justify-between gap-6 border-t-2 p-5 lg:border-t-0 lg:border-l-2"
            style={{ borderColor: "var(--dp-ink)", borderStyle: "dashed" }}>
            <div>
              <p className="dp-label">Stub / retain</p>
              <p className="mt-3 font-[family-name:var(--dp-display)] text-[4.5rem] leading-[0.85] font-bold"
                style={{ letterSpacing: "-0.05em" }}>
                {amount}
              </p>
              <p className="dp-label mt-1">Strk sealed</p>
              <dl className="mt-5 grid gap-2 text-[0.72rem]">
                <Stub k="From" v={source === SOURCES[0] ? "Shielded" : "Wallet"} />
                <Stub k="Opens" v={expiry} />
                <Stub k="Lock" v={lock} />
                <Stub k="Net" v="Sepolia" />
              </dl>
            </div>
            <div>
              <div className="barcode" />
              <p className="mt-2 text-center font-[family-name:var(--dp-mono)] text-[0.6rem] tracking-[0.24em]">
                EN 0000 1101 {amount}
              </p>
            </div>
          </aside>
        </div>
      </main>

      <div className="dp-wrap dp-foot" style={{ borderTop: "2px solid var(--dp-ink)" }}>
        <span>{FOOT}</span>
        <span>@0xrlawrence · Source</span>
      </div>
      <div className="dp-chev" />
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t-2 pt-3" style={{ borderColor: "var(--dp-ink)" }}>
      <p className="dp-label">{label}</p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function Stub({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b pb-1" style={{ borderColor: "rgba(11,11,12,0.2)" }}>
      <dt className="dp-label">{k}</dt>
      <dd className="font-[family-name:var(--dp-mono)]">{v}</dd>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-2.5 text-[0.72rem] leading-snug" style={{ color: "var(--dp-faint)" }}>{children}</p>;
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
