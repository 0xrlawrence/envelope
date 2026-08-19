# strk20-envelope-cli

Send and open [Envelope](https://0xrlawrence.github.io/envelope/) claim links from a
terminal, or from an agent that has an account key and no browser.

An envelope is value sealed against a key that exists only in a link. Whoever holds
the link can take the contents, and the recipient needs no account with anyone: no
registration, no viewing key, no wallet extension. That makes it a way for an agent
to pay a counterparty it knows nothing about, including another agent.

```bash
npm install -g strk20-envelope-cli
```

## Setup

Put a `.env.local` where you run from, or anywhere in the project:

```
STARKNET_ACCOUNT=0x…        # the account that signs
STARKNET_PRIVATE_KEY=0x…    # its key
ENVELOPE_NETWORK=sepolia    # or mainnet
```

It is found on its own: the directory you are in, then its parents up to the
repository root, then one level down, which is where a framework tends to leave
one. `envelope whoami` prints which file it read. If more than one turns up it
refuses to choose and asks you to name it:

```bash
envelope whoami --env web/.env.local
```

Exported shell variables work too, and always win over a file, so a container
that injects a key cannot have it replaced by a dotfile in a checkout.

Whatever holds that key holds the money. Keep the file out of git: `.env*` is
already ignored in most templates, and it is worth checking rather than assuming.

## Sending

```bash
envelope seal --amount 1 --expiry 24h --memo "invoice 1101"
```

Prints a **claim link** to hand over and a **return link** to keep. Anyone holding
the claim link can take the contents, so send it the way you would send cash. The
return link is the only way to get the money back after the window shuts, and it
cannot be regenerated.

## Receiving

```bash
envelope open "https://0xrlawrence.github.io/envelope/claim#e1.…"
envelope status "https://0xrlawrence.github.io/envelope/claim#e1.…"
```

`open` claims to your own account unless `--to` says otherwise. `status` also takes
an envelope id with `--id`, for reading an envelope you were not sent.

## Output

One command, two shapes. Read by a person it is prose; piped into anything else it
is JSON, decided by whether stdout is a terminal rather than by remembering a flag.
`--json` and `--human` force it either way.

```bash
envelope seal --amount 1 | jq -r .claimLink
```

`--dry-run` builds and prints the transaction without signing or sending it, which
is worth doing once before wiring this into anything that spends on its own.

## What this cannot do

Three things need a wallet that can prove a STRK20 action for its own account
class, which a bare private key cannot:

- **Funding privately.** `seal` funds from your address, in the open. The amount and
  the funder are on-chain. Everything else about the envelope is unchanged.
- **Claiming into a shielded balance.** `open` pays to an address.
- **Returning an expired envelope.** The contract only accepts a refund from the
  pool, so the return link has to be opened in the web app.

`envelope whoami` prints this list alongside the account in use, so a caller can
check rather than assume.

## Licence

Apache-2.0. Unaudited. It moves real money on mainnet.
