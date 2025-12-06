'use client';

import { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useWebSocket } from '@/components/providers/WebSocketProvider';
import { formatCurrency, formatNumber } from '@/lib/utils';
import type { OrderBookData, OrderBookLevel } from '@/types/dashboard';

export function OrderBookDepth() {
  const { on, off } = useWebSocket();
  const [orderBooks, setOrderBooks] = useState<OrderBookData[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('ETH/USD');

  useEffect(() => {
    const handleOrderBookUpdate = (update: OrderBookData) => {
      setOrderBooks((prev) => {
        const index = prev.findIndex(
          (ob) => ob.symbol === update.symbol && ob.exchange === update.exchange
        );
        if (index >= 0) {
          const newBooks = [...prev];
          newBooks[index] = update;
          return newBooks;
        }
        return [...prev, update];
      });
    };

    on<OrderBookData>('orderbook_update', handleOrderBookUpdate);

    return () => {
      off<OrderBookData>('orderbook_update', handleOrderBookUpdate);
    };
  }, [on, off]);

  const selectedBooks = orderBooks.filter((ob) => ob.symbol === selectedSymbol);
  const symbols = Array.from(new Set(orderBooks.map((ob) => ob.symbol)));

  const getDepthPercentage = (level: OrderBookLevel, levels: OrderBookLevel[]) => {
    const maxTotal = Math.max(...levels.map((l) => l.total));
    return (level.total / maxTotal) * 100;
  };

  const AggregatedOrderBook = ({ books }: { books: OrderBookData[] }) => {
    if (books.length === 0) {
      return (
        <div className="flex h-[300px] items-center justify-center">
          <p className="text-muted-foreground">No order book data</p>
        </div>
      );
    }

    // Aggregate bids and asks across all exchanges
    const aggregatedBids: OrderBookLevel[] = [];
    const aggregatedAsks: OrderBookLevel[] = [];

    books.forEach((book) => {
      book.bids.forEach((bid) => {
        const existing = aggregatedBids.find((b) => b.price === bid.price);
        if (existing) {
          existing.quantity += bid.quantity;
          existing.total += bid.total;
        } else {
          aggregatedBids.push({ ...bid });
        }
      });

      book.asks.forEach((ask) => {
        const existing = aggregatedAsks.find((a) => a.price === ask.price);
        if (existing) {
          existing.quantity += ask.quantity;
          existing.total += ask.total;
        } else {
          aggregatedAsks.push({ ...ask });
        }
      });
    });

    // Sort
    aggregatedBids.sort((a, b) => b.price - a.price);
    aggregatedAsks.sort((a, b) => a.price - b.price);

    // Take top levels
    const topBids = aggregatedBids.slice(0, 10);
    const topAsks = aggregatedAsks.slice(0, 10);

    const midPrice =
      topBids.length && topAsks.length
        ? (topBids[0].price + topAsks[0].price) / 2
        : 0;

    const spread =
      topAsks.length && topBids.length ? topAsks[0].price - topBids[0].price : 0;
    const spreadPercent = midPrice ? (spread / midPrice) * 100 : 0;

    return (
      <div className="space-y-4">
        {/* Header Stats */}
        <div className="grid grid-cols-3 gap-4 rounded-lg border bg-muted/50 p-4">
          <div>
            <p className="text-xs text-muted-foreground">Mid Price</p>
            <p className="text-lg font-bold">{formatCurrency(midPrice)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Spread</p>
            <p className="text-lg font-bold">{formatCurrency(spread)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Spread %</p>
            <p className="text-lg font-bold">{spreadPercent.toFixed(3)}%</p>
          </div>
        </div>

        {/* Exchange Badges */}
        <div className="flex flex-wrap gap-2">
          {books.map((book) => (
            <Badge key={`${book.exchange}-${book.symbol}`} variant="outline">
              <Activity className="mr-1 h-3 w-3" />
              {book.exchange}
            </Badge>
          ))}
        </div>

        {/* Order Book Display */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Asks (Sell Orders) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ArrowUp className="h-4 w-4 text-destructive" />
              <span>Asks (Sell)</span>
            </div>
            <div className="space-y-1">
              {topAsks.reverse().map((ask, idx) => (
                <div key={idx} className="relative">
                  <div
                    className="absolute inset-0 bg-destructive/20"
                    style={{
                      width: `${getDepthPercentage(ask, topAsks)}%`,
                    }}
                  />
                  <div className="relative flex justify-between px-2 py-1 text-xs font-mono">
                    <span className="text-destructive font-medium">
                      {formatCurrency(ask.price)}
                    </span>
                    <span className="text-muted-foreground">
                      {formatNumber(ask.quantity, 4)}
                    </span>
                    <span className="text-muted-foreground">
                      {formatNumber(ask.total, 2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bids (Buy Orders) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ArrowDown className="h-4 w-4 text-success" />
              <span>Bids (Buy)</span>
            </div>
            <div className="space-y-1">
              {topBids.map((bid, idx) => (
                <div key={idx} className="relative">
                  <div
                    className="absolute inset-0 bg-success/20"
                    style={{
                      width: `${getDepthPercentage(bid, topBids)}%`,
                    }}
                  />
                  <div className="relative flex justify-between px-2 py-1 text-xs font-mono">
                    <span className="text-success font-medium">
                      {formatCurrency(bid.price)}
                    </span>
                    <span className="text-muted-foreground">
                      {formatNumber(bid.quantity, 4)}
                    </span>
                    <span className="text-muted-foreground">
                      {formatNumber(bid.total, 2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Column Headers */}
        <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
          <div className="flex justify-between px-2">
            <span>Price</span>
            <span>Size</span>
            <span>Total</span>
          </div>
          <div className="flex justify-between px-2">
            <span>Price</span>
            <span>Size</span>
            <span>Total</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Order Book Depth</CardTitle>
            <CardDescription>Aggregated from multiple DEXs</CardDescription>
          </div>
          {symbols.length > 0 && (
            <div className="flex gap-2">
              {symbols.map((symbol) => (
                <Button
                  key={symbol}
                  variant={selectedSymbol === symbol ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedSymbol(symbol)}
                >
                  {symbol}
                </Button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <AggregatedOrderBook books={selectedBooks} />
      </CardContent>
    </Card>
  );
}
