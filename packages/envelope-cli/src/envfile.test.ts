import assert from "node:assert/strict";
import test from "node:test";
import { parseEnvFile } from "./envfile.js";

test("reads the plain form", () => {
  assert.deepEqual(parseEnvFile("STARKNET_ACCOUNT=0xabc\nENVELOPE_NETWORK=sepolia"), {
    STARKNET_ACCOUNT: "0xabc",
    ENVELOPE_NETWORK: "sepolia",
  });
});

test("tolerates the export prefix people actually paste", () => {
  // What a shell wants, and what every guide shows. Refusing it would be
  // technically correct and useless.
  assert.deepEqual(parseEnvFile("export STARKNET_ACCOUNT=0xabc"), {
    STARKNET_ACCOUNT: "0xabc",
  });
});

test("strips matching quotes and keeps what is inside", () => {
  assert.deepEqual(parseEnvFile(`A="one two"\nB='three'\nC="has # inside"`), {
    A: "one two",
    B: "three",
    C: "has # inside",
  });
});

test("an unquoted value ends at a comment", () => {
  assert.deepEqual(parseEnvFile("A=0xabc # the account that signs"), { A: "0xabc" });
});

test("blank lines, comments and junk are skipped, not guessed at", () => {
  assert.deepEqual(
    parseEnvFile("\n# a comment\n\nnot a pair\n=novalue\n1BAD=x\nGOOD=y\n"),
    { GOOD: "y" },
  );
});

test("a value containing = survives", () => {
  assert.deepEqual(parseEnvFile("URL=https://x.dev/?a=b&c=d"), {
    URL: "https://x.dev/?a=b&c=d",
  });
});
