import assert from "node:assert/strict";
import test from "node:test";
import { looksRejected, walletErrorCodes, walletErrorText } from "./wallet-errors.js";

/**
 * Shapes a refusal arrives in, flattest first.
 *
 * The wrapped ones are the point. Reading only a top-level `code` and an
 * `Error.message` catches the first two and misses the rest, and every one it
 * misses is someone watching an envelope fly for a transaction they cancelled.
 */
const REFUSALS: ReadonlyArray<readonly [string, unknown]> = [
  ["a bare code", { code: 113, message: "USER_REFUSED_OP" }],
  ["a code with no wording at all", { code: 113 }],
  ["a code sent as a string", { code: "113", message: "failed" }],
  [
    "an Error carrying the code as a property",
    Object.assign(new Error("Request failed"), { code: 113 }),
  ],
  [
    "an RPC envelope with the code nested in data",
    Object.assign(new Error("Request failed"), {
      code: -32603,
      data: { code: 113, message: "USER_REFUSED_OP" },
    }),
  ],
  [
    "an error wrapped twice, the code reachable only through cause",
    Object.assign(new Error("wallet call failed"), {
      cause: Object.assign(new Error("inner"), { code: 113 }),
    }),
  ],
  ["wording with no code", new Error("User rejected the request")],
  ["wording nested in a plain object", { error: { message: "cancelled by the user" } }],
  ["the spec name on its own", new Error("USER_REFUSED_OP")],
];

for (const [name, error] of REFUSALS) {
  test(`a refusal is recognised: ${name}`, () => {
    assert.equal(looksRejected(error), true);
  });
}

/**
 * Failures that are emphatically not the user saying no.
 *
 * Reading any of these as a refusal is the more dangerous direction: it tells
 * someone nothing moved and stops the app looking for a transaction that may
 * be in flight.
 */
const FAULTS: ReadonlyArray<readonly [string, unknown]> = [
  ["a malformed payload", { code: 114, message: "INVALID_REQUEST_PAYLOAD" }],
  [
    "the payload wording, which says rejected but blames the app",
    new Error("The wallet rejected the request payload"),
  ],
  ["an empty shielded balance", { code: 119, message: "INSUFFICIENT_PRIVATE_BALANCE" }],
  ["an unregistered account", { code: 118, message: "NOT_REGISTERED" }],
  ["a proving timeout", new Error("Proving service timed out")],
  ["the privacy backend", new Error("Failed to authenticate with the privacy backend")],
  ["an unexplained failure", { code: 163, message: "UNKNOWN_ERROR" }],
  ["a 113 that is not a code", { blockNumber: 113, message: "reverted" }],
  ["a 113 sitting in calldata", { code: 500, data: { calldata: ["0x113", 113] } }],
  ["nothing at all", undefined],
  ["an empty object", {}],
];

for (const [name, error] of FAULTS) {
  test(`a fault is not read as a refusal: ${name}`, () => {
    assert.equal(looksRejected(error), false);
  });
}

test("a code is found however deeply it is nested", () => {
  const buried = { a: { b: { c: { code: 119 } } } };
  assert.deepEqual(walletErrorCodes(buried), [119]);
});

test("an error that references itself does not hang or throw", () => {
  const loop: Record<string, unknown> = { code: 500 };
  loop.self = loop;
  // JSON.stringify throws on this, which is a crash inside the handler that
  // was supposed to be reporting the problem.
  assert.equal(looksRejected(loop), false);
  assert.deepEqual(walletErrorCodes(loop), [500]);
});

test("name and cause are read, which JSON.stringify cannot see", () => {
  const wrapped = new Error("outer", { cause: new Error("NOT_REGISTERED") });
  assert.match(walletErrorText(wrapped), /NOT_REGISTERED/);
  assert.equal(JSON.stringify(wrapped), "{}");
});
