import assert from "node:assert/strict";
import { test } from "node:test";
import { buildClaimToAddressCall, buildFundActions } from "./actions.js";
import { generateEnvelopeKey } from "./keys.js";
import { STRK_ADDRESS } from "./constants.js";

/**
 * The Wallet API's FELT pattern. A leading zero after `0x` is invalid, which is
 * exactly the form `validateAndParseAddress` produces, so this is the mistake
 * most likely to reappear.
 */
const FELT = /^0x(0|[a-fA-F1-9]{1}[a-fA-F0-9]{0,62})$/;
const PLACEHOLDER = /^\$\{(?:openNoteIds\[\d+\]|poolAddress)\}$/;

/** Padded to 64 digits, the way every Starknet tool prints an address. */
const PADDED_ANONYMIZER =
  "0x05c5cdd9a2983bb4842d1a2c0b7ccdfa29d704e7217623349eb76cb237805604";

function assertFelt(value: string, where: string) {
  assert.ok(
    FELT.test(value) || PLACEHOLDER.test(value) || value === "OPEN",
    `${where} is not a valid FELT or placeholder: ${value}`,
  );
}

test("fund actions emit only valid felts, even from padded addresses", () => {
  const claim = generateEnvelopeKey();
  const refund = generateEnvelopeKey();

  const actions = buildFundActions({
    anonymizer: PADDED_ANONYMIZER,
    token: STRK_ADDRESS,
    amount: 10_000000000000000000n,
    claimPublicKey: claim.publicKey,
    refundPublicKey: refund.publicKey,
    expiry: 2_000_000_000,
    memo: "bounty-142",
  });

  for (const action of actions) {
    for (const [key, value] of Object.entries(action)) {
      if (key === "type" || key === "calldata") continue;
      assertFelt(value as string, `${action.type}.${key}`);
    }
    if ("calldata" in action) {
      action.calldata.forEach((item, index) =>
        assertFelt(item, `${action.type}.calldata[${index}]`),
      );
    }
  }
});

test("the public claim call emits only valid felts", () => {
  const claim = generateEnvelopeKey();
  const call = buildClaimToAddressCall({
    anonymizer: PADDED_ANONYMIZER,
    claimPrivateKey: claim.privateKey,
    claimPublicKey: claim.publicKey,
    // Padded, as a wallet reports it.
    recipient: "0x04171d09b675167f4be7634912e029b06cf2347ae0ba54397969b0bd214b6fee",
  });

  assertFelt(call.contractAddress, "contractAddress");
  call.calldata.forEach((item, index) => assertFelt(item, `calldata[${index}]`));
});
