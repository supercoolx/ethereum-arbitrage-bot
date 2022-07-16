import BN from 'bignumber.js';
import { fixed, loanFee, web3 } from '../../lib/config';
import { Table } from 'console-table-printer';
import { Contract } from 'web3-eth-contract';
import { 
    dfRouter, 
    getMooniSwapContract, 
    lkRouter, 
    multicall, 
    shRouter, 
    suRouter, 
    un2Router, 
    un3Quoter, 
    un3Router 
} from '../../lib/contracts';
import { Multicall, Token } from '../../lib/types';
import { getPriceOnUniV2 } from '../../lib/uniswap/v2/getCalldata';
import { getPriceOnUniV3 } from '../../lib/uniswap/v3/getCalldata';
import { getPriceOnOracle, stripAnsiCodes, toPrintable } from '../../lib/utils';
import { getPriceOnMooni } from '../../lib/mooniswap/getCalldata';

export const DEX = [
    'UniSwapV3',
    'UniSwapV2',
    'SushiSwap',
    'ShibaSwap',
    'DefiSwap',
    'LinkSwap',
    'MooniSwap'
]
/**
 * Calculate dexes quote.
 * @param amountIn Input amount of token.
 * @param tokenIn Input token address.
 * @param tokenOut Output token address.
 * @returns Array of quotes.
 */
export const getAllQuotes = async (amountIn: BN, tokenIn: Token, tokenOut: Token): Promise<[BN[], Contract[]]> => {
    const calls = [];
    const mnRouter = await getMooniSwapContract(tokenIn, tokenOut);
    const un3 = getPriceOnUniV3(amountIn, tokenIn.address, tokenOut.address);
    const un2 = getPriceOnUniV2(amountIn, tokenIn.address, tokenOut.address, un2Router);
    const su = getPriceOnUniV2(amountIn, tokenIn.address, tokenOut.address, suRouter);
    const sh = getPriceOnUniV2(amountIn, tokenIn.address, tokenOut.address, shRouter);
    const df = getPriceOnUniV2(amountIn, tokenIn.address, tokenOut.address, dfRouter);
    const lk = getPriceOnUniV2(amountIn, tokenIn.address, tokenOut.address, lkRouter);
    const mn = getPriceOnMooni(amountIn, tokenIn.address, tokenOut.address, mnRouter);
 
    calls.push(
        [un3Quoter.options.address, un3],
        [un2Router.options.address, un2],
        [suRouter.options.address, su],
        [shRouter.options.address, sh],
        [dfRouter.options.address, df],
        [lkRouter.options.address, lk],
        [mnRouter.options.address, mn]
    );
    const result: Multicall = await multicall.methods.tryAggregate(false, calls).call();
    const uni3Quote = result[0].success && result[0].returnData != '0x' ? new BN(web3.eth.abi.decodeParameter('uint256', result[0].returnData) as any) : new BN(-Infinity);
    const uni2Quote = result[1].success && result[1].returnData != '0x' ? new BN(web3.eth.abi.decodeParameter('uint256[]', result[1].returnData)[1] as any) : new BN(-Infinity);
    const suQuote = result[2].success && result[2].returnData != '0x' ? new BN(web3.eth.abi.decodeParameter('uint256[]', result[2].returnData)[1] as any) : new BN(-Infinity);
    const shQuote = result[3].success && result[3].returnData != '0x' ? new BN(web3.eth.abi.decodeParameter('uint256[]', result[3].returnData)[1] as any) : new BN(-Infinity);
    const dfQuote = result[4].success && result[4].returnData != '0x' ? new BN(web3.eth.abi.decodeParameter('uint256[]', result[4].returnData)[1] as any) : new BN(-Infinity);
    const lkQuote = result[5].success && result[5].returnData != '0x' ? new BN(web3.eth.abi.decodeParameter('uint256[]', result[5].returnData)[1] as any) : new BN(-Infinity);
    const mnQuote = result[6].success && result[6].returnData != '0x' ? new BN(web3.eth.abi.decodeParameter('uint256', result[6].returnData) as any) : new BN(-Infinity);
    const quotes: BN[] = [uni3Quote, uni2Quote, suQuote, shQuote, dfQuote, lkQuote, mnQuote];
    const routers: Contract[] = [un3Router, un2Router, suRouter, shRouter, dfRouter, lkRouter, mnRouter];
    
    return [ quotes, routers ];
}
/**
 * Calculate and display the best profit path.
 * @param amountIn Start amount to trade.
 * @param tokenPath Array of tokens to trade.
 * @returns Return the best profit.
 */
export const calculateProfit = async (amountIn: BN, tokenPath: Token[]) => {
    const blockNumber = await web3.eth.getBlockNumber() + '';
    let tokenPathPrint = tokenPath.map(t => t.symbol).join(' -> ') + ' -> ' + tokenPath[0].symbol;
    let log = `Block: ${blockNumber}\t\t${tokenPathPrint}`;
    console.log(log);
    log += '\n';
    const table = new Table();
    const maxAmountOut: BN[] = [amountIn,];
    const amountOut: BN[][] = [];
    const [a, b] = new BN(loanFee).toFraction();
    const feeAmount = amountIn.times(a).idiv(b);
    
    for (let i = 0; i < tokenPath.length; i++) {
        if (!maxAmountOut[i].isFinite()) return {};

        let next = (i + 1) % tokenPath.length;
        [amountOut[i],] = await getAllQuotes(maxAmountOut[i], tokenPath[i], tokenPath[next]);
        maxAmountOut[i + 1] = BN.max(...amountOut[i]);

        let amountInPrint: string = toPrintable(maxAmountOut[i], tokenPath[i].decimals, fixed);
        let maxAmountPrint: string = toPrintable(maxAmountOut[i + 1], tokenPath[next].decimals, fixed);

        for (let j = 0; j < amountOut[i].length; j++) {
            maxAmountOut[i + 1].eq(amountOut[i][j]) && table.addRow({
                'Input Token': `${amountInPrint.yellow} ${tokenPath[i].symbol}`,
                [DEX[j]]: `${maxAmountPrint.yellow} ${tokenPath[next].symbol}`,
            });
        }
        
    }
    const price = await getPriceOnOracle(tokenPath[0]);
    const profit = maxAmountOut[tokenPath.length].minus(maxAmountOut[0]).minus(feeAmount);
    const profitUSD = profit.times(price);
    const profitPrint = toPrintable(profit, tokenPath[0].decimals, fixed);
    const profitUSDPrint = toPrintable(profitUSD, tokenPath[0].decimals + 8, fixed);
    const profitLog = `Input: ${toPrintable(amountIn, tokenPath[0].decimals, fixed)} ${tokenPath[0].symbol}\t\tEstimate profit: ${profit.gt(0) ? profitPrint.green : profitPrint.red} ${tokenPath[0].symbol} ($ ${profitUSD.gt(0) ? profitUSDPrint.green : profitUSDPrint.red} )\n`;
    if (profit.isFinite()) {
        table.printTable();
        console.log(profitLog);
    }
    
    log += profitLog;
    log += table.render() + '\n\n';
    log = stripAnsiCodes(log);
    return { table, profit, log };
}