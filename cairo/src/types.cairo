use starknet::ContractAddress;

/// Mirrors `privacy::objects::OpenNoteDeposit` from the STRK20 pool.
///
/// The pool deserializes a helper's return value as `Span<OpenNoteDeposit>`, so
/// the field order here is load-bearing: it is positional Serde against a struct
/// we do not import. The `privacy` Cairo package is not published, so every
/// anonymizer redeclares this shape locally.
#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub struct OpenNoteDeposit {
    /// Identifier of the open note to credit.
    pub note_id: felt252,
    /// ERC-20 to credit it with.
    pub token: ContractAddress,
    /// Amount to credit, measured on-chain at execution time.
    pub amount: u128,
}

/// Which of the three pool-driven operations `privacy_invoke` should run.
///
/// Serializes as a single felt (the variant index), so it occupies one calldata
/// slot in the wallet's `invoke` action.
#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub enum EnvelopeOp {
    /// Park tokens the pool has already withdrawn to this contract.
    Fund,
    /// Release a funded envelope into an open note inside the pool.
    Claim,
    /// Return an expired, unclaimed envelope to its funder as an open note.
    Refund,
}

/// Lifecycle of a single envelope. Stored, so it needs a stable representation.
pub mod status {
    /// No envelope has ever been funded under this claim key.
    pub const NONE: u8 = 0;
    /// Funded and awaiting a claim.
    pub const FUNDED: u8 = 1;
    /// Claimed — terminal.
    pub const CLAIMED: u8 = 2;
    /// Refunded to the funder — terminal.
    pub const REFUNDED: u8 = 3;
}

/// A parked parcel of value, keyed by its claim public key.
#[derive(Serde, Copy, Drop, PartialEq, Debug, starknet::Store)]
pub struct Envelope {
    /// ERC-20 held for this envelope.
    pub token: ContractAddress,
    /// Amount held, in the token's smallest unit.
    pub amount: u128,
    /// Stark-curve public key authorised to refund after expiry. May be 0 only
    /// when `expiry` is 0, i.e. when the envelope can never be refunded.
    pub refund_pubkey: felt252,
    /// Unix time before which a claim is rejected. 0 means claimable at once.
    pub unlock_at: u64,
    /// Unix time at which the claim window shuts and the refund window opens.
    /// 0 means the envelope never expires and can never be refunded.
    pub expiry: u64,
    /// Opaque funder-supplied tag, echoed in events. Used by the app to bind an
    /// envelope to an invoice or payout run without putting anything on-chain
    /// that identifies the funder.
    pub memo: felt252,
    /// One of `status::*`.
    pub status: u8,
}

/// Domain separator for every signed message this contract accepts.
pub const DOMAIN: felt252 = 'ENVELOPE_V1';

/// Signature is over an open-note id and releases into the pool.
pub const MODE_NOTE: felt252 = 'CLAIM_TO_NOTE';
/// Signature is over a recipient address and releases as a public transfer.
pub const MODE_ADDRESS: felt252 = 'CLAIM_TO_ADDRESS';
/// Signature is over an open-note id and returns the value to the funder.
pub const MODE_REFUND: felt252 = 'REFUND_TO_NOTE';

/// Binds a signature to this contract, this envelope, one release mode and one
/// target.
///
/// Including `contract` stops a signature being replayed against another
/// deployment of the same code; including `mode` stops a signature authorising a
/// public payout from being replayed as a private one (both targets are bare
/// felts, so without the tag a note id and an address inhabit the same space).
pub fn release_message_hash(
    contract: starknet::ContractAddress, mode: felt252, claim_pubkey: felt252, target: felt252,
) -> felt252 {
    core::poseidon::poseidon_hash_span(
        [DOMAIN, contract.into(), mode, claim_pubkey, target].span(),
    )
}
