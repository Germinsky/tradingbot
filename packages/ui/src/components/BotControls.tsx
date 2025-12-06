import { useState } from 'react';

const API_URL = 'http://localhost:3001/api';

export function BotControls() {
  const [loading, setLoading] = useState(false);
  const [orderForm, setOrderForm] = useState({
    symbol: 'ETH/USD',
    side: 'buy' as 'buy' | 'sell',
    quantity: '0.1',
    price: '',
    type: 'market'
  });

  const handleStart = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/start`, { method: 'POST' });
      const data = await response.json();
      if (!data.success) {
        alert(data.error || 'Failed to start bot');
      }
    } catch (error) {
      alert('Failed to start bot');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/stop`, { method: 'POST' });
      const data = await response.json();
      if (!data.success) {
        alert(data.error || 'Failed to stop bot');
      }
    } catch (error) {
      alert('Failed to stop bot');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderForm)
      });
      
      const data = await response.json();
      if (data.success) {
        alert('Order submitted successfully!');
        setOrderForm({ ...orderForm, price: '', quantity: '0.1' });
      } else {
        alert(data.error || 'Failed to submit order');
      }
    } catch (error) {
      alert('Failed to submit order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Bot Controls */}
      <div className="bg-dark-card border border-dark-border rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4 text-white">Bot Controls</h2>
        <div className="flex gap-4">
          <button
            onClick={handleStart}
            disabled={loading}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            {loading ? 'Loading...' : 'Start Bot'}
          </button>
          <button
            onClick={handleStop}
            disabled={loading}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            {loading ? 'Loading...' : 'Stop Bot'}
          </button>
        </div>
      </div>

      {/* Manual Order Form */}
      <div className="bg-dark-card border border-dark-border rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4 text-white">Manual Order</h2>
        <form onSubmit={handleSubmitOrder} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Symbol
              </label>
              <input
                type="text"
                value={orderForm.symbol}
                onChange={(e) => setOrderForm({ ...orderForm, symbol: e.target.value })}
                className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Side
              </label>
              <select
                value={orderForm.side}
                onChange={(e) => setOrderForm({ ...orderForm, side: e.target.value as 'buy' | 'sell' })}
                className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-white"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Quantity
              </label>
              <input
                type="number"
                step="0.01"
                value={orderForm.quantity}
                onChange={(e) => setOrderForm({ ...orderForm, quantity: e.target.value })}
                className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Type
              </label>
              <select
                value={orderForm.type}
                onChange={(e) => setOrderForm({ ...orderForm, type: e.target.value })}
                className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-white"
              >
                <option value="market">Market</option>
                <option value="limit">Limit</option>
              </select>
            </div>
          </div>

          {orderForm.type === 'limit' && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Price
              </label>
              <input
                type="number"
                step="0.01"
                value={orderForm.price}
                onChange={(e) => setOrderForm({ ...orderForm, price: e.target.value })}
                className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-white"
                required={orderForm.type === 'limit'}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            {loading ? 'Submitting...' : 'Submit Order'}
          </button>
        </form>
      </div>
    </div>
  );
}
