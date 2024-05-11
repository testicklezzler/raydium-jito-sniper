import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js"
import bs58 from 'bs58';



// base58 encoded secret key
export const wallet = Keypair.fromSecretKey(bs58.decode('4FiSQz7RGcaEbQogDumUdjxPz38fH1sRAJfRDajhzrwaazWH69BrwZuZnjnLUEdoCRpPscLhRumEN6K7fL3PJy3G'))

const rpc = 'https://api.mainnet-beta.solana.com'; // ENTER YOUR RPC

export const tokenAddress = ''; // ENTER YOUR DESIRED TOKEN ADDRESS TO SNIPE!!!!!!!!!!

const snipeAmount = 0.1; // SNIPE AMOUNT IN SOL

const tipAmount = 0.015; // JITO TIP IN SOL (the more you tip the faster)
                        // I recommend atleast 0.003



/* DONT TOUCH ANYTHING BELOW THIS */

export const connection = new Connection(rpc, 'confirmed') 

export const tipAcct = new PublicKey('Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY');

export const snipeAmt = snipeAmount * LAMPORTS_PER_SOL;

export const tipAmt = tipAmount * LAMPORTS_PER_SOL;

export const RayLiqPoolv4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8')