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

```bash
export STARKNET_ACCOUNT=0x...        # the account that signs
export STARKNET_PRIVATE_KEY=0x...    # its key
export ENVELOPE_NETWORK=sepolia      # or mainnet
```

The key is read from the environment and never written to disk. Treat the process
holding it as holding the money.

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

JSON whenever stdout is not a terminal, so a program calling this never has to read
prose. `--json` forces it and `--human` forces the other way.

```bash
envelope seal --amount 1 --json | jq -r .claimLink
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
