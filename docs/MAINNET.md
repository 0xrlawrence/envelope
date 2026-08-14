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
| Sepolia | Class hash | `0x3e66d5a37c26b61535da41b6a5878f327ce0a2f148570e2b263095e6ee9f4d5` |
| Sepolia | Contract | [`0x04ff4f083a4667930efe14963645f9bda00bb10d44e4c13a9ee808e66c076211`](https://sepolia.voyager.online/contract/0x04ff4f083a4667930efe14963645f9bda00bb10d44e4c13a9ee808e66c076211) |
| Sepolia | Previous, pool route only | `0x05c5cdd9a2983bb4842d1a2c0b7ccdfa29d704e7217623349eb76cb237805604` |
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

The endpoint is used for reads only: fetching an envelope, waiting on a
receipt. Every STRK20 action is served by the wallet, which runs its own
discovery and proving, so the node has no bearing on whether shielding or
sealing works. Both networks accept an override, `NEXT_PUBLIC_RPC_MAINNET` and
`NEXT_PUBLIC_RPC_SEPOLIA`.

starknet.js 10.7 expects RPC spec 0.10.x. Measured with
`starknet_specVersion`:

| Endpoint | Network | Spec |
|---|---|---|
| `https://api.cartridge.gg/x/starknet/mainnet` | mainnet | 0.10.2 (default) |
| `https://starknet-mainnet.g.alchemy.com/...` | mainnet | 0.10.3-rc.0 |
| `https://rpc.starknet.lava.build` | mainnet | 0.8.1 |
| `https://api.cartridge.gg/x/starknet/sepolia` | sepolia | 0.9.0 (default) |
| `https://starknet-sepolia.drpc.org` | sepolia | does not serve `starknet_specVersion` |
| Blast, either network | | retired |

The Day-0 doc names Lava for mainnet. It answers, but at spec 0.8.1 it is two
versions behind what the client expects, so Cartridge is the default here and
Lava is a fallback.
