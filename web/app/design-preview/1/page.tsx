"use client";

import { useState } from "react";
import {
  AMOUNTS, AMOUNT_NOTE, BALANCES, EXPIRIES, FOOT, HEADLINE, LOCKS, MEMO, NAV,
  SOURCES, SOURCE_NOTE, STANDFIRST,
} from "../content";

/**
 * World 1: Kraft docket.
 *
 * Manila stock, brown ink, one struck red. The page is the customs
 * declaration tied to a parcel: every field is a ruled line with a printed
 * caption on the left and a machine value on the right, and the whole thing is
 * franked before it goes.
 */
export default function Kraft() {
  const [amount, setAmount] = useState("1");
  const [source, setSource] = useState<string>(SOURCES[0]);
  const [expiry, setExpiry] = useState<string>(EXPIRIES[1]);
  const [lock, setLock] = useState<string>(LOCKS[0]);

  return (
    <div className="dp w1" data-preview>
      <div className="dp-chev" />
      <header className="dp-wrap dp-head" style={{ borderBottom: "1px solid rgba(36,26,16,0.25)" }}>
        <span className="dp-mark">Envelope</span>
        <nav className="dp-nav">
          {NAV.map((item) => <span key={item}>{item}</span>)}
          <span className="border border-current px-3 py-1" style={{ color: "var(--dp-accent)" }}>
            Connect
          </span>
        </nav>
      </header>

      <main className="dp-body dp-wrap">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-start">
          <div>
            <p className="dp-label">Declaration for customs</p>
            <h1 className="dp-h1 mt-3">{HEADLINE}</h1>
            <p className="mt-4 max-w-[46ch] text-[0.95rem] leading-relaxed" style={{ color: "var(--dp-dim)" }}>
              {STANDFIRST}
            </p>
            <dl className="mt-7 grid max-w-md grid-cols-2 gap-px" style={{ background: "rgba(36,26,16,0.3)" }}>
              {BALANCES.map((balance) => (
                <div key={balance.label} className="p-3" style={{ background: "var(--dp-panel)" }}>
                  <dt className="dp-label" style={{ fontSize: "0.62rem" }}>{balance.label}</dt>
                  <dd className="mt-1 font-[family-name:var(--dp-mono)] text-lg">
                    {balance.value} <span style={{ fontSize: "0.7rem" }}>{balance.unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <section className="dp-panel relative p-5 sm:p-7">
            <div className="dp-tint absolute inset-0 opacity-70" />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="dp-label" style={{ color: "var(--dp-accent)" }}>Form E-1 · Sepolia</p>
                  <p className="mt-1 font-[family-name:var(--dp-mono)] text-xs" style={{ color: "var(--dp-faint)" }}>
                    No. 0000-1101
                  </p>
                </div>
                <div className="dp-frank">Envelope<br />Sealed<br />STRK20</div>
              </div>

              <Row n="01" label="Contents">
                <div className="flex flex-wrap gap-2">
                  {AMOUNTS.map((value) => (
                    <button key={value} className="dp-perf" onClick={() => setAmount(value)}
                      style={{ background: value === amount ? "var(--dp-accent)" : "rgba(36,26,16,0.14)" }}>
                      <span className="block px-3 py-1.5 font-[family-name:var(--dp-display)] text-xl leading-none"
                        style={{ color: value === amount ? "#f6e9d2" : "var(--dp-dim)" }}>
                        {value}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 max-w-[44ch] text-[0.72rem] leading-snug" style={{ color: "var(--dp-faint)" }}>
                  {AMOUNT_NOTE}
                </p>
              </Row>

              <Row n="02" label="Drawn from">
                <Picks options={SOURCES} value={source} onPick={setSource} />
                <p className="mt-2 text-[0.72rem]" style={{ color: "var(--dp-faint)" }}>{SOURCE_NOTE}</p>
              </Row>

              <Row n="03" label="Opens for">
                <Picks options={EXPIRIES} value={expiry} onPick={setExpiry} />
              </Row>

              <Row n="04" label="Addressed to">
                <Picks options={LOCKS} value={lock} onPick={setLock} />
              </Row>

              <Row n="05" label="Reference">
                <p className="font-[family-name:var(--dp-mono)] text-sm">{MEMO}</p>
              </Row>

              <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t-2 pt-4"
                style={{ borderColor: "rgba(36,26,16,0.5)" }}>
                <div>
                  <p className="dp-label">Total sealed</p>
                  <p className="font-[family-name:var(--dp-display)] text-4xl leading-none">
                    {amount} <span className="text-base">STRK</span>
                  </p>
                </div>
                <button className="dp-cta">Seal and send</button>
              </div>
            </div>
          </section>
        </div>
      </main>

      <div className="dp-wrap dp-foot" style={{ borderTop: "1px solid rgba(36,26,16,0.25)" }}>
        <span>{FOOT}</span>
        <span>@0xrlawrence · Source</span>
      </div>
      <div className="dp-chev" />
    </div>
  );
}

function Row({ n, label, children }: { n: string; label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 grid gap-2 border-t pt-3 sm:grid-cols-[2.4rem_7rem_1fr]"
      style={{ borderColor: "rgba(36,26,16,0.22)" }}>
      <span className="font-[family-name:var(--dp-mono)] text-xs" style={{ color: "var(--dp-accent)" }}>{n}</span>
      <span className="dp-label pt-0.5">{label}</span>
      <div>{children}</div>
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
