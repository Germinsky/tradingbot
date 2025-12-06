'use client';

import { PnLChart } from '@/components/PnLChart';
import { PositionHeatmap } from '@/components/PositionHeatmap';
import { StrategyCards } from '@/components/StrategyCards';
import { OrderBookDepth } from '@/components/OrderBookDepth';
import { Header } from '@/components/Header';
import { ConnectionStatus } from '@/components/ConnectionStatus';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Connection Status */}
        <ConnectionStatus />

        {/* Top Section: PnL Chart + Position Heatmap */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PnLChart />
          <PositionHeatmap />
        </div>

        {/* Middle Section: Strategy Cards */}
        <StrategyCards />

        {/* Bottom Section: Order Book Depth */}
        <OrderBookDepth />
      </main>
    </div>
  );
}
