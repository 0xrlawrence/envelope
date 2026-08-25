import assert from "node:assert/strict";
import test from "node:test";
import {
  invalidateStrk20BalanceRead,
  readStrk20BalancesOnce,
  probeStrk20Once,
  releaseStrk20Request,
  submitStrk20Once,
} from "./strk20-request.ts";

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

test("blocks a second envelope request while one account prompt is open", async () => {
  const account = `mainnet:0x${crypto.randomUUID()}`;
  const firstOperation = `seal:${crypto.randomUUID()}`;
  let submissions = 0;
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });

  const first = submitStrk20Once(
    firstOperation,
    () => {
      submissions += 1;
      return pending;
    },
    account,
  );
  await Promise.resolve();

  await assert.rejects(
    submitStrk20Once(
      `seal:${crypto.randomUUID()}`,
      async () => {
        submissions += 1;
        return { transaction_hash: "0xwrong" };
      },
      account,
    ),
    /already open/,
  );
  assert.equal(submissions, 1, "the second request never reaches the wallet");

  finish({ transaction_hash: "0xfirst" });
  await first;
});

test("chain confirmation releases a wallet promise that never answers", async () => {
  const account = `mainnet:0x${crypto.randomUUID()}`;
  const firstOperation = `seal:${crypto.randomUUID()}`;
  const never = new Promise(() => undefined);

  void submitStrk20Once(firstOperation, () => never, account);
  await Promise.resolve();
  releaseStrk20Request(account, firstOperation);

  const result = await submitStrk20Once(
    `seal:${crypto.randomUUID()}`,
    async () => ({ transaction_hash: "0xnext" }),
    account,
  );
  assert.deepEqual(result, { transaction_hash: "0xnext" });
});

test("automatic balance re-renders reuse one wallet request", async () => {
  const key = `balance:${crypto.randomUUID()}`;
  let calls = 0;
  const read = async () => {
    calls += 1;
    return [{ token: "0x1", balance: "0x5" }];
  };

  const first = readStrk20BalancesOnce(key, read);
  const rerender = readStrk20BalancesOnce(key, read);

  assert.equal(first, rerender);
  assert.deepEqual(await first, [{ token: "0x1", balance: "0x5" }]);
  assert.equal(calls, 1);
});

test("a failed automatic balance read is not silently retried", async () => {
  const key = `balance:${crypto.randomUUID()}`;
  let calls = 0;
  const read = async () => {
    calls += 1;
    throw new Error("wallet closed");
  };

  await assert.rejects(readStrk20BalancesOnce(key, read), /wallet closed/);
  await assert.rejects(readStrk20BalancesOnce(key, read), /wallet closed/);
  assert.equal(calls, 1);
});

test("a settled balance change can invalidate the cached read", async () => {
  const key = `balance:${crypto.randomUUID()}`;
  let balance = 1;
  const read = async () => balance;

  assert.equal(await readStrk20BalancesOnce(key, read), 1);
  balance = 3;
  assert.equal(await readStrk20BalancesOnce(key, read), 1);

  invalidateStrk20BalanceRead(key);
  assert.equal(await readStrk20BalancesOnce(key, read), 3);
});

test("one wallet probe for a return, even from two clicks in the same tick", async () => {
  let probes = 0;
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const probe = () => {
    probes += 1;
    return pending;
  };
  const key = `prepare:mainnet:0x${Date.now().toString(16)}`;

  const first = probeStrk20Once(key, probe);
  const duplicate = probeStrk20Once(key, probe);

  assert.equal(first, duplicate, "the second click observes the first probe");
  assert.equal(probes, 0, "the wallet is called on the guarded microtask");

  await Promise.resolve();
  assert.equal(probes, 1, "the wallet is asked exactly once");

  finish("0x1");
  assert.equal(await first, "0x1");
});

test("a declined probe can be retried on the same envelope", async () => {
  let probes = 0;
  const key = `prepare:mainnet:retry-${Date.now().toString(16)}`;
  const failing = () => {
    probes += 1;
    return Promise.reject(new Error("declined"));
  };

  await assert.rejects(probeStrk20Once(key, failing));
  // A probe moves nothing, so refusing it must not lock the envelope out.
  await assert.rejects(probeStrk20Once(key, failing));
  assert.equal(probes, 2, "the second attempt reaches the wallet again");
});
