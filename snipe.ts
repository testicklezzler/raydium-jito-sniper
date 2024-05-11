import { LiquidityPoolKeysV4, MARKET_STATE_LAYOUT_V3, Market, TOKEN_PROGRAM_ID, MAINNET_PROGRAM_ID } from "@raydium-io/raydium-sdk";
import { Connection, Logs, ParsedInnerInstruction, ParsedInstruction, TransactionInstruction, TransactionMessage, VersionedTransaction, SystemProgram, ParsedTransactionWithMeta, PartiallyDecodedInstruction, PublicKey } from "@solana/web3.js";
import { RayLiqPoolv4, connection, wallet, tokenAddress, snipeAmt, tipAcct, tipAmt } from "./settings";
import { request } from "https";
import { getPrice } from "./src/wip"
import * as spl from '@solana/spl-token';
import { searcherClient } from "./src/jito";
import { Bundle as JitoBundle } from 'jito-ts/dist/sdk/block-engine/types.js';
import { derivePoolKeys } from './src/poolKeysReassigned';

import { IPoolKeys } from './src/interfaces';
import base58 from "bs58";

const seenTransactions : Array<string> = []; // The log listener is sometimes triggered multiple times for a single transaction, don't react to tranasctions we've already seen

subscribeToNewRaydiumPools();

function subscribeToNewRaydiumPools() : void
{
    getPrice();
    connection.onLogs(new PublicKey(RayLiqPoolv4), async (txLogs: Logs) => {
        try {
            if (seenTransactions.includes(txLogs.signature)) {
                return;
            }
            seenTransactions.push(txLogs.signature);
            if (!findLogEntry('init_pc_amount', txLogs.logs)) {
                return; // If "init_pc_amount" is not in log entries then it's not LP initialization transaction
            }
            const poolKeys = await fetchPoolKeysForLPInitTransactionHash(txLogs.signature); // With poolKeys you can do a swap
            //console.log(poolKeys);

            if (tokenAddress === String('')) {
                // Check the quote if sniping all pools
                if (!poolKeys.quoteMint.equals(spl.NATIVE_MINT)) {
                    console.log('Invalid quote mint, skipping.');
                    return;
                }
            } else {
                // Check if it's not the desired pool
                if (!poolKeys.baseMint.equals(new PublicKey(tokenAddress))) {
                    console.log('Not the desired pool to snipe, moving on.');
                    return;
                }
            }
            
            // At this point, the detected pool meets your criteria
            console.log('\nTarget pool found!');

            const keys = await derivePoolKeys(poolKeys.marketId);
            if (!keys) {
                console.log('Market information could not be retrieved, continuing to listen...');
                return;
            }
            console.log('Token address:', keys.baseMint.toString());

            await snipe(keys);
        } catch (err) {
            console.log('Snipe failed:', err)
        }
    });
    console.log('Listening to new pools...');
}

function findLogEntry(needle: string, logEntries: Array<string>) : string|null
{
    for (let i = 0; i < logEntries.length; ++i) {
        if (logEntries[i].includes(needle)) {
            return logEntries[i];
        }
    }

    return null;
}

async function fetchPoolKeysForLPInitTransactionHash(txSignature: string) : Promise<LiquidityPoolKeysV4>
{
    const tx = await connection.getParsedTransaction(txSignature, {maxSupportedTransactionVersion: 0});
    if (!tx) {
        throw new Error('Failed to fetch transaction with signature ' + txSignature);
    }
    const poolInfo = parsePoolInfoFromLpTransaction(tx);
    const marketInfo = await fetchMarketInfo(poolInfo.marketId);

    return {
        id: poolInfo.id,
        baseMint: poolInfo.baseMint,
        quoteMint: poolInfo.quoteMint,
        lpMint: poolInfo.lpMint,
        baseDecimals: poolInfo.baseDecimals,
        quoteDecimals: poolInfo.quoteDecimals,
        lpDecimals: poolInfo.lpDecimals,
        version: 4,
        programId: poolInfo.programId,
        authority: poolInfo.authority,
        openOrders: poolInfo.openOrders,
        targetOrders: poolInfo.targetOrders,
        baseVault: poolInfo.baseVault,
        quoteVault: poolInfo.quoteVault,
        withdrawQueue: poolInfo.withdrawQueue,
        lpVault: poolInfo.lpVault,
        marketVersion: 3,
        marketProgramId: poolInfo.marketProgramId,
        marketId: poolInfo.marketId,
        marketAuthority: Market.getAssociatedAuthority({programId: poolInfo.marketProgramId, marketId: poolInfo.marketId}).publicKey,
        marketBaseVault: marketInfo.baseVault,
        marketQuoteVault: marketInfo.quoteVault,
        marketBids: marketInfo.bids,
        marketAsks: marketInfo.asks,
        marketEventQueue: marketInfo.eventQueue,
    } as LiquidityPoolKeysV4;
}

async function fetchMarketInfo(marketId: PublicKey) {
    const marketAccountInfo = await connection.getAccountInfo(marketId);
    if (!marketAccountInfo) {
        throw new Error('Failed to fetch market info for market id ' + marketId.toBase58());
    }
    
    return MARKET_STATE_LAYOUT_V3.decode(marketAccountInfo.data);
}


function parsePoolInfoFromLpTransaction(txData: ParsedTransactionWithMeta) 
{
    const initInstruction = findInstructionByProgramId(txData.transaction.message.instructions, new PublicKey(RayLiqPoolv4)) as PartiallyDecodedInstruction|null;
    if (!initInstruction) {
        throw new Error('Failed to find lp init instruction in lp init tx');
    }
    const baseMint = initInstruction.accounts[8];
    const baseVault = initInstruction.accounts[10]; 
    const quoteMint = initInstruction.accounts[9];
    const quoteVault = initInstruction.accounts[11];
    const lpMint = initInstruction.accounts[7];
    const baseAndQuoteSwapped = baseMint.toBase58() === String(spl.NATIVE_MINT);
    const lpMintInitInstruction = findInitializeMintInInnerInstructionsByMintAddress(txData.meta?.innerInstructions ?? [], lpMint);
    if (!lpMintInitInstruction) {
        throw new Error('Failed to find lp mint init instruction in lp init tx');
    }
    const lpMintInstruction = findMintToInInnerInstructionsByMintAddress(txData.meta?.innerInstructions ?? [], lpMint);
    if (!lpMintInstruction) {
        throw new Error('Failed to find lp mint to instruction in lp init tx');
    }
    const baseTransferInstruction = findTransferInstructionInInnerInstructionsByDestination(txData.meta?.innerInstructions ?? [], baseVault, TOKEN_PROGRAM_ID);
    if (!baseTransferInstruction) {
        throw new Error('Failed to find base transfer instruction in lp init tx');
    }
    const quoteTransferInstruction = findTransferInstructionInInnerInstructionsByDestination(txData.meta?.innerInstructions ?? [], quoteVault, TOKEN_PROGRAM_ID);
    if (!quoteTransferInstruction) {
        throw new Error('Failed to find quote transfer instruction in lp init tx');
    }
    const lpDecimals = lpMintInitInstruction.parsed.info.decimals;
    const lpInitializationLogEntryInfo = extractLPInitializationLogEntryInfoFromLogEntry(findLogEntry('init_pc_amount', txData.meta?.logMessages ?? []) ?? '');
    const basePreBalance = (txData.meta?.preTokenBalances ?? []).find(balance => balance.mint === baseMint.toBase58());
    if (!basePreBalance) {
        throw new Error('Failed to find base tokens preTokenBalance entry to parse the base tokens decimals');
    }
    const baseDecimals = basePreBalance.uiTokenAmount.decimals;

    return {
        id: initInstruction.accounts[4],
        baseMint,
        quoteMint,
        lpMint,
        baseDecimals: baseAndQuoteSwapped ? 9 : baseDecimals,
        quoteDecimals: baseAndQuoteSwapped ? baseDecimals : 9,
        lpDecimals,
        version: 4,
        programId: new PublicKey(RayLiqPoolv4),
        authority: initInstruction.accounts[5],
        openOrders: initInstruction.accounts[6],
        targetOrders: initInstruction.accounts[13],
        baseVault,
        quoteVault,
        withdrawQueue: new PublicKey("11111111111111111111111111111111"),
        lpVault: new PublicKey(lpMintInstruction.parsed.info.account),
        marketVersion: 3,
        marketProgramId: initInstruction.accounts[15],
        marketId: initInstruction.accounts[16],
        baseReserve: parseInt(baseTransferInstruction.parsed.info.amount),
        quoteReserve: parseInt(quoteTransferInstruction.parsed.info.amount),
        lpReserve: parseInt(lpMintInstruction.parsed.info.amount),
        openTime: lpInitializationLogEntryInfo.open_time,
    }
}

function findTransferInstructionInInnerInstructionsByDestination(innerInstructions: Array<ParsedInnerInstruction>, destinationAccount : PublicKey, programId?: PublicKey) : ParsedInstruction|null
{
    for (let i = 0; i < innerInstructions.length; i++) {
        for (let y = 0; y < innerInstructions[i].instructions.length; y++) {
            const instruction = innerInstructions[i].instructions[y] as ParsedInstruction;
            if (!instruction.parsed) {continue};
            if (instruction.parsed.type === 'transfer' && instruction.parsed.info.destination === destinationAccount.toBase58() && (!programId || instruction.programId.equals(programId))) {
                return instruction;
            }
        }
    }

    return null;
}

function findInitializeMintInInnerInstructionsByMintAddress(innerInstructions: Array<ParsedInnerInstruction>, mintAddress: PublicKey) : ParsedInstruction|null
{
    for (let i = 0; i < innerInstructions.length; i++) {
        for (let y = 0; y < innerInstructions[i].instructions.length; y++) {
            const instruction = innerInstructions[i].instructions[y] as ParsedInstruction;
            if (!instruction.parsed) {continue};
            if (instruction.parsed.type === 'initializeMint' && instruction.parsed.info.mint === mintAddress.toBase58()) {
                return instruction;
            }
        }
    }

    return null;
}

function findMintToInInnerInstructionsByMintAddress(innerInstructions: Array<ParsedInnerInstruction>, mintAddress: PublicKey) : ParsedInstruction|null
{
    for (let i = 0; i < innerInstructions.length; i++) {
        for (let y = 0; y < innerInstructions[i].instructions.length; y++) {
            const instruction = innerInstructions[i].instructions[y] as ParsedInstruction;
            if (!instruction.parsed) {continue};
            if (instruction.parsed.type === 'mintTo' && instruction.parsed.info.mint === mintAddress.toBase58()) {
                return instruction;
            }
        }
    }

    return null;
}

function findInstructionByProgramId(instructions: Array<ParsedInstruction|PartiallyDecodedInstruction>, programId: PublicKey) : ParsedInstruction|PartiallyDecodedInstruction|null
{
    for (let i = 0; i < instructions.length; i++) {
        if (instructions[i].programId.equals(programId)) {
            return instructions[i];
        }
    }

    return null;
}

function extractLPInitializationLogEntryInfoFromLogEntry(lpLogEntry: string) : {nonce: number, open_time: number, init_pc_amount: number, init_coin_amount: number} {
    const lpInitializationLogEntryInfoStart = lpLogEntry.indexOf('{');

    return JSON.parse(fixRelaxedJsonInLpLogEntry(lpLogEntry.substring(lpInitializationLogEntryInfoStart)));
}

function fixRelaxedJsonInLpLogEntry(relaxedJson: string) : string
{
    return relaxedJson.replace(/([{,])\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, "$1\"$2\":");
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

    //console.log("Txn size:", serializedMsg.length);
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

        /*
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
        */
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
