import { useEffect } from 'react';
import { Header } from './components/Header';
import { EquityChart } from './components/EquityChart';
import { PositionsList } from './components/PositionsList';
import { OrderHistory } from './components/OrderHistory';
import { useTradingStore } from './store';

function App() {
  const { setBotState, addEquityPoint } = useTradingStore();

  useEffect(() => {
    // Simulate bot running with mock data
    const interval = setInterval(() => {
      setBotState({
        running: true,
        equity: 10000 + Math.random() * 500,
        positions: [
          {
            symbol: 'ETH/USD',
            quantity: 0.5,
            entryPrice: 2000,
            currentPrice: 2000 + Math.random() * 100 - 50,
            unrealizedPnL: Math.random() * 100 - 50,
            realizedPnL: 0,
          },
        ],
        orders: useTradingStore.getState().botState.orders,
        equityHistory: useTradingStore.getState().botState.equityHistory,
      });

      addEquityPoint({
        timestamp: Date.now(),
        equity: 10000 + Math.random() * 500,
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [setBotState, addEquityPoint]);

  return (
    <div className="min-h-screen bg-dark-bg">
      <Header />
      <main className="container mx-auto px-6 py-8">
        <div className="grid gap-6">
          <EquityChart />
          <div className="grid md:grid-cols-2 gap-6">
            <PositionsList />
            <OrderHistory />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
