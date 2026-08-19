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

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findEnvFiles } from "./envfile.js";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "envelope-env-"));
}

test("the directory you are standing in wins", () => {
  const root = scratch();
  writeFileSync(join(root, ".env.local"), "A=1");
  mkdirSync(join(root, "web"));
  writeFileSync(join(root, "web", ".env.local"), "A=2");
  assert.deepEqual(findEnvFiles(root), [join(root, ".env.local")]);
});

test("finds the one a framework left in a subdirectory", () => {
  // The case this exists for: the file is in web/ because Next put it there,
  // and the command is run from the repository root above it.
  const root = scratch();
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, "web"));
  writeFileSync(join(root, "web", ".env.local"), "A=1");
  assert.deepEqual(findEnvFiles(root), [join(root, "web", ".env.local")]);
});

test("refuses to choose between two files that each hold a key", () => {
  const root = scratch();
  mkdirSync(join(root, ".git"));
  for (const app of ["web", "api"]) {
    mkdirSync(join(root, app));
    writeFileSync(join(root, app, ".env.local"), "A=1");
  }
  assert.throws(() => findEnvFiles(root), /more than one/i);
});

test("never walks into dependencies or build output", () => {
  const root = scratch();
  mkdirSync(join(root, ".git"));
  for (const skipped of ["node_modules", "dist", ".next"]) {
    mkdirSync(join(root, skipped));
    writeFileSync(join(root, skipped, ".env"), "A=1");
  }
  assert.deepEqual(findEnvFiles(root), []);
});

test("walks up to the repository root and stops there", () => {
  const root = scratch();
  mkdirSync(join(root, ".git"));
  writeFileSync(join(root, ".env"), "A=1");
  const deep = join(root, "packages", "cli");
  mkdirSync(deep, { recursive: true });
  assert.deepEqual(findEnvFiles(deep), [join(root, ".env")]);
});
