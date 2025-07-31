pub mod errors;
pub mod states;

use crate::states::config::AmmConfig;
use crate::states::events::SwapEvent;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::pubkey::Pubkey;
use anchor_lang::system_program;
use anchor_spl::token::{Mint, Token, TokenAccount};
use errors::ErrorCode;
use solana_program::program::invoke;
use spl_token::ID as TOKEN_PROGRAM_ID;

// This is the ID of your proxy program.
declare_id!("EYhqyD1Sm6UBxj7yKa9YCcSnQD5a41NmVZXLUCLDKXRt");

#[program]
pub mod swap_contract {
    use super::*;

    pub fn amm_swap_base_input(
        ctx: Context<AMMSwap>,
        amount_in: u64,
        minimum_amount_out: u64,
    ) -> Result<()> {
        let mut instruction_data: Vec<u8> = vec![9];
        instruction_data.extend_from_slice(&amount_in.to_le_bytes());
        instruction_data.extend_from_slice(&minimum_amount_out.to_le_bytes());

        let instruction = Instruction {
            program_id: ctx.accounts.raydium_program.key(),
            accounts: vec![
                // SPL
                AccountMeta::new_readonly(spl_token::id(), false),
                // AMM
                AccountMeta::new(ctx.accounts.amm.key(), false),
                AccountMeta::new_readonly(ctx.accounts.amm_authority.key(), false),
                AccountMeta::new(ctx.accounts.amm_open_orders.key(), false),
                //
                AccountMeta::new(ctx.accounts.amm_coin_vault.key(), false),
                AccountMeta::new(ctx.accounts.amm_pc_vault.key(), false),
                // market
                AccountMeta::new_readonly(ctx.accounts.market_program.key(), false),
                AccountMeta::new(ctx.accounts.market.key(), false),
                AccountMeta::new(ctx.accounts.market_bids.key(), false),
                AccountMeta::new(ctx.accounts.market_asks.key(), false),
                AccountMeta::new(ctx.accounts.market_event_queue.key(), false),
                AccountMeta::new(ctx.accounts.market_coin_vault.key(), false),
                AccountMeta::new(ctx.accounts.market_pc_vault.key(), false),
                AccountMeta::new_readonly(ctx.accounts.market_vault_signer.key(), false),
                // user
                AccountMeta::new(ctx.accounts.user_token_source.key(), false),
                AccountMeta::new(ctx.accounts.user_token_destination.key(), false),
                AccountMeta::new_readonly(ctx.accounts.user_source_owner.key(), true),
            ],
            data: instruction_data,
        };

        //let signer_seeds: &[&[u8]] = &[b"amm authority", &[ctx.bumps.amm_authority]];

        solana_program::program::invoke(&instruction, &ctx.accounts.to_account_infos())?;

        emit!(SwapEvent {
            user: ctx.accounts.user_source_owner.key(),
            amount_in,
            minimum_amount_out,
            token_source: ctx.accounts.user_token_source.key(),
            token_destination: ctx.accounts.user_token_destination.key(),
        });

        Ok(())
    }
}

#[derive(Accounts, Clone)]
pub struct AMMSwap<'info> {
    /// CHECK: Safe. user owner Account
    #[account(mut)]
    pub user_source_owner: Signer<'info>,
    /// CHECK: Safe. amm Account
    #[account(mut)]
    pub amm: UncheckedAccount<'info>,
    /// CHECK: Safe. Amm authority Account
    /// CHECK: will be manually checked in instruction
    pub amm_authority: UncheckedAccount<'info>,
    /// CHECK: Safe. amm open_orders Account
    #[account(mut)]
    pub amm_open_orders: UncheckedAccount<'info>,
    /// CHECK: Safe. amm_coin_vault Amm Account to swap FROM or To,
    #[account(mut)]
    pub amm_coin_vault: UncheckedAccount<'info>,
    /// CHECK: Safe. amm_pc_vault Amm Account to swap FROM or To,
    #[account(mut)]
    pub amm_pc_vault: UncheckedAccount<'info>,
    /// CHECK: Safe.OpenBook program id
    pub market_program: UncheckedAccount<'info>,
    /// CHECK: Safe. OpenBook market Account. OpenBook program is the owner.
    #[account(mut)]
    pub market: UncheckedAccount<'info>,
    /// CHECK: Safe. bids Account
    #[account(mut)]
    pub market_bids: UncheckedAccount<'info>,
    /// CHECK: Safe. asks Account
    #[account(mut)]
    pub market_asks: UncheckedAccount<'info>,
    /// CHECK: Safe. event_q Account
    #[account(mut)]
    pub market_event_queue: UncheckedAccount<'info>,
    /// CHECK: Safe. coin_vault Account
    #[account(mut)]
    pub market_coin_vault: UncheckedAccount<'info>,
    /// CHECK: Safe. pc_vault Account
    #[account(mut)]
    pub market_pc_vault: UncheckedAccount<'info>,
    /// CHECK: Safe. vault_signer Account
    #[account(mut)]
    pub market_vault_signer: UncheckedAccount<'info>,
    /// CHECK: Safe. user source token Account. user Account to swap from.
    #[account(mut)]
    pub user_token_source: UncheckedAccount<'info>,
    /// CHECK: Safe. user destination token Account. user Account to swap to.
    #[account(mut)]
    pub user_token_destination: UncheckedAccount<'info>,
    /// CHECK: Safe. The raydium_program
    pub raydium_program: UncheckedAccount<'info>,
    /// CHECK: Safe. The spl token program
    pub token_program: Program<'info, Token>,
}
