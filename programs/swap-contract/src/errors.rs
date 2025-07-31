use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid min amount specified")]
    InvalidMinAmount,
    #[msg("Invalid amount specified")]
    InvalidAmount,
    #[msg("Invalid quote mint")]
    InvalidQuoteMint,
    #[msg("Invalid token mint")]
    InvalidTokenMint,
    #[msg("Invalid pool configuration")]
    InvalidPool,
}
