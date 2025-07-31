use anchor_lang::prelude::*;

#[event]
pub struct SwapEvent {
    pub user: Pubkey,
    pub amount_in: u64,
    pub minimum_amount_out: u64,
    pub token_source: Pubkey,
    pub token_destination: Pubkey,
}
