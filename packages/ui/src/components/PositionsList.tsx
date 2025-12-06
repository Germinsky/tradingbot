import { useTradingStore } from '../store';

export function PositionsList() {
  const positions = useTradingStore((state) => state.botState.positions);

  return (
    <div className="bg-dark-card rounded-lg p-6 border border-dark-border">
      <h2 className="text-xl font-semibold mb-4">Open Positions</h2>
      {positions.length === 0 ? (
        <p className="text-slate-400">No open positions</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border">
                <th className="text-left py-2">Symbol</th>
                <th className="text-right py-2">Quantity</th>
                <th className="text-right py-2">Entry</th>
                <th className="text-right py-2">Current</th>
                <th className="text-right py-2">P&L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => (
                <tr key={pos.symbol} className="border-b border-dark-border/50">
                  <td className="py-2 font-medium">{pos.symbol}</td>
                  <td className="text-right">{pos.quantity.toFixed(4)}</td>
                  <td className="text-right">${pos.entryPrice.toFixed(2)}</td>
                  <td className="text-right">${pos.currentPrice.toFixed(2)}</td>
                  <td
                    className={`text-right font-medium ${
                      pos.unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    ${pos.unrealizedPnL.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
