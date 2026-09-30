use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    IdempotentBatchAlreadyApplied = 1,
    EmptyBatch = 2,
    InvalidBetAmount = 3,
}
