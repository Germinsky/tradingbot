'use client';

import { useEffect, useState } from 'react';
import { Play, Pause, RefreshCw, TrendingUp, Target, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useWebSocket } from '@/components/providers/WebSocketProvider';
import { formatCurrency, formatPercentage } from '@/lib/utils';
import type { Strategy } from '@/types/dashboard';

export function StrategyCards() {
  const { on, off, emit } = useWebSocket();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handleStrategyUpdate = (update: Strategy[]) => {
      setStrategies(update);
    };

    on<Strategy[]>('strategy_update', handleStrategyUpdate);

    return () => {
      off<Strategy[]>('strategy_update', handleStrategyUpdate);
    };
  }, [on, off]);

  const handleToggle = (strategyId: string, currentEnabled: boolean) => {
    setLoadingStates((prev) => ({ ...prev, [strategyId]: true }));
    emit('toggle_strategy', { strategyId, enabled: !currentEnabled });

    // Optimistic update
    setStrategies((prev) =>
      prev.map((s) =>
        s.id === strategyId ? { ...s, enabled: !currentEnabled } : s
      )
    );

    // Clear loading state after animation
    setTimeout(() => {
      setLoadingStates((prev) => ({ ...prev, [strategyId]: false }));
    }, 500);
  };

  const handleReload = (strategyId: string) => {
    setLoadingStates((prev) => ({ ...prev, [strategyId]: true }));
    emit('reload_strategy', { strategyId });

    setTimeout(() => {
      setLoadingStates((prev) => ({ ...prev, [strategyId]: false }));
    }, 1000);
  };

  const getStatusColor = (status: Strategy['status']) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'secondary';
      case 'error':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Active Strategies</h2>
          <p className="text-sm text-muted-foreground">
            {strategies.filter((s) => s.enabled).length} of {strategies.length} running
          </p>
        </div>
      </div>

      {strategies.length === 0 ? (
        <Card>
          <CardContent className="flex h-[200px] items-center justify-center">
            <p className="text-muted-foreground">No strategies configured</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {strategies.map((strategy) => (
            <Card
              key={strategy.id}
              className={`transition-all ${
                strategy.enabled ? 'border-primary/50 shadow-md' : 'opacity-75'
              }`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      {strategy.name}
                      <Badge variant={getStatusColor(strategy.status)}>
                        {strategy.status}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="mt-1">{strategy.type}</CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant={strategy.enabled ? 'default' : 'outline'}
                      onClick={() => handleToggle(strategy.id, strategy.enabled)}
                      disabled={loadingStates[strategy.id]}
                    >
                      {strategy.enabled ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleReload(strategy.id)}
                      disabled={loadingStates[strategy.id]}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${
                          loadingStates[strategy.id] ? 'animate-spin' : ''
                        }`}
                      />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Performance Metrics */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <TrendingUp className="h-3 w-3" />
                        <span>PnL</span>
                      </div>
                      <p
                        className={`text-lg font-bold ${
                          strategy.pnl >= 0 ? 'text-success' : 'text-destructive'
                        }`}
                      >
                        {formatCurrency(strategy.pnl)}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Target className="h-3 w-3" />
                        <span>Win Rate</span>
                      </div>
                      <p className="text-lg font-bold">{formatPercentage(strategy.winRate)}</p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Activity className="h-3 w-3" />
                        <span>Trades</span>
                      </div>
                      <p className="text-lg font-bold">{strategy.trades}</p>
                    </div>

                    {strategy.sharpeRatio !== undefined && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <TrendingUp className="h-3 w-3" />
                          <span>Sharpe</span>
                        </div>
                        <p className="text-lg font-bold">{strategy.sharpeRatio.toFixed(2)}</p>
                      </div>
                    )}
                  </div>

                  {/* Status Bar */}
                  <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                    <span>Last update</span>
                    <span>
                      {new Date(strategy.lastUpdate).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
