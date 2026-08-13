# Open questions

Things this repository does **not** currently know the answer to, in the order
they need answering. Each one has a fallback so nothing here is load-bearing on
a reply arriving.

## 1. How does a dapp learn an open note's id before signing? — blocking the private claim path

The private claim path signs over the id of the open note the claim will fill.
It has to: the note id is the only value in the transaction that says *where the
money lands*, so binding the signature to anything else lets an observer lift it,
pair it with a note they own, and take the envelope.

But `${openNoteIds[0]}` is substituted by the wallet while it assembles the
transaction, so the claimant is being asked to sign a value that does not exist
yet.

`resolveOpenNoteId` in the SDK works around this with a dry run: assemble a
probe transaction containing a single `OPEN` transfer and no invoke, let the
wallet substitute the id, read it back, then sign it and submit for real. This
rests on two things that are true as far as the docs go but are not guaranteed
by the Wallet API spec:

- open note ids are dense sequential indices over the claimant's own notes, so
  the id does not depend on what else is in the transaction;
- `strk20PrepareInvoke(actions, true)` returns the substituted calldata in a
  readable position.

**To confirm:** ask in the builders group, and test against Ready on Sepolia.

**Fallback if it does not hold:** ship the public claim path (`claim_to_address`)
as the primary route — it is complete, front-run-proof and needs none of this —
and have private claimants shield the proceeds in a second step. Costs
atomicity and leaks the claimant's address; costs nothing else.

## 2. Are the mainnet discovery and proving endpoints published yet?

[`MAINNET-DAY-0.md`](https://github.com/starkience/strk20-hackathon/blob/main/docs/MAINNET-DAY-0.md)
says the mainnet discovery/indexer URL and proving service URL "come from
StarkWare and will be filled in here before August 14". As of the start of the
sprint they are still absent, and the Privacy SDK is not published to npm.

This does **not** block Envelope: the Wallet API route delegates discovery and
proving to the user's wallet, which is why the app is built on
`WalletAccountV6` rather than on the raw SDK.

It does block anything that holds its own keys, which is the only reason
sub-accounts / stealth accounts are out of scope here.

## 3. Do sub-accounts become reachable during the sprint?

Sub-accounts ship in Privacy SDK `0.14.3-rc.4` via
`transfers.build().subaccounts(dappName).invoke(...)`, but only on the SDK
route — no sub-account method is exposed by `@starknet-io/types-js` 0.10.3 or
starknet.js, so a dapp relying on the user's wallet cannot reach them.

The judging criteria name stealth accounts explicitly, so this is worth points
if it opens up. It is scoped as a bonus phase, not a dependency: the envelope
primitive is complete without it.

**If it opens up:** the natural fit is funding each envelope from a fresh
sub-account, so that two envelopes from the same funder stop sharing a funding
identity even in the pool's own view.

## 4. Does the pool tolerate an `invoke` that credits nothing?

`Fund` returns an empty `Span<OpenNoteDeposit>`. The docs say this is valid —
*"An empty span is valid — it means 'credit nothing' for a step that should not
release funds yet, such as a stateful helper parking funds until a later
claim"* — and the reference escrow relies on it for exactly this. Worth
confirming on Sepolia before the first mainnet fund, because the whole design
rests on it.

## 5. Which Sierra version does mainnet accept?

The contract is built with Scarb 2.15.1 (Sierra 1.7.0); the starter kit pins
Scarb 2.18. Declaring on Sepolia will settle whether an upgrade is needed before
the mainnet declare. Cheap to check, annoying to discover late.
