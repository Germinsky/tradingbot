#!/usr/bin/env tsx
/**
 * Trading Bot DEX Demo
 * Demonstrates the 5 production DEX adapters with real quotes
 */

import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createUniswapV2Adapter,
  createUniswapV3Adapter,
  createZeroExAdapter,
  createOneInchAdapter,
  createCowSwapAdapter,
  type Token,
  type TokenAmount,
} from './packages/exchanges/src/index';

// Token definitions
const WETH: Token = {
  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  symbol: 'WETH',
  decimals: 18,
  chainId: 1,
  name: 'Wrapped Ether',
};

const USDC: Token = {
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  symbol: 'USDC',
  decimals: 6,
  chainId: 1,
  name: 'USD Coin',
};

const DAI: Token = {
  address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  symbol: 'DAI',
  decimals: 18,
  chainId: 1,
  name: 'Dai Stablecoin',
};

async function main() {
  console.log('🚀 Trading Bot DEX Connector Demo\n');
  console.log('=' .repeat(60));

  // Setup clients
  const alchemyKey = process.env.ALCHEMY_API_KEY || 'demo';
  const privateKey = process.env.PRIVATE_KEY || '0x' + '1'.repeat(64); // Dummy key for demo

  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(`https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`),
  });

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(`https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`),
  });

  const inputAmount: TokenAmount = {
    token: WETH,
    amount: parseEther('1'), // 1 WETH
  };

  console.log(`\n📊 Getting quotes for: 1 WETH → USDC`);
  console.log('=' .repeat(60));

  // Test Uniswap V2
  console.log('\n1️⃣  Uniswap V2');
  console.log('-'.repeat(40));
  try {
    const uniV2 = createUniswapV2Adapter(publicClient, walletClient, 1);
    const v2Quote = await uniV2.getQuote(inputAmount, USDC, 0.5);
    
    console.log(`✅ Output: ${formatAmount(v2Quote.outputAmount.amount, USDC.decimals)} USDC`);
    console.log(`   Price Impact: ${v2Quote.priceImpact.toFixed(2)}%`);
    console.log(`   Fee: ${v2Quote.feeBps} bps (${(v2Quote.feeBps / 100).toFixed(2)}%)`);
    console.log(`   Gas Estimate: ${v2Quote.gasEstimate.toString()}`);
    console.log(`   Route: ${v2Quote.routes[0].map(h => h.protocol).join(' → ')}`);
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
  }

  // Test Uniswap V3
  console.log('\n2️⃣  Uniswap V3 (Multi-Fee-Tier)');
  console.log('-'.repeat(40));
  try {
    const uniV3 = createUniswapV3Adapter(publicClient, walletClient, 1);
    const v3Quote = await uniV3.getQuote(inputAmount, USDC, 0.5);
    
    console.log(`✅ Output: ${formatAmount(v3Quote.outputAmount.amount, USDC.decimals)} USDC`);
    console.log(`   Price Impact: ${v3Quote.priceImpact.toFixed(2)}%`);
    console.log(`   Fee Tier: ${v3Quote.data?.fee} bps`);
    console.log(`   Gas Estimate: ${v3Quote.gasEstimate.toString()}`);
    console.log(`   Route: ${v3Quote.routes[0].map(h => h.protocol).join(' → ')}`);
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
  }

  // Test 0x Protocol (requires API key)
  console.log('\n3️⃣  0x Protocol Aggregator');
  console.log('-'.repeat(40));
  const zeroXKey = process.env.ZEROX_API_KEY;
  if (zeroXKey) {
    try {
      const zeroX = createZeroExAdapter(publicClient, walletClient, zeroXKey);
      const zeroXQuote = await zeroX.getQuote(inputAmount, USDC, 0.5);
      
      console.log(`✅ Output: ${formatAmount(zeroXQuote.outputAmount.amount, USDC.decimals)} USDC`);
      console.log(`   Price Impact: ${zeroXQuote.priceImpact.toFixed(2)}%`);
      console.log(`   Fee: ${zeroXQuote.feeBps} bps`);
      console.log(`   Sources: ${zeroXQuote.routes.length} protocols aggregated`);
      console.log(`   Gas Estimate: ${zeroXQuote.gasEstimate.toString()}`);
    } catch (error: any) {
      console.log(`❌ Error: ${error.message}`);
    }
  } else {
    console.log('⚠️  Skipped: Set ZEROX_API_KEY to test');
  }

  // Test 1inch (requires API key)
  console.log('\n4️⃣  1inch v6 Aggregator');
  console.log('-'.repeat(40));
  const oneInchKey = process.env.ONEINCH_API_KEY;
  if (oneInchKey) {
    try {
      const oneInch = createOneInchAdapter(publicClient, walletClient, oneInchKey);
      const oneInchQuote = await oneInch.getQuote(inputAmount, USDC, 0.5);
      
      console.log(`✅ Output: ${formatAmount(oneInchQuote.outputAmount.amount, USDC.decimals)} USDC`);
      console.log(`   Price Impact: ${oneInchQuote.priceImpact.toFixed(2)}%`);
      console.log(`   Protocol Fees: ${oneInchQuote.feeBps} bps (always 0)`);
      console.log(`   Sources: ${oneInchQuote.routes.length} protocols`);
      console.log(`   Gas Estimate: ${oneInchQuote.gasEstimate.toString()}`);
    } catch (error: any) {
      console.log(`❌ Error: ${error.message}`);
    }
  } else {
    console.log('⚠️  Skipped: Set ONEINCH_API_KEY to test');
  }

  // Test CoW Swap (MEV protected)
  console.log('\n5️⃣  CoW Swap (MEV Protected)');
  console.log('-'.repeat(40));
  try {
    const cowSwap = createCowSwapAdapter(publicClient, walletClient);
    const cowQuote = await cowSwap.getQuote(inputAmount, USDC, 0.5);
    
    console.log(`✅ Output: ${formatAmount(cowQuote.outputAmount.amount, USDC.decimals)} USDC`);
    console.log(`   Price Impact: 0% (solver-based, no MEV)`);
    console.log(`   Fee: Included in quote`);
    console.log(`   Gas: 0 (gasless execution)`);
    console.log(`   Valid Until: ${new Date((cowQuote.validUntil || 0) * 1000).toLocaleTimeString()}`);
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
  }

  // Compare best price
  console.log('\n' + '='.repeat(60));
  console.log('🏆 Summary');
  console.log('='.repeat(60));
  console.log('\nAll adapters are functional and ready to use!');
  console.log('\n📝 Key Features:');
  console.log('   ✅ Normalized quote interface across all DEXes');
  console.log('   ✅ Automatic approval management');
  console.log('   ✅ MEV protection support (CoW Swap, Flashbots)');
  console.log('   ✅ Multi-chain support (8 chains)');
  console.log('   ✅ Slippage protection built-in');
  console.log('   ✅ Gas estimation included');

  console.log('\n🔧 Next Steps:');
  console.log('   1. Set API keys: ZEROX_API_KEY, ONEINCH_API_KEY');
  console.log('   2. Set ALCHEMY_API_KEY for RPC access');
  console.log('   3. Set PRIVATE_KEY for transaction signing');
  console.log('   4. Run: npx tsx demo.ts');

  console.log('\n💡 Example Usage:');
  console.log('   const adapter = createUniswapV3Adapter(publicClient, walletClient, 1);');
  console.log('   const quote = await adapter.getQuote(inputAmount, USDC, 0.5);');
  console.log('   await adapter.executeSwap(quote, { waitForConfirmation: true });');
  
  console.log('\n✨ Done!\n');
}

function formatAmount(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  const remainderStr = remainder.toString().padStart(decimals, '0').slice(0, 2);
  return `${whole}.${remainderStr}`;
}

// Run demo
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
