# strk20-envelope-cli

Pay someone who has no account, from a terminal.

An envelope is value sealed against a key that exists only in a link. Whoever
holds the link takes the contents, so paying costs nothing but handing the link
over: no address to ask for, no registration, no viewing key, no wallet
extension. That is what makes it something one agent can pay another before they
know anything about each other.

```bash
npm install -g strk20-envelope-cli
```

## Walkthrough

Everything below is one real round trip on Sepolia. It takes about a minute.

### 1. Add your `.env.local`

**Nothing works until this exists.** Create a file called `.env.local` in your
project and put three variables in it:

```
STARKNET_ACCOUNT=0x…        # the account that signs
STARKNET_PRIVATE_KEY=0x…    # its key
ENVELOPE_NETWORK=sepolia    # or mainnet
```

No `export`, no quotes needed. Both are tolerated if you paste them anyway.

The file is found on its own: the directory you are standing in, then its
parents up to the repository root, then one level down, which is where a
framework tends to leave one. So a `web/.env.local` is picked up when you run
from the root above it. Exported shell variables work too and always win over a
file, which is how a container should inject a key.

Without it, every command that needs an account says so and stops:

```
STARKNET_ACCOUNT is not set. An envelope is real money, so this refuses to guess at it.
No .env.local or .env in this directory to read it from.

Put it in a .env.local next to where you run this:
  STARKNET_ACCOUNT=0x…

Or point at one anywhere: envelope <command> --env path/to/.env.local
```

Check it landed:

```bash
envelope whoami
```

```
0x025d68dd7C623275D2e47388b19c5504EE631ab46Ee27b0679c38D7200D4BfA7
on Sepolia via https://api.cartridge.gg/x/starknet/sepolia
contract 0x04ff4f083a4667930efe14963645f9bda00bb10d44e4c13a9ee808e66c076211
read from /Users/you/project/web/.env.local

Can: seal, open, status.
Cannot: seal privately, claim into a shielded balance, or return an expired
envelope. All three need a wallet that can prove a STRK20 action.
```

It prints the file it read, so you are never guessing which key is about to
sign. If more than one candidate turns up it refuses to choose and asks you to
name it with `--env <path>`.

### 2. Rehearse

`--dry-run` builds the transaction and prints it without signing or sending.
Worth doing once before this is wired into anything that spends on its own.

```bash
envelope seal --amount 1 --dry-run
```

### 3. Send

```bash
envelope seal --amount 1 --expiry 1h --memo "invoice 1101"
```

```
Sealed 1 STRK on Sepolia, claimable for 1 hour.

Claim link   https://0xrlawrence.github.io/envelope/claim#e1.BLOxvPiH984x…
Return link  https://0xrlawrence.github.io/envelope/refund#r1.BNMQcTd69uw…~0x2e75a…

Anyone holding the claim link can take the contents, so send it the way you
would send cash. Keep the return link: after the window shuts it is the only
way to get the money back, and it needs the web app.

Transaction  https://sepolia.voyager.online/tx/0x5c08f172fa73fc70…
```

Two links, and they are not interchangeable. The **claim link** is a bearer
instrument: hand it to the recipient and nobody else. The **return link** is
yours, it is the only way to reclaim the value after the window shuts, and it
cannot be regenerated from anything.

### 4. Check

```bash
envelope status "https://0xrlawrence.github.io/envelope/claim#e1.BLOxvPiH984x…"
```

```
funded on Sepolia, holding 1 STRK.
Claim window shuts 2026-08-19T07:55:59.000Z.
```

`--id` reads an envelope id instead, for one you were not sent.

### 5. Receive

On the other side, with its own account configured, the recipient runs:

```bash
envelope open "https://0xrlawrence.github.io/envelope/claim#e1.BLOxvPiH984x…"
```

```
Opened 1 STRK to 0x025d68dd7c623275d2e47388b19c5504ee631ab46ee27b0679c38d7200d4bfa7.
```

`--to <address>` sends it somewhere other than the signing account. Reading the
status again now returns `claimed`, and `claimable: false`: an envelope releases
exactly once, which is what makes a link safe to send over a channel you do not
control.

## For programs

One command, two shapes. Read by a person it is prose; piped into anything else
it is JSON, decided by whether stdout is a terminal rather than by remembering a
flag. `--json` and `--human` force it either way.

```bash
LINK=$(envelope seal --amount 1 | jq -r .claimLink)
curl -X POST "$WEBHOOK" -d "{\"pay\": \"$LINK\"}"
```

Every command returns `ok`, and failures carry `error`, so a caller can branch
without parsing sentences.

```bash
envelope status "$LINK" | jq -e '.status == "claimed"' && echo paid
```

## Or the library

The CLI is a thin wrapper over [`strk20-envelope`](https://www.npmjs.com/package/strk20-envelope),
which is the same package the web app is built on.

```ts
import { buildPublicFundCalls, encodeClaimLink, generateEnvelopeKey } from "strk20-envelope";

const claim = generateEnvelopeKey();
const refund = generateEnvelopeKey();

const calls = buildPublicFundCalls({
  anonymizer, token, amount: 1_000_000_000_000_000_000n,
  claimPublicKey: claim.publicKey,
  refundPublicKey: refund.publicKey,
  expiry: Math.floor(Date.now() / 1000) + 86_400,
});

await account.execute(calls);
const link = encodeClaimLink(origin, claim.privateKey);
```

## Commands

| | |
|---|---|
| `seal --amount <n>` | Fund an envelope. `--expiry 24h`, `--memo <text>`, `--dry-run` |
| `open <link>` | Claim one. `--to <address>`, `--dry-run` |
| `status <link>` | Read the contract. `--id` for an envelope id |
| `whoami` | The account, the network, and what they can do |

Global: `--json`, `--human`, `--env <path>`, `--verbose`.

## What a key alone cannot do

Three things need a wallet that can prove a STRK20 action for its own account
class, which a private key cannot:

- **Fund privately.** `seal` funds from your address, in the open: the amount and
  the funder are on-chain. Everything else about the envelope is unchanged,
  including that a recipient claiming into a shielded balance is unobservable.
- **Claim into a shielded balance.** `open` pays to an address, which puts the
  recipient on-chain.
- **Return an expired envelope.** The contract only accepts a refund from the
  pool, so the return link has to be opened in the web app.

`envelope whoami` prints this list next to the account in use, so a caller can
check rather than assume.

## Handling keys

`STARKNET_PRIVATE_KEY` is the raw signing key for the account, not a session
token. Whatever process holds it holds the money. Keep the file out of git, and
use an account you are willing to lose while you are trying this out.

## Licence

Apache-2.0. Unaudited. It moves real money on mainnet.
