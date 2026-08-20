/**
 * The product's own truth, so all five worlds show the same page.
 *
 * Nothing here is invented: these are the fields, the choices and the words
 * the seal page ships with today. A redesign that changed them would be
 * answering a different question.
 */
export const AMOUNTS = ["1", "5", "10", "25", "100"] as const;
export const SOURCES = ["Shielded balance", "Wallet, in the open"] as const;
export const EXPIRIES = ["5 minutes", "1 hour", "24 hours", "7 days", "30 days"] as const;
export const LOCKS = ["Bearer", "Password"] as const;

export const MEMO = "Payment for your bounty Ref# 1101";

export const BALANCES = [
  { label: "In your wallet", value: "79.028", unit: "STRK" },
  { label: "Shielded in the pool", value: "25", unit: "STRK" },
] as const;

export const HEADLINE = "One line, one envelope.";
export const STANDFIRST =
  "Declare what is inside, who may open it and for how long. The link that comes out is the instrument: whoever holds it takes the contents.";
export const SOURCE_NOTE = "A recipient submits it, so nothing on-chain ties this to you.";
export const AMOUNT_NOTE =
  "Amounts are public on both legs, so a distinctive figure links them. Round sizes share a crowd.";
export const FOOT = "Unaudited. It moves real money on mainnet. Read it before you trust it.";
export const NAV = ["STRK20", "Sealed", "Agent"] as const;
