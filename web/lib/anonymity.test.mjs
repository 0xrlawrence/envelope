import assert from "node:assert/strict";
import test from "node:test";
import { crowdFor, crowdSizes, ledgerOf } from "./anonymity.ts";

const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const OTHER = "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8";

/** One funding, at `amount` whole units, in the order it is passed. */
function funding(id, amount, token = STRK, blockNumber = 100) {
  return {
    envelopeId: id,
    token,
    amount: BigInt(amount) * 10n ** 18n,
    blockNumber,
    transactionHash: `0xtx${id}`,
  };
}

test("counts only the envelopes of the same size", () => {
  const ledger = ledgerOf([
    funding("0x1", 1),
    funding("0x2", 5),
    funding("0x3", 1),
    funding("0x4", 100),
    funding("0x5", 1),
  ]);

  assert.equal(crowdFor(ledger, "0x3").size, 3);
  assert.equal(crowdFor(ledger, "0x2").size, 1);
});

test("counts only the ones funded after yours", () => {
  const ledger = ledgerOf([
    funding("0x1", 1),
    funding("0x2", 1),
    funding("0x3", 5),
    funding("0x4", 1),
    funding("0x5", 1),
  ]);

  assert.equal(crowdFor(ledger, "0x2").after, 2, "0x4 and 0x5, not the 5 STRK one");
  assert.equal(crowdFor(ledger, "0x1").after, 3);
  assert.equal(crowdFor(ledger, "0x5").after, 0, "nothing follows the newest");
});

test("a size held by one envelope has no cover", () => {
  const crowd = crowdFor(ledgerOf([funding("0x1", 25)]), "0x1");
  assert.equal(crowd.size, 1);
  assert.equal(crowd.after, 0);
  assert.equal(crowd.cover, "none");
});

test("cover bands widen with the crowd", () => {
  const at = (count) => {
    const records = Array.from({ length: count }, (_, index) =>
      funding(`0x${index + 1}`, 1),
    );
    return crowdFor(ledgerOf(records), "0x1").cover;
  };

  assert.equal(at(1), "none");
  assert.equal(at(2), "thin");
  assert.equal(at(9), "thin");
  assert.equal(at(10), "fair");
});

test("matches an envelope key by value, not by spelling", () => {
  const ledger = ledgerOf([funding("0x0000000000abc", 1), funding("0xdef", 1)]);

  // The vault writes the key the wallet gave it; the node returns its own
  // formatting of the same felt. A string compare would find neither.
  assert.equal(crowdFor(ledger, "0xabc").size, 2);
  assert.equal(crowdFor(ledger, "0xABC").after, 1);
});

test("a different token is a different crowd", () => {
  const ledger = ledgerOf([
    funding("0x1", 1, STRK),
    funding("0x2", 1, OTHER),
    funding("0x3", 1, OTHER),
  ]);

  assert.equal(crowdFor(ledger, "0x1").size, 1);
  assert.equal(crowdFor(ledger, "0x2").size, 2);
});

test("an envelope the scan never saw is unknown, not alone", () => {
  assert.equal(crowdFor(ledgerOf([funding("0x1", 1)]), "0x9"), null);
});

test("an incomplete scan reports its counts as floors", () => {
  const partial = ledgerOf([funding("0x1", 1), funding("0x2", 1)], false);
  assert.equal(crowdFor(partial, "0x1").partial, true);
  assert.equal(crowdFor(ledgerOf([funding("0x1", 1)]), "0x1").partial, false);
});

test("groups every denomination on the contract, smallest first", () => {
  const ledger = ledgerOf([
    funding("0x1", 100),
    funding("0x2", 1),
    funding("0x3", 5),
    funding("0x4", 1),
  ]);

  assert.deepEqual(
    crowdSizes(ledger).map((size) => [Number(size.amount / 10n ** 18n), size.count]),
    [
      [1, 2],
      [5, 1],
      [100, 1],
    ],
  );
});

test("the same size in two tokens is not pooled into one figure", () => {
  const ledger = ledgerOf([funding("0x1", 1, STRK), funding("0x2", 1, OTHER)]);
  assert.equal(crowdSizes(ledger).length, 2);
});
