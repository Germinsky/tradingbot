'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useWebSocket } from '@/components/providers/WebSocketProvider';
import { formatCurrency, formatPercentage, getChainColor } from '@/lib/utils';
import type { Position } from '@/types/dashboard';

export function PositionHeatmap() {
  const { on, off } = useWebSocket();
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => {
    const handlePositionUpdate = (update: Position[]) => {
      setPositions(update);
    };

    on<Position[]>('position_update', handlePositionUpdate);

    return () => {
      off<Position[]>('position_update', handlePositionUpdate);
    };
  }, [on, off]);

  const chains = Array.from(new Set(positions.map((p) => p.chain)));

  const getOpacity = (pnl: number) => {
    const maxPnl = Math.max(...positions.map((p) => Math.abs(p.unrealizedPnL)));
    const normalized = Math.abs(pnl) / (maxPnl || 1);
    return Math.max(0.3, Math.min(1, normalized));
  };

  const getPositionColor = (position: Position) => {
    const baseColor = position.unrealizedPnL >= 0 ? '34, 197, 94' : '239, 68, 68'; // green or red
    const opacity = getOpacity(position.unrealizedPnL);
    return `rgba(${baseColor}, ${opacity})`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Position Heatmap</CardTitle>
        <CardDescription>
          Positions across {chains.length} chain{chains.length !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {positions.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-muted-foreground">No open positions</p>
          </div>
        ) : (
          <div className="space-y-4">
            {chains.map((chain) => {
              const chainPositions = positions.filter((p) => p.chain === chain);
              return (
                <div key={chain}>
                  <div className="mb-2 flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: getChainColor(chain) }}
                    />
                    <h3 className="text-sm font-medium capitalize">{chain}</h3>
                    <Badge variant="outline" className="text-xs">
                      {chainPositions.length}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {chainPositions.map((position) => (
                      <div
                        key={position.id}
                        className="group relative cursor-pointer rounded-lg border p-3 transition-all hover:scale-105 hover:shadow-lg"
                        style={{
                          backgroundColor: getPositionColor(position),
                        }}
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">
                              {position.symbol}
                            </span>
                            <Badge
                              variant={position.side === 'long' ? 'success' : 'destructive'}
                              className="h-4 text-[10px]"
                            >
                              {position.side}
                            </Badge>
                          </div>
                          <span className="text-lg font-bold text-white">
                            {formatPercentage(position.pnlPercentage)}
                          </span>
                          <span className="text-xs text-white/90">
                            {formatCurrency(position.unrealizedPnL)}
                          </span>
                        </div>

                        {/* Hover Tooltip */}
                        <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 hidden w-64 -translate-x-1/2 rounded-lg border bg-card p-3 shadow-xl group-hover:block">
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-bold">{position.symbol}</span>
                              <Badge variant={position.side === 'long' ? 'success' : 'destructive'}>
                                {position.side}
                              </Badge>
                            </div>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Quantity:</span>
                                <span className="font-medium">{position.quantity}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Entry:</span>
                                <span className="font-medium">{formatCurrency(position.entryPrice)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Current:</span>
                                <span className="font-medium">{formatCurrency(position.currentPrice)}</span>
                              </div>
                              <div className="flex justify-between border-t pt-1">
                                <span className="text-muted-foreground">Unrealized PnL:</span>
                                <span
                                  className={`font-bold ${
                                    position.unrealizedPnL >= 0 ? 'text-success' : 'text-destructive'
                                  }`}
                                >
                                  {formatCurrency(position.unrealizedPnL)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
