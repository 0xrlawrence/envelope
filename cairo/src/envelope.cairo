use envelope::types::{Envelope, EnvelopeOp, OpenNoteDeposit};
use starknet::ContractAddress;

#[starknet::interface]
pub trait IEnvelope<TState> {
    /// The entry point the STRK20 pool calls, via `INVOKE_SELECTOR`, during the
    /// `InvokeExternal` phase of a private transaction.
    ///
    /// The pool deserializes the `invoke` action's calldata straight into these
    /// parameters, so every one of them occupies exactly one felt and the order
    /// is part of the contract's ABI in the strictest sense. Unused parameters
    /// for a given `op` are passed as 0.
    ///
    /// * `Fund` reads `claim_pubkey`, `token`, `amount`, `refund_pubkey`,
    ///   `unlock_at`, `expiry`, `memo`, and returns an empty span, so the value
    ///   stays parked here rather than being credited to a note.
    /// * `Claim` reads `claim_pubkey`, `sig_r`, `sig_s`, `note_id`.
    /// * `Refund` reads `claim_pubkey`, `sig_r`, `sig_s`, `note_id`.
    fn privacy_invoke(
        ref self: TState,
        op: EnvelopeOp,
        claim_pubkey: felt252,
        token: ContractAddress,
        amount: u128,
        refund_pubkey: felt252,
        unlock_at: u64,
        expiry: u64,
        memo: felt252,
        sig_r: felt252,
        sig_s: felt252,
        note_id: felt252,
    ) -> Span<OpenNoteDeposit>;

    /// Release an envelope as an ordinary public ERC-20 transfer.
    ///
    /// This is the path for a recipient who has never touched the privacy pool:
    /// it needs no viewing key, no registration and no STRK20-capable wallet,
    /// only the claim key from the link, and any account able to send a
    /// transaction. The signature is bound to `recipient`, so watching the
    /// mempool and resubmitting with a different recipient does not work.
    fn claim_to_address(
        ref self: TState,
        claim_pubkey: felt252,
        recipient: ContractAddress,
        sig_r: felt252,
        sig_s: felt252,
    );

    /// The envelope stored under `claim_pubkey`. All fields are 0 if none exists.
    fn get_envelope(self: @TState, claim_pubkey: felt252) -> Envelope;

    /// Value currently owed to unclaimed envelopes in `token`. Anything this
    /// contract holds above this figure is unreserved and cannot be claimed.
    fn reserved_of(self: @TState, token: ContractAddress) -> u128;

    /// The privacy pool this helper was pinned to at deployment.
    fn pool(self: @TState) -> ContractAddress;
}

/// Programmable claim links backed by the STRK20 privacy pool.
///
/// # The shape of the thing
///
/// A funder spends a shielded note, the pool withdraws the value to this
/// contract, and this contract parks it under a **claim public key**. Whoever
/// holds the matching private key can release it later, either into a fresh
/// open note inside the pool, or as a plain ERC-20 transfer to any address.
///
/// # Why a key and not a secret
///
/// The obvious construction is a hash commitment: park against
/// `poseidon(secret)`, release on presentation of the preimage. It is also
/// broken. The preimage travels in public calldata, so anyone watching the
/// mempool can lift it, resubmit with their own note id or their own address,
/// and take the money. The reference escrow helper in the STRK20 docs has this
/// shape.
///
/// Envelopes commit to a stark-curve *public* key instead. Releasing requires a
/// signature over `(this contract, mode, envelope, target)`, so the authorisation
/// is welded to one specific destination. A front-runner sees the signature, and
/// the signature is useless to them: re-targeting it invalidates it, and forging
/// a new one needs the private key, which never leaves the claimant's browser.
#[starknet::contract]
pub mod EnvelopeAnonymizer {
    use core::num::traits::Zero;
    use envelope::erc20::{IErc20Dispatcher, IErc20DispatcherTrait};
    use envelope::types::{
        Envelope as EnvelopeData, EnvelopeOp, MODE_ADDRESS, MODE_NOTE, MODE_REFUND, OpenNoteDeposit,
        release_message_hash, status,
    };
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{
        ContractAddress, get_block_timestamp, get_caller_address, get_contract_address,
    };
    use super::IEnvelope;

    pub mod errors {
        pub const CALLER_NOT_POOL: felt252 = 'CALLER_NOT_POOL';
        pub const ZERO_POOL: felt252 = 'ZERO_POOL';
        pub const ZERO_CLAIM_KEY: felt252 = 'ZERO_CLAIM_KEY';
        pub const ZERO_TOKEN: felt252 = 'ZERO_TOKEN';
        pub const ZERO_AMOUNT: felt252 = 'ZERO_AMOUNT';
        pub const ZERO_RECIPIENT: felt252 = 'ZERO_RECIPIENT';
        pub const ENVELOPE_EXISTS: felt252 = 'ENVELOPE_EXISTS';
        pub const ENVELOPE_NOT_FUNDED: felt252 = 'ENVELOPE_NOT_FUNDED';
        pub const UNDERFUNDED: felt252 = 'UNDERFUNDED';
        pub const AMOUNT_OVERFLOW: felt252 = 'AMOUNT_OVERFLOW';
        pub const STILL_LOCKED: felt252 = 'STILL_LOCKED';
        pub const EXPIRED: felt252 = 'EXPIRED';
        pub const NOT_YET_EXPIRED: felt252 = 'NOT_YET_EXPIRED';
        pub const NOT_REFUNDABLE: felt252 = 'NOT_REFUNDABLE';
        pub const EXPIRY_IN_PAST: felt252 = 'EXPIRY_IN_PAST';
        pub const LOCK_AFTER_EXPIRY: felt252 = 'LOCK_AFTER_EXPIRY';
        pub const ZERO_REFUND_KEY: felt252 = 'ZERO_REFUND_KEY';
        pub const BAD_SIGNATURE: felt252 = 'BAD_SIGNATURE';
        pub const TRANSFER_FAILED: felt252 = 'TRANSFER_FAILED';
    }

    #[storage]
    struct Storage {
        /// The privacy pool, pinned at deployment. Only this address may drive
        /// `privacy_invoke`.
        pool: ContractAddress,
        /// claim public key -> envelope.
        envelopes: Map<felt252, EnvelopeData>,
        /// token -> value owed to unclaimed envelopes.
        reserved: Map<ContractAddress, u128>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        EnvelopeFunded: EnvelopeFunded,
        EnvelopeClaimed: EnvelopeClaimed,
        EnvelopeRefunded: EnvelopeRefunded,
    }

    /// Emitted when value is parked. Together with `EnvelopeClaimed` this is the
    /// receipt: it proves an envelope of a given size in a given token existed
    /// and was collected, without naming the funder, whose identity the pool
    /// hides, and without touching any of their other activity.
    #[derive(Drop, starknet::Event)]
    pub struct EnvelopeFunded {
        #[key]
        pub envelope_id: felt252,
        #[key]
        pub token: ContractAddress,
        pub amount: u128,
        pub unlock_at: u64,
        pub expiry: u64,
        pub memo: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct EnvelopeClaimed {
        #[key]
        pub envelope_id: felt252,
        #[key]
        pub token: ContractAddress,
        pub amount: u128,
        /// `MODE_NOTE` for a release into the pool, `MODE_ADDRESS` for a public
        /// transfer.
        pub mode: felt252,
        /// The open-note id or the recipient address, matching `mode`.
        pub target: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct EnvelopeRefunded {
        #[key]
        pub envelope_id: felt252,
        #[key]
        pub token: ContractAddress,
        pub amount: u128,
        pub note_id: felt252,
    }

    #[constructor]
    fn constructor(ref self: ContractState, pool: ContractAddress) {
        assert(pool.is_non_zero(), errors::ZERO_POOL);
        self.pool.write(pool);
    }

    #[abi(embed_v0)]
    pub impl EnvelopeImpl of IEnvelope<ContractState> {
        fn privacy_invoke(
            ref self: ContractState,
            op: EnvelopeOp,
            claim_pubkey: felt252,
            token: ContractAddress,
            amount: u128,
            refund_pubkey: felt252,
            unlock_at: u64,
            expiry: u64,
            memo: felt252,
            sig_r: felt252,
            sig_s: felt252,
            note_id: felt252,
        ) -> Span<OpenNoteDeposit> {
            let pool = self.pool.read();
            assert(get_caller_address() == pool, errors::CALLER_NOT_POOL);

            match op {
                EnvelopeOp::Fund => {
                    self
                        .fund(
                            claim_pubkey, token, amount, refund_pubkey, unlock_at, expiry, memo,
                        );
                    // Nothing to credit: the value stays parked until a claim.
                    [].span()
                },
                EnvelopeOp::Claim => self.release_to_note(pool, claim_pubkey, note_id, sig_r, sig_s),
                EnvelopeOp::Refund => self.refund_to_note(pool, claim_pubkey, note_id, sig_r, sig_s),
            }
        }

        fn claim_to_address(
            ref self: ContractState,
            claim_pubkey: felt252,
            recipient: ContractAddress,
            sig_r: felt252,
            sig_s: felt252,
        ) {
            assert(recipient.is_non_zero(), errors::ZERO_RECIPIENT);

            let env = self.load_claimable(claim_pubkey);
            self
                .check_signature(
                    claim_pubkey, MODE_ADDRESS, recipient.into(), claim_pubkey, sig_r, sig_s,
                );

            // Effects before interactions: the envelope is spent before any
            // token contract regains control.
            self.settle(claim_pubkey, env, status::CLAIMED);

            let ok = IErc20Dispatcher { contract_address: env.token }
                .transfer(recipient, env.amount.into());
            assert(ok, errors::TRANSFER_FAILED);

            self
                .emit(
                    EnvelopeClaimed {
                        envelope_id: claim_pubkey,
                        token: env.token,
                        amount: env.amount,
                        mode: MODE_ADDRESS,
                        target: recipient.into(),
                    },
                );
        }

        fn get_envelope(self: @ContractState, claim_pubkey: felt252) -> EnvelopeData {
            self.envelopes.read(claim_pubkey)
        }

        fn reserved_of(self: @ContractState, token: ContractAddress) -> u128 {
            self.reserved.read(token)
        }

        fn pool(self: @ContractState) -> ContractAddress {
            self.pool.read()
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Park value the pool has already moved here.
        ///
        /// The pool's `Withdraw` phase runs before `InvokeExternal`, so by the
        /// time this executes the tokens have landed. `amount` is nonetheless
        /// funder-supplied, and a funder who overstated it would be writing a
        /// claim against value belonging to somebody else's envelope. The
        /// solvency check below is what stops that: this contract's balance must
        /// cover everything already reserved *plus* the new envelope.
        fn fund(
            ref self: ContractState,
            claim_pubkey: felt252,
            token: ContractAddress,
            amount: u128,
            refund_pubkey: felt252,
            unlock_at: u64,
            expiry: u64,
            memo: felt252,
        ) {
            assert(claim_pubkey.is_non_zero(), errors::ZERO_CLAIM_KEY);
            assert(token.is_non_zero(), errors::ZERO_TOKEN);
            assert(amount.is_non_zero(), errors::ZERO_AMOUNT);
            assert(
                self.envelopes.read(claim_pubkey).status == status::NONE, errors::ENVELOPE_EXISTS,
            );

            if expiry != 0 {
                let now = get_block_timestamp();
                assert(expiry > now, errors::EXPIRY_IN_PAST);
                assert(unlock_at < expiry, errors::LOCK_AFTER_EXPIRY);
                // Without a refund key an expired envelope would strand its
                // value here permanently.
                assert(refund_pubkey.is_non_zero(), errors::ZERO_REFUND_KEY);
            }

            let held: u256 = IErc20Dispatcher { contract_address: token }
                .balance_of(get_contract_address());
            let held: u128 = held.try_into().expect(errors::AMOUNT_OVERFLOW);
            let reserved = self.reserved.read(token);
            let needed = reserved + amount;
            assert(held >= needed, errors::UNDERFUNDED);

            self.reserved.write(token, needed);
            self
                .envelopes
                .write(
                    claim_pubkey,
                    EnvelopeData {
                        token,
                        amount,
                        refund_pubkey,
                        unlock_at,
                        expiry,
                        memo,
                        status: status::FUNDED,
                    },
                );

            self
                .emit(
                    EnvelopeFunded {
                        envelope_id: claim_pubkey, token, amount, unlock_at, expiry, memo,
                    },
                );
        }

        /// Release into an open note. The pool pulls the approved amount once
        /// this returns, and credits the note whose id it substituted into the
        /// calldata.
        fn release_to_note(
            ref self: ContractState,
            pool: ContractAddress,
            claim_pubkey: felt252,
            note_id: felt252,
            sig_r: felt252,
            sig_s: felt252,
        ) -> Span<OpenNoteDeposit> {
            let env = self.load_claimable(claim_pubkey);
            self.check_signature(claim_pubkey, MODE_NOTE, note_id, claim_pubkey, sig_r, sig_s);

            self.settle(claim_pubkey, env, status::CLAIMED);
            IErc20Dispatcher { contract_address: env.token }.approve(pool, env.amount.into());

            self
                .emit(
                    EnvelopeClaimed {
                        envelope_id: claim_pubkey,
                        token: env.token,
                        amount: env.amount,
                        mode: MODE_NOTE,
                        target: note_id,
                    },
                );

            [OpenNoteDeposit { note_id, token: env.token, amount: env.amount }].span()
        }

        /// Return an expired envelope to its funder, as an open note inside the
        /// pool. The funder is the only party holding the refund key, and the
        /// pool hides which shielded identity the resulting note belongs to.
        fn refund_to_note(
            ref self: ContractState,
            pool: ContractAddress,
            claim_pubkey: felt252,
            note_id: felt252,
            sig_r: felt252,
            sig_s: felt252,
        ) -> Span<OpenNoteDeposit> {
            let env = self.envelopes.read(claim_pubkey);
            assert(env.status == status::FUNDED, errors::ENVELOPE_NOT_FUNDED);
            assert(env.expiry != 0, errors::NOT_REFUNDABLE);
            assert(get_block_timestamp() >= env.expiry, errors::NOT_YET_EXPIRED);

            self
                .check_signature(
                    env.refund_pubkey, MODE_REFUND, note_id, claim_pubkey, sig_r, sig_s,
                );

            self.settle(claim_pubkey, env, status::REFUNDED);
            IErc20Dispatcher { contract_address: env.token }.approve(pool, env.amount.into());

            self
                .emit(
                    EnvelopeRefunded {
                        envelope_id: claim_pubkey,
                        token: env.token,
                        amount: env.amount,
                        note_id,
                    },
                );

            [OpenNoteDeposit { note_id, token: env.token, amount: env.amount }].span()
        }

        /// Load an envelope and assert it is inside its claim window.
        fn load_claimable(self: @ContractState, claim_pubkey: felt252) -> EnvelopeData {
            let env = self.envelopes.read(claim_pubkey);
            assert(env.status == status::FUNDED, errors::ENVELOPE_NOT_FUNDED);

            let now = get_block_timestamp();
            assert(now >= env.unlock_at, errors::STILL_LOCKED);
            // An expiring envelope hands over to the refund window exactly at
            // `expiry`, so claim and refund can never both be live.
            if env.expiry != 0 {
                assert(now < env.expiry, errors::EXPIRED);
            }
            env
        }

        /// Verify a release authorisation against `signer_pubkey`.
        fn check_signature(
            self: @ContractState,
            signer_pubkey: felt252,
            mode: felt252,
            target: felt252,
            claim_pubkey: felt252,
            sig_r: felt252,
            sig_s: felt252,
        ) {
            let message = release_message_hash(
                get_contract_address(), mode, claim_pubkey, target,
            );
            assert(
                core::ecdsa::check_ecdsa_signature(message, signer_pubkey, sig_r, sig_s),
                errors::BAD_SIGNATURE,
            );
        }

        /// Mark an envelope terminal and drop its reservation. Called before any
        /// token transfer so a re-entrant token cannot spend it twice.
        fn settle(
            ref self: ContractState,
            claim_pubkey: felt252,
            env: EnvelopeData,
            new_status: u8,
        ) {
            self.reserved.write(env.token, self.reserved.read(env.token) - env.amount);
            self.envelopes.write(claim_pubkey, EnvelopeData { status: new_status, ..env });
        }
    }
}
