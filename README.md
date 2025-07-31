# 🔄 Raydium AMM Swap Proxy (Solana Anchor)

This Anchor-based Solana program allows users to perform token swaps via **Raydium AMM V4**.  
It serves as a proxy that forwards swap instructions to the actual Raydium program, while validating input accounts, including the expected `amm_authority` PDA.

---

## 📌 Program Info

- **Network:** Devnet
- **Program ID:** [`EYhqyD1Sm6UBxj7yKa9YCcSnQD5a41NmVZXLUCLDKXRt`](https://solscan.io/account/EYhqyD1Sm6UBxj7yKa9YCcSnQD5a41NmVZXLUCLDKXRt?cluster=devnet)

---

## 📦 Features

- Wraps the `amm_swap_base_input` instruction from Raydium AMM v4.
- Dynamically fetches Raydium pool data (via [Raydium API](https://api-v3-devnet.raydium.io/)).
- Automatically wraps SOL to wSOL.
- Performs a real swap from wSOL → SOME TOKEN and verifies the result.

---

## 🧪 Testing

### Run tests

```bash
anchor test --skip-deploy --skip-build
