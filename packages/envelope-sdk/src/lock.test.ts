import assert from "node:assert/strict";
import test from "node:test";
import { deriveLockedKey, generateLockSalt } from "./lock.js";
import { toPublicKey } from "./keys.js";

test("the same salt and password always give the same key", async () => {
  const salt = generateLockSalt();
  const first = await deriveLockedKey(salt, "correct horse battery staple");
  const second = await deriveLockedKey(salt, "correct horse battery staple");
  assert.equal(first, second);
});

test("a different password gives a different envelope entirely", async () => {
  const salt = generateLockSalt();
  const right = await deriveLockedKey(salt, "correct horse battery staple");
  const wrong = await deriveLockedKey(salt, "correct horse battery stapl");
  assert.notEqual(right, wrong);
  // The envelope is keyed by the public half, so a wrong password does not
  // fail a check: it looks for an envelope that was never funded.
  assert.notEqual(toPublicKey(right), toPublicKey(wrong));
});

test("the salt alone decides nothing without the password", async () => {
  const salt = generateLockSalt();
  const a = await deriveLockedKey(salt, "one");
  const other = generateLockSalt();
  const b = await deriveLockedKey(other, "one");
  assert.notEqual(a, b);
});

test("the derived key is a usable stark scalar", async () => {
  const order =
    3618502788666131213697322783095070105526743751716087489154079457884512865583n;
  for (const password of ["a", "£€ünïcodé", "x".repeat(200)]) {
    const key = await deriveLockedKey(generateLockSalt(), password);
    const scalar = BigInt(key);
    assert.ok(scalar > 0n, "must not be zero");
    assert.ok(scalar < order, "must be inside the curve order");
    assert.doesNotThrow(() => toPublicKey(key));
  }
});

test("passwords are compared after unicode normalisation", async () => {
  const salt = generateLockSalt();
  // The same text typed on two keyboards: precomposed vs combining accent.
  const precomposed = await deriveLockedKey(salt, "café");
  const combining = await deriveLockedKey(salt, "café");
  assert.equal(precomposed, combining);
});

test("an empty password is refused rather than silently derived", async () => {
  await assert.rejects(() => deriveLockedKey(generateLockSalt(), ""));
});
