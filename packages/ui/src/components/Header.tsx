import { useTradingStore } from '../store';

interface HeaderProps {
  connected: boolean;
}

export function Header({ connected = true }: HeaderProps) {
  const { botState, darkMode, toggleDarkMode } = useTradingStore();

  return (
    <header className="bg-dark-card border-b border-dark-border px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <h1 className="text-2xl font-bold">Trading Bot Dashboard</h1>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-slate-400">
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <div
                className={`w-3 h-3 rounded-full ${botState.running ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}
              />
              <span className="text-sm text-slate-400">
                {botState.running ? 'Running' : 'Stopped'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-6">
          <div className="text-right">
            <p className="text-sm text-slate-400">Equity</p>
            <p className="text-2xl font-bold">${botState.equity.toFixed(2)}</p>
          </div>
          <button
            onClick={toggleDarkMode}
            className="px-4 py-2 rounded-lg bg-dark-bg border border-dark-border hover:bg-slate-800 transition"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
    </header>
  );
}
