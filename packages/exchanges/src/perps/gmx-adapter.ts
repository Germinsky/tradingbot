import { createPublicClient, createWalletClient, http, parseAbi, formatUnits, parseUnits, Address, Chain } from 'viem';
import { arbitrum, avalanche } from 'viem/chains';
import { BasePerpAdapter, PerpPosition, PerpOrderParams, PerpMarketInfo } from '../perp-adapter.js';

// GMX V2 Contract ABIs (simplified)
const GMX_ROUTER_ABI = parseAbi([
  'function createOrder((address market, address initialCollateralToken, address[] swapPath, uint256 sizeDeltaUsd, uint256 initialCollateralDeltaAmount, uint256 triggerPrice, uint256 acceptablePrice, uint256 executionFee, uint256 callbackGasLimit, uint256 minOutputAmount, bool isLong, bool shouldUnwrapNativeToken) params) payable returns (bytes32)',
  'function updateOrder(bytes32 key, uint256 sizeDeltaUsd, uint256 acceptablePrice, uint256 triggerPrice, uint256 minOutputAmount) external',
  'function cancelOrder(bytes32 key) external',
]);

const GMX_READER_ABI = parseAbi([
  'function getMarketInfo(address dataStore, (address marketToken, address indexToken, address longToken, address shortToken) market) view returns ((uint256 marketTokenPrice, int256 longTokenPrice, int256 shortTokenPrice, uint256 longPoolAmount, uint256 shortPoolAmount, uint256 openInterestLong, uint256 openInterestShort))',
  'function getPositionInfo(address dataStore, bytes32 positionKey) view returns ((uint256 sizeInUsd, uint256 collateralAmount, int256 pnlUsd, uint256 entryPrice, uint256 liquidationPrice))',
]);

const GMX_DATA_STORE_ABI = parseAbi([
  'function getUint(bytes32 key) view returns (uint256)',
  'function getInt(bytes32 key) view returns (int256)',
  'function getAddress(bytes32 key) view returns (address)',
]);

interface GMXConfig {
  chain: Chain;
  routerAddress: Address;
  readerAddress: Address;
  dataStoreAddress: Address;
  rpcUrl: string;
  walletPrivateKey?: `0x${string}`;
}

export class GMXAdapter extends BasePerpAdapter {
  private publicClient: any;
  private walletClient: any;
  private config: GMXConfig;
  private positionSubscriptions: Set<string> = new Set();
  private marketSubscriptions: Set<string> = new Set();
  private pollingInterval?: NodeJS.Timeout;

  constructor(config: GMXConfig) {
    super();
    this.config = config;
    this.publicClient = createPublicClient({
      chain: config.chain,
      transport: http(config.rpcUrl),
    });
    
    if (config.walletPrivateKey) {
      this.walletClient = createWalletClient({
        chain: config.chain,
        transport: http(config.rpcUrl),
      });
    }
  }

  async connect(): Promise<void> {
    await super.connect();
    this.startPolling();
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    await super.disconnect();
  }

  async openPosition(params: PerpOrderParams): Promise<PerpPosition> {
    if (!this.walletClient) {
      throw new Error('Wallet not configured');
    }

    const market = await this.getMarketAddress(params.symbol);
    const collateralToken = await this.getCollateralToken(params.symbol);
    const sizeDeltaUsd = parseUnits(params.size.toString(), 30); // GMX uses 30 decimals for USD
    const leverage = params.leverage || 10;
    const collateralAmount = parseUnits((params.size / leverage).toString(), 18);
    
    const markPrice = await this.getMarkPrice(params.symbol);
    const slippage = params.slippage || 0.003; // 0.3% default
    const acceptablePrice = params.side === 'long' 
      ? parseUnits((markPrice * (1 + slippage)).toString(), 30)
      : parseUnits((markPrice * (1 - slippage)).toString(), 30);

    const orderParams = {
      market,
      initialCollateralToken: collateralToken,
      swapPath: [] as Address[],
      sizeDeltaUsd,
      initialCollateralDeltaAmount: collateralAmount,
      triggerPrice: 0n,
      acceptablePrice,
      executionFee: parseUnits('0.001', 18), // Execution fee in ETH
      callbackGasLimit: 2000000n,
      minOutputAmount: 0n,
      isLong: params.side === 'long',
      shouldUnwrapNativeToken: false,
    };

    const hash = await this.walletClient.writeContract({
      address: this.config.routerAddress,
      abi: GMX_ROUTER_ABI,
      functionName: 'createOrder',
      args: [orderParams],
      value: parseUnits('0.001', 18), // Execution fee
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const positionId = receipt.logs[0]?.topics[1] || hash;

    const position: PerpPosition = {
      id: positionId,
      symbol: params.symbol,
      side: params.side,
      size: params.size,
      entryPrice: markPrice,
      markPrice,
      leverage: leverage,
      collateral: params.size / leverage,
      unrealizedPnl: 0,
      liquidationPrice: this.calculateLiquidationPrice(markPrice, params.side, leverage),
      fundingRate: await this.getFundingRate(params.symbol),
      timestamp: Date.now(),
    };

    this.emitPositionUpdate(position);
    return position;
  }

  async adjustPosition(positionId: string, params: Partial<PerpOrderParams>): Promise<PerpPosition> {
    if (!this.walletClient) {
      throw new Error('Wallet not configured');
    }

    const position = await this.getPosition(positionId);
    
    if (params.size) {
      const sizeDeltaUsd = parseUnits(Math.abs(params.size - position.size).toString(), 30);
      const markPrice = await this.getMarkPrice(position.symbol);
      const slippage = params.slippage || 0.003;
      const acceptablePrice = parseUnits((markPrice * (1 + slippage)).toString(), 30);

      await this.walletClient.writeContract({
        address: this.config.routerAddress,
        abi: GMX_ROUTER_ABI,
        functionName: 'updateOrder',
        args: [positionId as `0x${string}`, sizeDeltaUsd, acceptablePrice, 0n, 0n],
      });
    }

    const updatedPosition = await this.fetchPositionData(positionId);
    this.emitPositionUpdate(updatedPosition);
    return updatedPosition;
  }

  async closePosition(positionId: string, size?: number): Promise<void> {
    if (!this.walletClient) {
      throw new Error('Wallet not configured');
    }

    const position = await this.getPosition(positionId);
    const closeSize = size || position.size;
    const sizeDeltaUsd = parseUnits(closeSize.toString(), 30);
    const markPrice = await this.getMarkPrice(position.symbol);
    const slippage = 0.005; // 0.5% for closing
    const acceptablePrice = position.side === 'long'
      ? parseUnits((markPrice * (1 - slippage)).toString(), 30)
      : parseUnits((markPrice * (1 + slippage)).toString(), 30);

    await this.walletClient.writeContract({
      address: this.config.routerAddress,
      abi: GMX_ROUTER_ABI,
      functionName: 'updateOrder',
      args: [positionId as `0x${string}`, -sizeDeltaUsd, acceptablePrice, 0n, 0n],
    });

    this.positions.delete(positionId);
    this.emit('positionClosed', { positionId, symbol: position.symbol });
  }

  async getMarkPrice(symbol: string): Promise<number> {
    const market = await this.getMarketAddress(symbol);
    const marketInfo = await this.publicClient.readContract({
      address: this.config.readerAddress,
      abi: GMX_READER_ABI,
      functionName: 'getMarketInfo',
      args: [this.config.dataStoreAddress, { marketToken: market, indexToken: market, longToken: market, shortToken: market }],
    });

    return parseFloat(formatUnits(marketInfo.longTokenPrice, 30));
  }

  async getFundingRate(symbol: string): Promise<number> {
    const market = await this.getMarketAddress(symbol);
    const fundingRateKey = this.getFundingRateKey(market);
    
    const fundingRate = await this.publicClient.readContract({
      address: this.config.dataStoreAddress,
      abi: GMX_DATA_STORE_ABI,
      functionName: 'getInt',
      args: [fundingRateKey],
    });

    return parseFloat(formatUnits(fundingRate, 30));
  }

  async getMaxLeverage(symbol: string): Promise<number> {
    // GMX V2 typically allows up to 50x leverage
    return 50;
  }

  async getMarketInfo(symbol: string): Promise<PerpMarketInfo> {
    const markPrice = await this.getMarkPrice(symbol);
    const fundingRate = await this.getFundingRate(symbol);

    return {
      symbol,
      markPrice,
      indexPrice: markPrice,
      fundingRate,
      nextFundingTime: Date.now() + 3600000, // 1 hour
      openInterest: 0, // Would fetch from contract
      maxLeverage: 50,
      minSize: 0.001,
      available: true,
    };
  }

  subscribeToPosition(positionId: string): void {
    this.positionSubscriptions.add(positionId);
  }

  unsubscribeFromPosition(positionId: string): void {
    this.positionSubscriptions.delete(positionId);
  }

  subscribeToMarket(symbol: string): void {
    this.marketSubscriptions.add(symbol);
  }

  unsubscribeFromMarket(symbol: string): void {
    this.marketSubscriptions.delete(symbol);
  }

  private startPolling(): void {
    this.pollingInterval = setInterval(() => {
      this.pollUpdates();
    }, 2000); // Poll every 2 seconds
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }

  private async pollUpdates(): Promise<void> {
    // Poll position updates
    for (const positionId of this.positionSubscriptions) {
      try {
        const position = await this.fetchPositionData(positionId);
        this.emitPositionUpdate(position);
      } catch (error) {
        console.error(`Error polling position ${positionId}:`, error);
      }
    }

    // Poll market updates
    for (const symbol of this.marketSubscriptions) {
      try {
        const marketInfo = await this.getMarketInfo(symbol);
        this.emitMarketUpdate(symbol, marketInfo);
      } catch (error) {
        console.error(`Error polling market ${symbol}:`, error);
      }
    }
  }

  private async fetchPositionData(positionId: string): Promise<PerpPosition> {
    const positionInfo = await this.publicClient.readContract({
      address: this.config.readerAddress,
      abi: GMX_READER_ABI,
      functionName: 'getPositionInfo',
      args: [this.config.dataStoreAddress, positionId as `0x${string}`],
    });

    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    const sizeInUsd = parseFloat(formatUnits(positionInfo.sizeInUsd, 30));
    const entryPrice = parseFloat(formatUnits(positionInfo.entryPrice, 30));
    const pnlUsd = parseFloat(formatUnits(positionInfo.pnlUsd, 30));
    const liquidationPrice = parseFloat(formatUnits(positionInfo.liquidationPrice, 30));
    const markPrice = await this.getMarkPrice(position.symbol);

    return {
      ...position,
      size: sizeInUsd / entryPrice,
      entryPrice,
      markPrice,
      unrealizedPnl: pnlUsd,
      liquidationPrice,
      timestamp: Date.now(),
    };
  }

  private async getMarketAddress(symbol: string): Promise<Address> {
    // Map symbol to GMX market address
    // This would be fetched from GMX market registry in production
    const markets: Record<string, Address> = {
      'ETH/USD': '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336',
      'BTC/USD': '0x47c031236e19d024b42f8AE6780E44A573170703',
    };
    return markets[symbol] || markets['ETH/USD'];
  }

  private async getCollateralToken(symbol: string): Promise<Address> {
    // Returns USDC address for the chain
    return this.config.chain.id === arbitrum.id
      ? '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
      : '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E';
  }

  private getFundingRateKey(market: Address): `0x${string}` {
    // Generate funding rate storage key for GMX DataStore
    return `0x${Buffer.from(`funding.rate.${market}`).toString('hex').padStart(64, '0')}` as `0x${string}`;
  }

  private calculateLiquidationPrice(entryPrice: number, side: 'long' | 'short', leverage: number): number {
    const maintenanceMargin = 0.01; // 1%
    const priceMove = entryPrice * (1 - maintenanceMargin) / leverage;
    return side === 'long' ? entryPrice - priceMove : entryPrice + priceMove;
  }
}

// Factory functions for different chains
export function createGMXArbitrumAdapter(rpcUrl: string, privateKey?: `0x${string}`): GMXAdapter {
  return new GMXAdapter({
    chain: arbitrum,
    routerAddress: '0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8',
    readerAddress: '0x38d91ED96283d62182Fc6d990C24097A918a4d9b',
    dataStoreAddress: '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8',
    rpcUrl,
    walletPrivateKey: privateKey,
  });
}

export function createGMXAvalancheAdapter(rpcUrl: string, privateKey?: `0x${string}`): GMXAdapter {
  return new GMXAdapter({
    chain: avalanche,
    routerAddress: '0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064',
    readerAddress: '0x67b789D48c926006F5132BFCe4e976F0A7A63d5D',
    dataStoreAddress: '0x2F0b22339414ADeD7D5F06f9D604c7fF5b2fe3f6',
    rpcUrl,
    walletPrivateKey: privateKey,
  });
}
