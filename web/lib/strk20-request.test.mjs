import assert from "node:assert/strict";
import test from "node:test";
import { submitStrk20Once } from "./strk20-request.ts";

test("reuses one wallet request for the same envelope operation", async () => {
  let submissions = 0;
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const submit = () => {
    submissions += 1;
    return pending;
  };
  const operation = `seal:mainnet:0x${Date.now().toString(16)}`;

  const first = submitStrk20Once(operation, submit);
  const duplicate = submitStrk20Once(operation, submit);

  assert.equal(first, duplicate);
  assert.equal(submissions, 0, "wallet submission starts on the guarded microtask");

  await Promise.resolve();
  assert.equal(submissions, 1);

  finish({ transaction_hash: "0x123" });
  assert.deepEqual(await first, { transaction_hash: "0x123" });
  assert.deepEqual(await submitStrk20Once(operation, submit), {
    transaction_hash: "0x123",
  });
  assert.equal(submissions, 1, "a completed operation is not submitted again");
});

test("allows a different envelope operation", async () => {
  let submissions = 0;
  const submit = async () => {
    submissions += 1;
    return { transaction_hash: `0x${submissions}` };
  };
  const prefix = `seal:mainnet:${Date.now().toString(16)}`;

  await Promise.all([
    submitStrk20Once(`${prefix}:claim-a`, submit),
    submitStrk20Once(`${prefix}:claim-b`, submit),
  ]);

  assert.equal(submissions, 2);
});
