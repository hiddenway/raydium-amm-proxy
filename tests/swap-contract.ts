// Integration test for the swap-contract using Raydium AMM V4
// This test simulates a SOL -> USDC swap on devnet

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SwapContract } from "../target/types/swap_contract";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  createCloseAccountInstruction,
} from "@solana/spl-token";
import { expect } from "chai";
import { Raydium } from "@raydium-io/raydium-sdk-v2";
import { config } from "./config";
import { wrapSolToWSol } from "./utils";

describe("swap-contract", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SwapContract as Program<SwapContract>;
  const wallet = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  // Test constants
  const airdropAmount = config.AIRDROP.AMOUNT * anchor.web3.LAMPORTS_PER_SOL;
  const amountIn = new anchor.BN(
    config.SWAP.AMOUNT_IN * anchor.web3.LAMPORTS_PER_SOL
  );
  const minimumAmountOut = new anchor.BN(
    config.SWAP.MINIMUM_AMOUNT_OUT * anchor.web3.LAMPORTS_PER_SOL
  );

  const quoteMint = new PublicKey(config.SWAP.QUOTE_MINT);
  const tokenMint = new PublicKey(config.SWAP.TOKEN_MINT);

  it("Swaps SOL for SOME TOKEN using the AMM V4 proxy", async () => {
    // Step 1: Fund wallet and wrap SOL if enabled
    if (config.AIRDROP.IS_ACTIVE) {
      await airdrop(wallet.publicKey, airdropAmount);
      await wrapSolToWSol(
        connection,
        wallet.publicKey,
        wallet.payer,
        airdropAmount / 2
      );
    }

    // Step 2: Create token accounts
    const userSourceTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      NATIVE_MINT,
      wallet.publicKey
    );

    const userDestinationTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      tokenMint,
      wallet.publicKey
    );

    const balanceBefore = (
      await connection.getTokenAccountBalance(
        userDestinationTokenAccount.address
      )
    ).value.uiAmount;
    console.log(`USDC balance before swap: ${balanceBefore}`);

    // Step 3: Fetch pool info
    const raydium = await Raydium.load({
      connection,
      cluster: "devnet",
      disableFeatureCheck: true,
      disableLoadToken: true,
      blockhashCommitment: "confirmed",
    });

    const poolInfo = await fetchPoolInfo(
      raydium,
      "standard",
      quoteMint,
      tokenMint
    );

    const [ammAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("amm authority")],
      new PublicKey(config.RAYDIUM_PROGRAM_ID)
    );

    // Step 4: Prepare accounts and call swap
    const accounts = {
      userSourceOwner: wallet.payer.publicKey,
      amm: poolInfo.id,
      ammAuthority,
      ammOpenOrders: poolInfo.openOrders,
      ammCoinVault: poolInfo.baseVault,
      ammPcVault: poolInfo.quoteVault,
      marketProgram: poolInfo.marketProgramId,
      market: poolInfo.marketId,
      marketBids: poolInfo.marketBids,
      marketAsks: poolInfo.marketAsks,
      marketEventQueue: poolInfo.marketEventQueue,
      marketCoinVault: poolInfo.marketBaseVault,
      marketPcVault: poolInfo.marketQuoteVault,
      marketVaultSigner: poolInfo.marketAuthority,
      userTokenSource: userSourceTokenAccount.address,
      userTokenDestination: userDestinationTokenAccount.address,
      raydiumProgram: config.RAYDIUM_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
    };

    if (
      wallet.payer.publicKey.toString() !== accounts.userSourceOwner.toString()
    ) {
      throw new Error("Wallet payer public key does not match userSourceOwner!");
    }

    try {
      const txSignature = await program.methods
        .ammSwapBaseInput(amountIn, minimumAmountOut)
        .accounts(accounts)
        .signers([wallet.payer])
        .rpc();

      console.log("Transaction signature:", txSignature);
    } catch (error) {
      console.error("Swap transaction failed:", error);
      throw error;
    }

    // Step 5: Check balance after swap
    const balanceAfter = (
      await connection.getTokenAccountBalance(
        userDestinationTokenAccount.address
      )
    ).value.uiAmount;
    console.log(`USDC balance after swap: ${balanceAfter}`);

    expect(balanceAfter).to.be.gt(
      balanceBefore,
      "The USDC balance should have increased after the swap."
    );

    // Step 6: Close temporary WSOL account
    const closeWSOLAccountTx = new anchor.web3.Transaction().add(
      createCloseAccountInstruction(
        userSourceTokenAccount.address,
        wallet.publicKey,
        wallet.publicKey
      )
    );
    await provider.sendAndConfirm(closeWSOLAccountTx);
    console.log("Temporary wSOL account closed.");
  });
});

// Airdrop helper
async function airdrop(to: PublicKey, amount: number) {
  const provider = anchor.getProvider();
  const balance = await provider.connection.getBalance(to);
  if (balance < amount) {
    try {
      const sig = await provider.connection.requestAirdrop(to, amount);
      const latest = await provider.connection.getLatestBlockhash();
      await provider.connection.confirmTransaction({
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
        signature: sig,
      });
      console.log(`Airdropped ${amount / anchor.web3.LAMPORTS_PER_SOL} SOL to ${to.toBase58()}`);
    } catch (e) {
      console.warn("Airdrop failed, continuing with existing balance.", e);
    }
  }
}

// Fetches full pool information from Raydium Devnet API
export async function fetchPoolInfo(
  raydium: Raydium,
  poolType: "standard" | "stable",
  mint1: PublicKey,
  mint2: PublicKey
): Promise<any> {
  const endpoint = `https://api-v3-devnet.raydium.io/pools/info/mint?mint1=${mint1}&mint2=${mint2}&poolType=${poolType}&poolSortField=default&sortType=desc&pageSize=100&page=1`;

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Failed to fetch pool info: ${response.statusText}`);
  }

  const json: any = await response.json();
  const poolPreData = json?.data?.data?.[0];

  if (!poolPreData) {
    throw new Error(`Pool not found for mints ${mint1} and ${mint2}`);
  }

  const pool_id = poolPreData.id;
  const pool: any = await raydium.liquidity.getPoolInfoFromRpc({ poolId: pool_id });
  const poolInfo = pool.poolInfo;
  const poolKeys = pool.poolKeys;

  return {
    id: new PublicKey(poolInfo.id),
    baseMint: new PublicKey(poolInfo.mintA.address),
    quoteMint: new PublicKey(poolInfo.mintB.address),
    lpMint: new PublicKey(poolInfo.lpMint.address),
    baseDecimals: poolInfo.mintA.decimals,
    quoteDecimals: poolInfo.mintB.decimals,
    lpDecimals: poolInfo.lpMint.decimals,
    version: poolInfo.version,
    programId: new PublicKey(poolInfo.programId),
    authority: new PublicKey(poolKeys.authority),
    openOrders: new PublicKey(poolKeys.openOrders),
    targetOrders: new PublicKey(poolKeys.targetOrders),
    baseVault: new PublicKey(poolKeys.vault.A),
    quoteVault: new PublicKey(poolKeys.vault.B),
    withdrawQueue: new PublicKey(poolInfo.withdrawQueue || "11111111111111111111111111111111"),
    lpVault: new PublicKey(poolInfo.lpVault || "11111111111111111111111111111111"),
    marketVersion: poolInfo.marketVersion || 3,
    marketProgramId: new PublicKey(poolKeys.marketProgramId),
    marketId: new PublicKey(poolKeys.marketId),
    marketAuthority: new PublicKey(poolKeys.marketAuthority),
    marketBaseVault: new PublicKey(poolKeys.marketBaseVault),
    marketQuoteVault: new PublicKey(poolKeys.marketQuoteVault),
    marketBids: new PublicKey(poolKeys.marketBids),
    marketAsks: new PublicKey(poolKeys.marketAsks),
    marketEventQueue: new PublicKey(poolKeys.marketEventQueue),
  };
}
