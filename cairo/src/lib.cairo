//! Envelope — programmable private claim links for the STRK20 privacy pool.
//!
//! An *envelope* is a parcel of ERC-20 value parked in this contract by someone
//! spending a shielded note, released later to whoever holds the envelope's
//! claim key. The funder is hidden by the pool; the claimant never needs to have
//! touched the pool at all.
//!
//! See `envelope.cairo` for the contract and `docs/PROTOCOL.md` for the
//! threat model and the precise hidden-vs-visible breakdown.

pub mod envelope;
pub mod erc20;
pub mod mocks;
pub mod types;

#[cfg(test)]
mod tests;
