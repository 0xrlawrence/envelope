import assert from "node:assert/strict";
import test from "node:test";
import { fromWei, toWei } from "./amount.js";
import { describeDuration, parseDuration } from "./duration.js";

test("amounts are read by string, not through a float", () => {
  assert.equal(toWei("1"), 1_000_000_000_000_000_000n);
  assert.equal(toWei("0.5"), 500_000_000_000_000_000n);
  // 0.1 has no exact binary form; parsing it as a float and multiplying is off
  // by a few wei, which is the sort of error nobody sees until it moves money.
  assert.equal(toWei("0.1"), 100_000_000_000_000_000n);
  assert.equal(toWei("12.345"), 12_345_000_000_000_000_000n);
});

test("an amount survives a round trip", () => {
  for (const value of ["1", "0.5", "0.1", "12.345", "1000"]) {
    assert.equal(fromWei(toWei(value)), value);
  }
});

test("amounts that would move the wrong money are refused", () => {
  for (const bad of ["", "one", "1.2.3", "-1", "0", "1e18", " ", "0.0000000000000000001"]) {
    assert.throws(() => toWei(bad), `accepted ${JSON.stringify(bad)}`);
  }
});

test("claim windows need a unit", () => {
  assert.equal(parseDuration("30m"), 1_800);
  assert.equal(parseDuration("24h"), 86_400);
  assert.equal(parseDuration("7d"), 604_800);
  assert.equal(parseDuration(" 2 h "), 7_200);
});

test("a bare number is refused rather than guessed at", () => {
  // Read as seconds when hours were meant, the window shuts before the
  // recipient has opened their mail and the value is locked until a refund.
  assert.throws(() => parseDuration("24"));
  assert.throws(() => parseDuration("24 weeks"));
  assert.throws(() => parseDuration("0h"));
});

test("windows read back in the unit they were given", () => {
  assert.equal(describeDuration(86_400), "1 day");
  assert.equal(describeDuration(604_800), "7 days");
  assert.equal(describeDuration(3_600), "1 hour");
  assert.equal(describeDuration(1_800), "30 minutes");
});
