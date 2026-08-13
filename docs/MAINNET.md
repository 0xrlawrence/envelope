# Addresses

Every address here is either read off the chain or cross-checked against two
independent sources. Guessing at a pool address produces failures that look
exactly like a bug in your own contract, so nothing in this file is copied from
memory.

## STRK20 privacy pool

| Network | Address | Provenance |
|---|---|---|
| Mainnet | `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a` | [Day 0 doc](https://github.com/starkience/strk20-hackathon/blob/main/docs/MAINNET-DAY-0.md), and `PRIVACY_POOL_ADDRESS` in `@avnu/avnu-sdk@4.2.0` (identical) |
| Sepolia | `0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91` | `SEPOLIA_PRIVACY_POOL_ADDRESS` in `@avnu/avnu-sdk@4.2.0` |

## Envelope anonymizer

| Network | | |
|---|---|---|
| Sepolia | Class hash | `0x3be9a8abdbb16514d2ba2220098e256e3c5589b0b3288977a4f74d761ea6819` |
| Sepolia | Contract | [`0x05c5cdd9a2983bb4842d1a2c0b7ccdfa29d704e7217623349eb76cb237805604`](https://sepolia.starkscan.co/contract/0x05c5cdd9a2983bb4842d1a2c0b7ccdfa29d704e7217623349eb76cb237805604) |
| Mainnet | | Not yet deployed |

Verified after deployment:

```console
$ sncast call --contract-address 0x05c5cd… --function pool
ContractAddress(0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91)
```

## Tokens

| | Mainnet |
|---|---|
| STRK | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` |

## Toolchain

The Sepolia class was declared with **Scarb 2.15.1** (Cairo 2.15.0, Sierra
1.7.0) and accepted without complaint, so the newer Scarb the STRK20 starter kit
pins is not a requirement. Recorded because discovering otherwise at mainnet
declare time would be an expensive surprise.

## RPC

Public Sepolia endpoints are unreliable: Blast has been retired outright, and
Lava's testnet endpoint returns provider-pairing errors. These two answered
consistently while building:

- `https://api.cartridge.gg/x/starknet/sepolia`
- `https://starknet-sepolia.drpc.org`

Mainnet uses `https://rpc.starknet.lava.build`, the endpoint the Day-0 doc
specifies.
