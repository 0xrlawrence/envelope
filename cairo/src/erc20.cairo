use starknet::ContractAddress;

/// The slice of ERC-20 this contract needs.
///
/// Declared locally rather than pulled from OpenZeppelin: an anonymizer is a
/// contract the pool calls with real value in flight, and a helper with one
/// dependency is a helper an auditor can read end to end.
#[starknet::interface]
pub trait IErc20<TState> {
    fn balance_of(self: @TState, account: ContractAddress) -> u256;
    fn approve(ref self: TState, spender: ContractAddress, amount: u256) -> bool;
    fn transfer(ref self: TState, recipient: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TState, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
}
