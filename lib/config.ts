import * as dotenv from 'dotenv';
import Web3 from 'web3';
import { Network } from './types';
import { RPC_URL } from './rpcURLs';

dotenv.config({ path: __dirname + '/../.env' });

export const deadline = 300;
export const loanFee = 0.0005;
export const swapFee = 3000;
export const fixed = 4;
export const network: Network = 'mainnet';
export const web3 = new Web3(RPC_URL[network].url);
export const account = web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY!);