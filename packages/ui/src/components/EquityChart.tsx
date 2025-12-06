import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTradingStore } from '../store';

export function EquityChart() {
  const equityHistory = useTradingStore((state) => state.botState.equityHistory);

  const data = equityHistory.map((point) => ({
    time: new Date(point.timestamp).toLocaleTimeString(),
    equity: point.equity,
  }));

  return (
    <div className="bg-dark-card rounded-lg p-6 border border-dark-border">
      <h2 className="text-xl font-semibold mb-4">Equity Curve</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="time" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          <Line type="monotone" dataKey="equity" stroke="#3b82f6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
