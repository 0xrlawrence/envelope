# Envelope

**Private money you can send as a link — to someone who has never heard of Starknet.**

Envelope is a [STRK20](https://strk20.starknet.io) anonymizer contract and app.
You shield tokens, seal an amount into an envelope, and hand over a URL. Whoever
opens the link takes the money — into their own shielded balance if they have
one, or straight to any Starknet address if they do not.

The pool hides who paid. The link means the recipient needs no viewing key, no
registration, and no privacy-capable wallet to get paid.

```
shield  →  seal an envelope  →  send a link  →  claimed
          (pool hides you)     (never hits      (into a private note,
                                a server)        or any address)
```

## Why this doesn't already exist

A STRK20 private transfer needs a registered recipient: someone who has set a
viewing key on-chain and can be sent an encrypted note. That is fine between two
people already inside the pool, and useless for the case that actually matters —
paying a contributor, a bounty winner, or a friend who has never used Starknet.

The documented way around it is an escrow keyed by a hash commitment: park value
against `poseidon(secret)`, release it to whoever presents the preimage. That
construction is front-runnable. The preimage travels in public calldata, so
anyone watching the mempool can lift it, resubmit first, and take the money. The
[reference escrow helper in the STRK20 docs](https://strk20-by-example.org/helpers/escrow)
has exactly this shape.

Envelopes commit to a **stark-curve public key** instead. Releasing requires a
signature over `(anonymizer, mode, envelope, destination)`, so the authorisation
is welded to one destination. A front-runner sees the signature, and it is
useless to them: re-targeting it invalidates it, and forging a new one needs the
private key, which never leaves the claimant's browser.

```cairo
// cairo/src/types.cairo
pub fn release_message_hash(
    contract: ContractAddress, mode: felt252, claim_pubkey: felt252, target: felt252,
) -> felt252
```

The property is a test, not a claim:
[`a_claim_signature_cannot_be_retargeted_by_a_front_runner`](cairo/src/tests/envelope_test.cairo).

## What is private, and what is not

Overclaiming is the fastest way to build something that quietly hurts people, so
here is the whole truth.

| | Hidden | Visible |
|---|---|---|
| **Funding an envelope** | Who funded it. The pool spends a shielded note; the funder's address appears nowhere. | That the pool paid the anonymizer, the token, and the amount. |
| **Claiming to a private note** | Who claimed it, and where the value went next. | That the anonymizer released an envelope, and for how much. |
| **Claiming to a public address** | Who funded it. | The recipient's address and the amount. |
| **Refunding** | That the refund went back to the original funder. | That an expired envelope was reclaimed. |

**Amounts are public throughout.** An envelope's funding leg and its claim leg
carry the same figure, so the two are trivially linkable to each other. What the
pool hides is the *funder*, which is the property the product is built on:
"pay someone without revealing who you are or what else you hold". It is not
"pay someone without anyone knowing how much".

A distinctive amount is therefore its own de-anonymiser. The app nudges toward
round denominations for this reason — a 10 STRK envelope hides in the crowd of
other 10 STRK envelopes; a 13.7204 STRK envelope does not.

**The link is a bearer instrument.** Whoever holds it can claim. It is carried
in the URL fragment, so it never reaches this app's server, its logs, or its
analytics — but a link pasted into a group chat is money pasted into a group
chat.

## Repository

| Path | |
|---|---|
| [`cairo/`](cairo/) | The `EnvelopeAnonymizer` contract and its test suite |
| [`packages/envelope-sdk/`](packages/envelope-sdk/) | `strk20-envelope` — keys, links, signing, STRK20 action builders |
| [`web/`](web/) | The app |
| [`docs/`](docs/) | Protocol notes, mainnet addresses, open questions |

### The contract

One `privacy_invoke` entry point, dispatching on an operation, plus one public
entry point for recipients who are not in the pool:

| Operation | Driven by | Effect |
|---|---|---|
| `Fund` | the pool | Parks the value the pool just withdrew. Returns an **empty** span — nothing is credited, which is what leaves it for the recipient. |
| `Claim` | the pool | Releases into an open note. Returns one `OpenNoteDeposit`. |
| `Refund` | the pool | After expiry only, returns the value to the funder as an open note. |
| `claim_to_address` | anyone | Releases as a plain ERC-20 transfer. No pool involvement. |

Envelopes carry a time lock, an expiry, a refund key, and a memo, so the same
primitive covers a payment link, a vesting cliff, a bounty with a deadline, and
a payout run.

### The SDK

```ts
import {
  generateEnvelopeKey, encodeClaimLink, buildFundActions,
} from "strk20-envelope";

const claim = generateEnvelopeKey();
const refund = generateEnvelopeKey();

await account.strk20InvokeTransaction(
  buildFundActions({
    anonymizer: ENVELOPE_ANONYMIZER,
    token: STRK_ADDRESS,
    amount: 10_000000000000000000n,
    claimPublicKey: claim.publicKey,
    refundPublicKey: refund.publicKey,
    expiry: Math.floor(Date.now() / 1000) + 7 * 86_400,
    memo: "bounty-142",
  }),
);

const link = encodeClaimLink("https://envelope.example", claim.privateKey);
```

The SDK is deliberately usable without the app: it builds action lists and
returns them, so any STRK20 dapp can add claim links without adopting our UI.
Its message construction is pinned to the Cairo contract by a
[shared test vector](packages/envelope-sdk/src/message.test.ts) generated from
the Cairo suite — if the two ever drift, that test fails rather than every
signature silently being rejected on-chain.

## Build and test

```bash
cd cairo && scarb build && snforge test
```

```bash
cd packages/envelope-sdk && npm install && npm test
```

## Status

Built for the [STRK20 Private Sprint](https://strk20.starknet.io/hackathon),
14–31 August 2026. Mainnet addresses and transaction hashes are in
[`strk20.json`](strk20.json); what is deployed and what is not is tracked in
[`docs/STATUS.md`](docs/STATUS.md).

This code has not been audited. It moves real money on mainnet. Read it before
you trust it, and do not park more in it than you would hand to a stranger.

## Licence

[Apache 2.0](LICENSE), matching the STRK20 protocol repositories so the contract
can be lifted into them without a licence change.
