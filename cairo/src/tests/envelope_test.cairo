use envelope::envelope::{IEnvelopeDispatcher, IEnvelopeDispatcherTrait};
use envelope::mocks::{IMockErc20Dispatcher, IMockErc20DispatcherTrait};
use envelope::types::{
    EnvelopeOp, MODE_ADDRESS, MODE_NOTE, MODE_REFUND, release_message_hash, status,
};
use snforge_std::signature::stark_curve::{StarkCurveKeyPairImpl, StarkCurveSignerImpl};
use snforge_std::signature::{KeyPair, KeyPairTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp_global,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

const POOL: felt252 = 'POOL';
const OUTSIDER: felt252 = 'OUTSIDER';
const ALICE: felt252 = 'ALICE';
const MALLORY: felt252 = 'MALLORY';

const FUNDED_AMOUNT: u128 = 1_000;
const NOTE_ID: felt252 = 'NOTE_0';
const MEMO: felt252 = 'INVOICE_42';
const NOW: u64 = 1_700_000_000;

type Key = KeyPair<felt252, felt252>;

fn addr(value: felt252) -> ContractAddress {
    value.try_into().unwrap()
}

/// Deploys a token and an anonymizer pinned to `POOL`, then mints `minted` to
/// the anonymizer to stand in for the pool's `Withdraw` phase having already run.
fn setup(minted: u128) -> (IEnvelopeDispatcher, IMockErc20Dispatcher) {
    let token_class = declare("MockErc20").unwrap().contract_class();
    let (token_address, _) = token_class.deploy(@array![]).unwrap();
    let token = IMockErc20Dispatcher { contract_address: token_address };

    let envelope_class = declare("EnvelopeAnonymizer").unwrap().contract_class();
    let (envelope_address, _) = envelope_class.deploy(@array![POOL]).unwrap();
    let envelope = IEnvelopeDispatcher { contract_address: envelope_address };

    token.mint(envelope_address, minted.into());
    start_cheat_block_timestamp_global(NOW);
    (envelope, token)
}

fn new_key() -> Key {
    KeyPairTrait::<felt252, felt252>::generate()
}

fn sign(key: Key, contract: ContractAddress, mode: felt252, claim_pubkey: felt252, target: felt252,
) -> (felt252, felt252) {
    key.sign(release_message_hash(contract, mode, claim_pubkey, target)).unwrap()
}

/// Drives `Fund` as the pool would.
fn fund(
    envelope: IEnvelopeDispatcher,
    token: ContractAddress,
    claim_pubkey: felt252,
    refund_pubkey: felt252,
    amount: u128,
    unlock_at: u64,
    expiry: u64,
) {
    start_cheat_caller_address(envelope.contract_address, addr(POOL));
    envelope
        .privacy_invoke(
            EnvelopeOp::Fund,
            claim_pubkey,
            token,
            amount,
            refund_pubkey,
            unlock_at,
            expiry,
            MEMO,
            0,
            0,
            0,
        );
    stop_cheat_caller_address(envelope.contract_address);
}

/// A plain immediately-claimable envelope with no expiry.
fn fund_simple(envelope: IEnvelopeDispatcher, token: ContractAddress, key: Key) {
    fund(envelope, token, key.public_key, 0, FUNDED_AMOUNT, 0, 0);
}

// ─── Funding ────────────────────────────────────────────────────────────────

#[test]
fn fund_parks_value_and_reserves_it() {
    let key = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);
    fund_simple(envelope, token.contract_address, key);

    let stored = envelope.get_envelope(key.public_key);
    assert!(stored.status == status::FUNDED, "envelope should be funded");
    assert!(stored.amount == FUNDED_AMOUNT, "amount should be recorded");
    assert!(stored.token == token.contract_address, "token should be recorded");
    assert!(stored.memo == MEMO, "memo should be recorded");
    assert!(
        envelope.reserved_of(token.contract_address) == FUNDED_AMOUNT, "value should be reserved",
    );
}

#[test]
#[should_panic(expected: 'CALLER_NOT_POOL')]
fn only_the_pool_can_drive_privacy_invoke() {
    let key = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);

    start_cheat_caller_address(envelope.contract_address, addr(OUTSIDER));
    envelope
        .privacy_invoke(
            EnvelopeOp::Fund,
            key.public_key,
            token.contract_address,
            FUNDED_AMOUNT,
            0,
            0,
            0,
            MEMO,
            0,
            0,
            0,
        );
}

/// The solvency check. `amount` arrives as funder-supplied calldata, so a funder
/// who withdrew 100 but declared 1000 would otherwise be writing a claim against
/// somebody else's parked value.
#[test]
#[should_panic(expected: 'UNDERFUNDED')]
fn funding_more_than_arrived_is_rejected() {
    let key = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);
    fund(envelope, token.contract_address, key.public_key, 0, FUNDED_AMOUNT + 1, 0, 0);
}

/// The same check across envelopes: a second funder cannot lay claim to value
/// already reserved by the first.
#[test]
#[should_panic(expected: 'UNDERFUNDED')]
fn a_second_envelope_cannot_double_reserve_the_first() {
    let first = new_key();
    let second = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);

    fund_simple(envelope, token.contract_address, first);
    fund(envelope, token.contract_address, second.public_key, 0, FUNDED_AMOUNT, 0, 0);
}

#[test]
#[should_panic(expected: 'ENVELOPE_EXISTS')]
fn a_claim_key_cannot_be_reused() {
    let key = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT * 2);
    fund_simple(envelope, token.contract_address, key);
    fund_simple(envelope, token.contract_address, key);
}

#[test]
#[should_panic(expected: 'ZERO_REFUND_KEY')]
fn an_expiring_envelope_needs_a_refund_key() {
    let key = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);
    fund(envelope, token.contract_address, key.public_key, 0, FUNDED_AMOUNT, 0, NOW + 100);
}

#[test]
#[should_panic(expected: 'LOCK_AFTER_EXPIRY')]
fn an_envelope_that_unlocks_after_it_expires_is_rejected() {
    let key = new_key();
    let refund = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);
    fund(
        envelope,
        token.contract_address,
        key.public_key,
        refund.public_key,
        FUNDED_AMOUNT,
        NOW + 200,
        NOW + 100,
    );
}

// ─── Claiming to a public address ───────────────────────────────────────────

#[test]
fn claim_to_address_pays_a_recipient_who_never_touched_the_pool() {
    let key = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);
    fund_simple(envelope, token.contract_address, key);

    let (r, s) = sign(
        key, envelope.contract_address, MODE_ADDRESS, key.public_key, addr(ALICE).into(),
    );
    envelope.claim_to_address(key.public_key, addr(ALICE), r, s);

    assert!(token.balance_of(addr(ALICE)) == FUNDED_AMOUNT.into(), "alice should be paid");
    assert!(
        envelope.get_envelope(key.public_key).status == status::CLAIMED, "should be claimed",
    );
    assert!(envelope.reserved_of(token.contract_address) == 0, "reservation should be released");
}

/// The front-running property, and the reason envelopes commit to a public key
/// rather than a hash preimage. Mallory watches the mempool, lifts the whole
/// signed claim, and resubmits it pointing at herself. The signature does not
/// travel with her.
#[test]
#[should_panic(expected: 'BAD_SIGNATURE')]
fn a_claim_signature_cannot_be_retargeted_by_a_front_runner() {
    let key = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);
    fund_simple(envelope, token.contract_address, key);

    // Alice's authorisation, in the clear, exactly as an observer would see it.
    let (r, s) = sign(
        key, envelope.contract_address, MODE_ADDRESS, key.public_key, addr(ALICE).into(),
    );

    start_cheat_caller_address(envelope.contract_address, addr(MALLORY));
    envelope.claim_to_address(key.public_key, addr(MALLORY), r, s);
}

/// Mode separation: an authorisation to pay a public address must not double as
/// an authorisation to release into the pool, since both targets are bare felts.
#[test]
#[should_panic(expected: 'BAD_SIGNATURE')]
fn a_public_claim_signature_does_not_work_on_the_private_path() {
    let key = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);
    fund_simple(envelope, token.contract_address, key);

    let (r, s) = sign(key, envelope.contract_address, MODE_ADDRESS, key.public_key, NOTE_ID);

    start_cheat_caller_address(envelope.contract_address, addr(POOL));
    envelope
        .privacy_invoke(
            EnvelopeOp::Claim, key.public_key, addr(0), 0, 0, 0, 0, 0, r, s, NOTE_ID,
        );
}

#[test]
#[should_panic(expected: 'ENVELOPE_NOT_FUNDED')]
fn an_envelope_cannot_be_claimed_twice() {
    let key = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);
    fund_simple(envelope, token.contract_address, key);

    let (r, s) = sign(
        key, envelope.contract_address, MODE_ADDRESS, key.public_key, addr(ALICE).into(),
    );
    envelope.claim_to_address(key.public_key, addr(ALICE), r, s);
    envelope.claim_to_address(key.public_key, addr(ALICE), r, s);
}

// ─── Claiming into the pool ─────────────────────────────────────────────────

#[test]
fn claim_to_note_approves_the_pool_for_exactly_the_envelope() {
    let key = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);
    fund_simple(envelope, token.contract_address, key);

    let (r, s) = sign(key, envelope.contract_address, MODE_NOTE, key.public_key, NOTE_ID);

    start_cheat_caller_address(envelope.contract_address, addr(POOL));
    let deposits = envelope
        .privacy_invoke(
            EnvelopeOp::Claim, key.public_key, addr(0), 0, 0, 0, 0, 0, r, s, NOTE_ID,
        );
    stop_cheat_caller_address(envelope.contract_address);

    assert!(deposits.len() == 1, "one deposit instruction expected");
    let deposit = *deposits.at(0);
    assert!(deposit.note_id == NOTE_ID, "should credit the open note the wallet substituted");
    assert!(deposit.token == token.contract_address, "should credit the funded token");
    assert!(deposit.amount == FUNDED_AMOUNT, "should credit the full envelope");

    // The pool pulls this itself once privacy_invoke returns.
    assert!(
        token.allowance(envelope.contract_address, addr(POOL)) == FUNDED_AMOUNT.into(),
        "pool should be approved for exactly the envelope",
    );
    assert!(envelope.reserved_of(token.contract_address) == 0, "reservation should be released");
}

#[test]
fn fund_returns_no_deposit_instructions() {
    let key = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);

    start_cheat_caller_address(envelope.contract_address, addr(POOL));
    let deposits = envelope
        .privacy_invoke(
            EnvelopeOp::Fund,
            key.public_key,
            token.contract_address,
            FUNDED_AMOUNT,
            0,
            0,
            0,
            MEMO,
            0,
            0,
            0,
        );
    assert!(deposits.len() == 0, "funding credits nothing; the value stays parked");
}

// ─── Time windows ───────────────────────────────────────────────────────────

#[test]
#[should_panic(expected: 'STILL_LOCKED')]
fn a_time_locked_envelope_cannot_be_claimed_early() {
    let key = new_key();
    let refund = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);
    fund(
        envelope,
        token.contract_address,
        key.public_key,
        refund.public_key,
        FUNDED_AMOUNT,
        NOW + 100,
        NOW + 500,
    );

    let (r, s) = sign(
        key, envelope.contract_address, MODE_ADDRESS, key.public_key, addr(ALICE).into(),
    );
    envelope.claim_to_address(key.public_key, addr(ALICE), r, s);
}

#[test]
fn a_time_locked_envelope_opens_at_its_unlock_time() {
    let key = new_key();
    let refund = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);
    fund(
        envelope,
        token.contract_address,
        key.public_key,
        refund.public_key,
        FUNDED_AMOUNT,
        NOW + 100,
        NOW + 500,
    );

    start_cheat_block_timestamp_global(NOW + 100);
    let (r, s) = sign(
        key, envelope.contract_address, MODE_ADDRESS, key.public_key, addr(ALICE).into(),
    );
    envelope.claim_to_address(key.public_key, addr(ALICE), r, s);
    assert!(token.balance_of(addr(ALICE)) == FUNDED_AMOUNT.into(), "alice should be paid");
}

#[test]
#[should_panic(expected: 'EXPIRED')]
fn an_expired_envelope_cannot_be_claimed() {
    let key = new_key();
    let refund = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);
    fund(
        envelope,
        token.contract_address,
        key.public_key,
        refund.public_key,
        FUNDED_AMOUNT,
        0,
        NOW + 100,
    );

    start_cheat_block_timestamp_global(NOW + 100);
    let (r, s) = sign(
        key, envelope.contract_address, MODE_ADDRESS, key.public_key, addr(ALICE).into(),
    );
    envelope.claim_to_address(key.public_key, addr(ALICE), r, s);
}

// ─── Refunds ────────────────────────────────────────────────────────────────

#[test]
fn an_expired_envelope_refunds_to_the_funder() {
    let key = new_key();
    let refund = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);
    fund(
        envelope,
        token.contract_address,
        key.public_key,
        refund.public_key,
        FUNDED_AMOUNT,
        0,
        NOW + 100,
    );

    start_cheat_block_timestamp_global(NOW + 100);
    let (r, s) = sign(refund, envelope.contract_address, MODE_REFUND, key.public_key, NOTE_ID);

    start_cheat_caller_address(envelope.contract_address, addr(POOL));
    let deposits = envelope
        .privacy_invoke(
            EnvelopeOp::Refund, key.public_key, addr(0), 0, 0, 0, 0, 0, r, s, NOTE_ID,
        );

    assert!(deposits.len() == 1, "refund should credit an open note");
    assert!(*deposits.at(0).amount == FUNDED_AMOUNT, "refund should return the full envelope");
    assert!(
        envelope.get_envelope(key.public_key).status == status::REFUNDED, "should be refunded",
    );
    assert!(envelope.reserved_of(token.contract_address) == 0, "reservation should be released");
}

#[test]
#[should_panic(expected: 'NOT_YET_EXPIRED')]
fn a_live_envelope_cannot_be_refunded() {
    let key = new_key();
    let refund = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);
    fund(
        envelope,
        token.contract_address,
        key.public_key,
        refund.public_key,
        FUNDED_AMOUNT,
        0,
        NOW + 100,
    );

    let (r, s) = sign(refund, envelope.contract_address, MODE_REFUND, key.public_key, NOTE_ID);
    start_cheat_caller_address(envelope.contract_address, addr(POOL));
    envelope
        .privacy_invoke(
            EnvelopeOp::Refund, key.public_key, addr(0), 0, 0, 0, 0, 0, r, s, NOTE_ID,
        );
}

/// Holding the claim key does not let a recipient trigger the refund path, and
/// holding the refund key does not let a funder claim. The two authorities are
/// separate keys over separate modes.
#[test]
#[should_panic(expected: 'BAD_SIGNATURE')]
fn the_claim_key_cannot_authorise_a_refund() {
    let key = new_key();
    let refund = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);
    fund(
        envelope,
        token.contract_address,
        key.public_key,
        refund.public_key,
        FUNDED_AMOUNT,
        0,
        NOW + 100,
    );

    start_cheat_block_timestamp_global(NOW + 100);
    let (r, s) = sign(key, envelope.contract_address, MODE_REFUND, key.public_key, NOTE_ID);

    start_cheat_caller_address(envelope.contract_address, addr(POOL));
    envelope
        .privacy_invoke(
            EnvelopeOp::Refund, key.public_key, addr(0), 0, 0, 0, 0, 0, r, s, NOTE_ID,
        );
}

#[test]
#[should_panic(expected: 'NOT_REFUNDABLE')]
fn an_envelope_with_no_expiry_can_never_be_refunded() {
    let key = new_key();
    let refund = new_key();
    let (envelope, token) = setup(FUNDED_AMOUNT);
    fund_simple(envelope, token.contract_address, key);

    let (r, s) = sign(refund, envelope.contract_address, MODE_REFUND, key.public_key, NOTE_ID);
    start_cheat_caller_address(envelope.contract_address, addr(POOL));
    envelope
        .privacy_invoke(
            EnvelopeOp::Refund, key.public_key, addr(0), 0, 0, 0, 0, 0, r, s, NOTE_ID,
        );
}

/// Two deployments of the same code must not share authorisations.
#[test]
#[should_panic(expected: 'BAD_SIGNATURE')]
fn a_signature_does_not_replay_across_deployments() {
    let key = new_key();
    let (first, token) = setup(FUNDED_AMOUNT);

    let envelope_class = declare("EnvelopeAnonymizer").unwrap().contract_class();
    let (second_address, _) = envelope_class.deploy(@array![POOL]).unwrap();
    let second = IEnvelopeDispatcher { contract_address: second_address };
    token.mint(second_address, FUNDED_AMOUNT.into());

    fund_simple(first, token.contract_address, key);
    fund_simple(second, token.contract_address, key);

    // Signed for the first deployment, presented to the second.
    let (r, s) = sign(
        key, first.contract_address, MODE_ADDRESS, key.public_key, addr(ALICE).into(),
    );
    second.claim_to_address(key.public_key, addr(ALICE), r, s);
}

/// Pins the on-chain message construction so the TypeScript SDK can be checked
/// against it. If this value changes, `packages/envelope-sdk` must change with
/// it or every signature it produces will be rejected.
#[test]
fn release_message_hash_is_stable() {
    let hash = release_message_hash(addr('CONTRACT'), MODE_NOTE, 'PUBKEY', 'TARGET');
    println!("release_message_hash = {}", hash);
}

// ─── Funding without the pool ───────────────────────────────────────────────

/// Mirrors an ordinary wallet: approve the anonymizer, then call it. No pool,
/// no viewing key, no STRK20 support in the wallet.
fn fund_publicly(
    envelope: IEnvelopeDispatcher, token: IMockErc20Dispatcher, funder: ContractAddress, key: Key,
) {
    start_cheat_caller_address(token.contract_address, funder);
    token.approve(envelope.contract_address, FUNDED_AMOUNT.into());
    stop_cheat_caller_address(token.contract_address);

    start_cheat_caller_address(envelope.contract_address, funder);
    envelope
        .fund_public(
            key.public_key, token.contract_address, FUNDED_AMOUNT, 0, 0, 0, MEMO,
        );
    stop_cheat_caller_address(envelope.contract_address);
}

#[test]
fn a_public_funder_can_seal_an_envelope() {
    let key = new_key();
    // Nothing pre-minted to the anonymizer: the funder's own tokens pay for it.
    let (envelope, token) = setup(0);
    token.mint(addr(ALICE), FUNDED_AMOUNT.into());

    fund_publicly(envelope, token, addr(ALICE), key);

    let stored = envelope.get_envelope(key.public_key);
    assert!(stored.status == status::FUNDED, "envelope should be funded");
    assert!(stored.amount == FUNDED_AMOUNT, "amount should be recorded");
    assert!(
        token.balance_of(envelope.contract_address) == FUNDED_AMOUNT.into(),
        "tokens should have moved to the anonymizer",
    );
    assert!(token.balance_of(addr(ALICE)) == 0, "funder should have paid");
}

#[test]
fn a_publicly_funded_envelope_claims_exactly_like_any_other() {
    let key = new_key();
    let (envelope, token) = setup(0);
    token.mint(addr(ALICE), FUNDED_AMOUNT.into());
    fund_publicly(envelope, token, addr(ALICE), key);

    let (r, s) = sign(
        key, envelope.contract_address, MODE_ADDRESS, key.public_key, addr(MALLORY).into(),
    );
    envelope.claim_to_address(key.public_key, addr(MALLORY), r, s);

    assert!(token.balance_of(addr(MALLORY)) == FUNDED_AMOUNT.into(), "claimant should be paid");
    assert!(envelope.reserved_of(token.contract_address) == 0, "reservation released");
}

/// The public path must not become a way to write claims against value that
/// belongs to somebody else's envelope.
#[test]
#[should_panic(expected: 'ERC20: insufficient allowance')]
fn public_funding_cannot_seal_without_paying() {
    let key = new_key();
    let (envelope, token) = setup(0);
    token.mint(addr(ALICE), FUNDED_AMOUNT.into());

    // No approval given.
    start_cheat_caller_address(envelope.contract_address, addr(ALICE));
    envelope
        .fund_public(key.public_key, token.contract_address, FUNDED_AMOUNT, 0, 0, 0, MEMO);
}
