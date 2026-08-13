# Status

Updated as the sprint runs. What the panel reads is `strk20.json`; this file is
the honest version with the caveats attached.

| | State |
|---|---|
| `EnvelopeAnonymizer` contract | Written, 21 tests passing |
| `strk20-envelope` SDK | Written, 8 tests passing, pinned to the contract by a shared vector |
| Sepolia declare + deploy | **Done** — [`0x05c5cd…`](https://sepolia.starkscan.co/contract/0x05c5cdd9a2983bb4842d1a2c0b7ccdfa29d704e7217623349eb76cb237805604), reads back the right pool |
| Fund / claim against a live pool | Not yet |
| Mainnet deploy | Not yet |
| Three mainnet pool transactions | Not yet |
| Web app | **Built** — seal / claim / return, Wallet API route via `WalletAccountV6` |
| Demo video | Not yet |

## What the Sepolia deploy settled

- Scarb 2.15.1 (Sierra 1.7.0) declares fine; no toolchain upgrade needed.
- The `Envelope` struct serialises as the 7 felts the SDK read layer assumes.
- The constructor pins the pool correctly.

## What it did not settle

The contract has not yet been driven *by the pool*. Everything about
`privacy_invoke` — that funding may return an empty span, that the pool pulls
an approved amount into an open note — is still only proven against the mock in
the test suite. See [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md).
