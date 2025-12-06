import { useTradingStore } from '../store';

export function OrderHistory() {
  const orders = useTradingStore((state) => state.botState.orders);

  return (
    <div className="bg-dark-card rounded-lg p-6 border border-dark-border">
      <h2 className="text-xl font-semibold mb-4">Order History</h2>
      {orders.length === 0 ? (
        <p className="text-slate-400">No orders yet</p>
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-dark-card">
              <tr className="border-b border-dark-border">
                <th className="text-left py-2">Time</th>
                <th className="text-left py-2">Symbol</th>
                <th className="text-left py-2">Side</th>
                <th className="text-right py-2">Quantity</th>
                <th className="text-right py-2">Price</th>
                <th className="text-left py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders
                .slice()
                .reverse()
                .map((order) => (
                  <tr key={order.id} className="border-b border-dark-border/50">
                    <td className="py-2 text-slate-400">
                      {new Date(order.timestamp).toLocaleTimeString()}
                    </td>
                    <td>{order.symbol}</td>
                    <td>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          order.side === 'buy' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                        }`}
                      >
                        {order.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="text-right">{order.quantity}</td>
                    <td className="text-right">{order.price ? `$${order.price.toFixed(2)}` : '-'}</td>
                    <td>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          order.status === 'filled'
                            ? 'bg-blue-900/30 text-blue-400'
                            : order.status === 'pending'
                            ? 'bg-yellow-900/30 text-yellow-400'
                            : 'bg-gray-900/30 text-gray-400'
                        }`}
                      >
                        {order.status}
                      </span>
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
