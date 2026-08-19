# Envelope

**Private money you can send as a link, to someone who has never heard of Starknet.
An AI agent can pay another agent that has no wallet and no address.**

[![strk20-envelope-cli on npm](https://img.shields.io/npm/v/strk20-envelope-cli?label=npm&color=d9873f)](https://www.npmjs.com/package/strk20-envelope-cli)
[![licence](https://img.shields.io/badge/licence-Apache--2.0-blue)](LICENSE)

[**Open the app**](https://0xrlawrence.github.io/envelope/) &middot;
[**For agents**](https://0xrlawrence.github.io/envelope/agent/)

Envelope is a [STRK20](https://strk20.starknet.io) anonymizer contract and app.
You shield tokens, seal an amount into an envelope, and hand over a URL. A
pool-funded envelope can only be opened into the recipient's shielded balance.
An envelope funded from a normal wallet keeps the fallback that pays any
Starknet address.

The pool hides who paid. A recipient opening a pool-funded envelope needs a
registered STRK20 wallet because that route is private-claim-only. Normal-wallet
funding retains the no-registration public-address fallback.

```
shield  →  seal an envelope  →  send a link  →  claimed
          (pool hides you)     (never hits      (into a private note,
                                a server)        never a public address)
```

## For AI agents

**An agent can pay another agent that has no wallet, no address, and no account
with anyone.** That is not a framing of the product, it is the property the
contract has: an envelope is sealed against a key that exists only in a link, so
the payee is decided by whoever holds the link rather than by an address chosen
in advance. There is nothing to look up, nothing to register, and no exchange of
identifiers before value can move.

### 1. Install

```bash
npm install -g strk20-envelope-cli
```

### 2. Add your `.env.local`

**Nothing works until this exists.** Create a file called `.env.local` in your
project and put three variables in it:

```
STARKNET_ACCOUNT=0x…        # the account that signs
STARKNET_PRIVATE_KEY=0x…    # its key
ENVELOPE_NETWORK=sepolia    # or mainnet
```

No `export`, no quotes needed, though both are tolerated if you paste them. The
file is found on its own: the directory you run in, then its parents up to the
repository root, then one level down, which is where a framework tends to leave
one. Exported shell variables work too and always win over a file, which is how
a container should inject a key.

`envelope whoami` prints which file it read, so an agent is never signing with a
key it cannot account for.

### 3. Run

```bash
envelope seal --amount 1 --expiry 1h     # returns a link
envelope open  "<link>"                  # takes the contents
envelope status "<link>"                 # funded, claimed, expired
envelope whoami                          # this account, and its limits
```

That is the whole setup: no browser, no wallet extension, no popup to click. The
output shape follows its destination, prose to a terminal and JSON to a pipe, so
a caller never parses sentences.

```bash
LINK=$(envelope seal --amount 1 | jq -r .claimLink)
```

That variable is now a bearer payment. It travels through anything an agent
already has: a webhook, a message, a tool result, a return value. The receiving
agent needs no relationship with the sender, only the string.

Round trip on Sepolia, end to end:
[sealed](https://sepolia.voyager.online/tx/0x5c08f172fa73fc704748da2205249b6f564ab7762bad463eaf397bc0fdc2d8f) and
[claimed](https://sepolia.voyager.online/tx/0x50cee6c397a1742ab37469abdcd9be252c0e0a307a8554bf247cafe31b113d5),
after which the contract reports `claimed` and refuses a second claim.

`--dry-run` builds and prints a transaction without signing it, which is the
flag to reach for before handing an agent an account that spends on its own.
Details in [`packages/envelope-cli/`](packages/envelope-cli/) and on the
[agent page](https://0xrlawrence.github.io/envelope/agent/).

## Why this doesn't already exist

A STRK20 private transfer needs a registered recipient: someone who has set a
viewing key on-chain and can be sent an encrypted note. That is fine between two
people already inside the pool, and useless for the case that actually matters:
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
| **Claiming a publicly funded envelope to an address** | Nothing further. | The funder, recipient, and amount. Pool-funded envelopes reject this route. |
| **Refunding** | That the refund went back to the original funder. | That an expired envelope was reclaimed. |

**Amounts are public throughout.** An envelope's funding leg and its claim leg
carry the same figure, so the two are trivially linkable to each other. What the
pool hides is the *funder*, which is the property the product is built on:
"pay someone without revealing who you are or what else you hold". It is not
"pay someone without anyone knowing how much".

A distinctive amount is therefore its own de-anonymiser. The app nudges toward
round denominations for this reason. A 10 STRK envelope hides in the crowd of
other 10 STRK envelopes; a 13.7204 STRK envelope does not.

**The link is a bearer instrument.** Whoever holds it can claim. It is carried
in the URL fragment, so it never reaches this app's server, its logs, or its
analytics. But a link pasted into a group chat is money pasted into a group
chat.

## What an agent cannot do

The CLI signs with an account key, and three things need a wallet that can prove
a STRK20 action for its own account class, which a key on its own cannot:

- **Fund privately.** `seal` funds from the agent's address, in the open. The
  amount and the funder are on-chain. Everything else about the envelope is
  unchanged, including that a recipient claiming into a shielded balance is
  unobservable.
- **Claim into a shielded balance.** `open` pays to an address, which puts the
  recipient on-chain.
- **Return an expired envelope.** The contract only accepts a refund from the
  pool, so the return link has to be opened in the app.

So an agent gets the reach, and a human at the app gets the privacy on both
legs. `envelope whoami` prints this list beside the account in use, so a caller
can check its own limits rather than assume them.

## Repository

| Path | |
|---|---|
| [`cairo/`](cairo/) | The `EnvelopeAnonymizer` contract and its test suite |
| [`packages/envelope-sdk/`](packages/envelope-sdk/) | [`strk20-envelope`](https://www.npmjs.com/package/strk20-envelope): keys, links, signing, STRK20 action builders |
| [`packages/envelope-cli/`](packages/envelope-cli/) | [`strk20-envelope-cli`](https://www.npmjs.com/package/strk20-envelope-cli): the `envelope` command, for terminals and agents |
| [`web/`](web/) | The app |
| [`docs/`](docs/) | Protocol notes, mainnet addresses, open questions |

### The contract

One `privacy_invoke` entry point, dispatching on an operation, plus one public
entry point for recipients who are not in the pool:

| Operation | Driven by | Effect |
|---|---|---|
| `Fund` | the pool | Parks the value the pool just withdrew and marks the envelope private-claim-only. Returns an **empty** span, so nothing is credited yet. |
| `Claim` | the pool | Releases into an open note. Returns one `OpenNoteDeposit`. |
| `Refund` | the pool | After expiry only, returns the value to the funder as an open note. |
| `claim_to_address` | anyone | Releases a publicly funded envelope as a plain ERC-20 transfer. Pool-funded envelopes reject it. |

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
the Cairo suite. If the two ever drift, that test fails rather than every
signature silently being rejected on-chain.

## Build and test

```bash
cd cairo && scarb build && snforge test
```

```bash
npm install && npm test
```

That runs the SDK suite, the CLI suite and the Cairo tests. A single package on
its own:

```bash
npm test --workspace strk20-envelope
npm test --workspace strk20-envelope-cli
```

## Status

Built for the [STRK20 Private Sprint](https://strk20.starknet.io/hackathon),
14 to 31 August 2026. Mainnet addresses and transaction hashes are in
[`strk20.json`](strk20.json); what is deployed and what is not is tracked in
[`docs/STATUS.md`](docs/STATUS.md).

This code has not been audited. It moves real money on mainnet. Read it before
you trust it, and do not park more in it than you would hand to a stranger.

## Licence

[Apache 2.0](LICENSE), matching the STRK20 protocol repositories so the contract
can be lifted into them without a licence change.
