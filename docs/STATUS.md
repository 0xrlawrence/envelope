# Status

Updated as the sprint runs. What the panel reads is `strk20.json`; this file is
the honest version with the caveats attached.

| | State |
|---|---|
| `EnvelopeAnonymizer` contract | Written, 21 tests passing |
| `strk20-envelope` SDK | Written, 8 tests passing, pinned to the contract by a shared vector |
| Sepolia declare + deploy | **Done**. [`0x05c5cd…`](https://sepolia.starkscan.co/contract/0x05c5cdd9a2983bb4842d1a2c0b7ccdfa29d704e7217623349eb76cb237805604) |
| Signature scheme, on a live chain | **Done**. See below |
| Web app | **Built**. Seal / claim / return, on the Wallet API route via `WalletAccountV6` |
| Fund and claim driven by the real pool | Not yet |
| Mainnet deploy | Not yet |
| Three mainnet pool transactions | Not yet |
| Demo video | Not yet |

## The signature scheme works on a live chain

The interesting half of this project is the claim authorisation, and it has now
been exercised end to end on Sepolia rather than only against the test suite.

A second instance of the same class was deployed with its `pool` constructor
argument set to an ordinary account, so that `privacy_invoke` could be driven
directly. That harness is at
[`0x054ef6…`](https://sepolia.starkscan.co/contract/0x054ef67e47cfac54fb0b9fd49e8456ab771eca24479f1532becb3fb04dc6daef).
It is **not** the real deployment and is not wired to any pool; it exists so the
cryptography could be tested without a privacy wallet in the loop.

| Step | Result |
|---|---|
| `Fund` a 3 STRK envelope | [`0x049add…`](https://sepolia.starkscan.co/tx/0x049add08e68c59ab05819b50104f0aae7142ec72961f483a4bfc5f8a414a70a1) |
| `claim_to_address`, signed by the TypeScript SDK | [`0x000534…`](https://sepolia.starkscan.co/tx/0x000534ae3849567500125cddde47925d21c401565480db76344e48bfe6942243) |
| Recipient balance | exactly 3 STRK |
| Envelope status | flipped to `CLAIMED` |
| Reserved balance | released to 0 |

So a stark-curve signature produced in TypeScript, over a Poseidon message built
in TypeScript, verifies inside the deployed Cairo contract and moves real value.
That was the largest thing standing between the design and mainnet.

## What is still unproven

The contract has not been driven *by the pool*. Everything about the STRK20 side
of `privacy_invoke` (that funding may return an empty span, that the pool pulls
an approved amount into an open note) is still only proven against the mock in
the test suite. See [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md).
