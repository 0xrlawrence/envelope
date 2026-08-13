import assert from "node:assert/strict";
import { test } from "node:test";
import { generateEnvelopeKey, toPublicKey } from "./keys.js";
import { decodeLinkFragment, encodeClaimLink, encodeLinkFragment } from "./link.js";

test("a key survives a round trip through a link", () => {
  const key = generateEnvelopeKey();
  const decoded = decodeLinkFragment(encodeLinkFragment(key.privateKey, "claim"));

  assert.ok(decoded);
  assert.equal(decoded.kind, "claim");
  assert.equal(
    toPublicKey(decoded.privateKey),
    key.publicKey,
    "the recovered key must identify the same envelope",
  );
});

test("claim and refund links are told apart", () => {
  const key = generateEnvelopeKey();

  assert.equal(decodeLinkFragment(encodeLinkFragment(key.privateKey, "claim"))?.kind, "claim");
  assert.equal(decodeLinkFragment(encodeLinkFragment(key.privateKey, "refund"))?.kind, "refund");
});

test("window.location.hash can be passed in unmodified", () => {
  const key = generateEnvelopeKey();
  const fragment = encodeLinkFragment(key.privateKey, "claim");

  assert.deepEqual(decodeLinkFragment(`#${fragment}`), decodeLinkFragment(fragment));
});

test("the key lands in the fragment, never the path or query", () => {
  const key = generateEnvelopeKey();
  const url = new URL(encodeClaimLink("https://envelope.example", key.privateKey));

  assert.ok(url.hash.length > 1, "the key belongs in the fragment");
  assert.equal(url.search, "", "a query string would be sent to the server");
  assert.ok(
    !url.pathname.includes(encodeLinkFragment(key.privateKey, "claim")),
    "a path segment would be sent to the server, and logged by it",
  );
});

test("malformed fragments are rejected rather than half-decoded", () => {
  for (const bad of ["", "nonsense", "e1.", "e1.####", "zz.AAAA", "e1.QUJD"]) {
    assert.equal(decodeLinkFragment(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});
