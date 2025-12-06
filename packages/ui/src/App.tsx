import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { EquityChart } from './components/EquityChart';
import { PositionsList } from './components/PositionsList';
import { OrderHistory } from './components/OrderHistory';
import { BotControls } from './components/BotControls';
import { useTradingStore } from './store';

const API_URL = 'http://localhost:3001/api';

function App() {
  const { setBotState, addEquityPoint, botState } = useTradingStore();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Poll bot status every 2 seconds
    const fetchStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/status`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            setBotState(result.data);
            setConnected(true);
            setError(null);
            
            if (result.data.equity) {
              addEquityPoint({
                timestamp: Date.now(),
                equity: result.data.equity,
              });
            }
          }
        } else {
          setConnected(false);
          setError(`API returned ${response.status}`);
        }
      } catch (error) {
        console.error('Failed to fetch status:', error);
        setConnected(false);
        setError(error instanceof Error ? error.message : 'Connection failed');
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);

    return () => clearInterval(interval);
  }, [setBotState, addEquityPoint]);

  return (
    <div className="min-h-screen bg-dark-bg">
      <Header connected={connected} />
      <main className="container mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm">
              <strong>Connection Error:</strong> {error}
            </p>
            <p className="text-red-300 text-xs mt-1">
              Make sure the bot API server is running on port 3001
            </p>
          </div>
        )}
        <div className="grid gap-6">
          <BotControls />
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
