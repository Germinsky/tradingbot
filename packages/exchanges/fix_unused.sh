#!/bin/bash

# Fix unused variables in across.ts
sed -i 's/input: TokenAmount,/_input: TokenAmount,/g' src/adapters/across.ts
sed -i 's/output: Token,/_output: Token,/g' src/adapters/across.ts
sed -i 's/slippage: number,/_slippage: number,/g' src/adapters/across.ts
sed -i 's/quote: Quote,/_quote: Quote,/g' src/adapters/across.ts

# Fix unused variables in base-adapter.ts
sed -i 's/flashbotsRPC =/_ flashbotsRPC =/g' src/adapters/base-adapter.ts
sed -i 's/edenRPC =/_edenRPC =/g' src/adapters/base-adapter.ts
sed -i 's/inputAmount: bigint,/_inputAmount: bigint,/g' src/adapters/base-adapter.ts
sed -i 's/outputAmount: bigint,/_outputAmount: bigint,/g' src/adapters/base-adapter.ts
sed -i 's/marketPrice: number/_marketPrice: number/g' src/adapters/base-adapter.ts

# Fix unused variables in cowswap.ts  
sed -i 's/order: CowSwapOrder,/_order: CowSwapOrder,/g' src/adapters/cowswap.ts
sed -i 's/const domain = {/const _domain = {/g' src/adapters/cowswap.ts
sed -i 's/const types = {/const _types = {/g' src/adapters/cowswap.ts

# Fix unused variables in mev-protection.ts
sed -i 's/readonly EDEN_RPC/readonly _EDEN_RPC/g' src/adapters/mev-protection.ts

# Fix unused variables in uniswap-v2.ts, uniswap-v3.ts, oneinch.ts, zerox.ts
sed -i 's/options?: Partial<BuildTransactionOptions>/_options?: Partial<BuildTransactionOptions>/g' src/adapters/*.ts
sed -i 's/options: BuildTransactionOptions/_options: BuildTransactionOptions/g' src/adapters/*.ts  
sed -i 's/options: ExecuteSwapOptions/_options: ExecuteSwapOptions/g' src/adapters/*.ts

# Fix unused deadline in uniswap-v3
sed -i 's/const deadline = BigInt(/const _deadline = BigInt(/g' src/adapters/uniswap-v3.ts

