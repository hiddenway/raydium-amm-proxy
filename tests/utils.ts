import { liquidityStateV4Layout } from "@raydium-io/raydium-sdk-v2";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  Connection,
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
} from "@solana/spl-token";


/**
 * Создаёт ATA для WSOL, пополняет его и вызывает SyncNative
 * @param connection Web3-соединение
 * @param owner Владение WSOL (обычно тот же, что и payer)
 * @param payer Keypair, который платит и владеет SOL
 * @param amountLamports Сколько SOL (в лампортах) обернуть
 * @returns PublicKey ATA-аккаунта WSOL
 */
export async function wrapSolToWSol(
  connection: Connection,
  owner: PublicKey,
  payer: Keypair,
  amountLamports: number
): Promise<PublicKey> {
  const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, owner, false);

  const instructions = [];

  // 1. Создаём ATA, если его ещё нет
  const ataInfo = await connection.getAccountInfo(wsolAta);
  if (!ataInfo) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        wsolAta,
        owner,
        NATIVE_MINT
      )
    );
  }

  // 2. Переводим нативные SOL в ATA
  instructions.push(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: wsolAta,
      lamports: amountLamports,
    })
  );

  // 3. SyncNative для обновления баланса WSOL
  instructions.push(createSyncNativeInstruction(wsolAta));

  const tx = new Transaction().add(...instructions);
  await sendAndConfirmTransaction(connection, tx, [payer]);

  return wsolAta;
}
