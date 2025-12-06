'use client';

import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { useWebSocket } from '@/components/providers/WebSocketProvider';
import { formatCurrency, formatPercentage } from '@/lib/utils';
import type { PnLData } from '@/types/dashboard';

export function PnLChart() {
  const { on, off } = useWebSocket();
  const [data, setData] = useState<PnLData[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    realized: 0,
    unrealized: 0,
    fees: 0,
    change24h: 0,
  });

  useEffect(() => {
    const handlePnLUpdate = (update: PnLData) => {
      setData((prev) => {
        const newData = [...prev, update].slice(-100); // Keep last 100 points
        
        // Calculate stats
        const latest = newData[newData.length - 1];
        const dayAgo = newData[Math.max(0, newData.length - 288)]; // ~24h ago at 5min intervals
        const change = dayAgo ? ((latest.total - dayAgo.total) / Math.abs(dayAgo.total)) * 100 : 0;

        setStats({
          total: latest.total,
          realized: latest.realized,
          unrealized: latest.unrealized,
          fees: latest.fees,
          change24h: change,
        });

        return newData;
      });
    };

    on<PnLData>('pnl_update', handlePnLUpdate);

    // Request initial data
    // emit('request_pnl_history', { limit: 100 });

    return () => {
      off<PnLData>('pnl_update', handlePnLUpdate);
    };
  }, [on, off]);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: PnLData }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-lg border bg-card p-3 shadow-lg">
          <p className="mb-2 text-sm font-medium">
            {format(new Date(data.timestamp), 'MMM dd, HH:mm')}
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-medium">{formatCurrency(data.total)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-success">Realized:</span>
              <span className="font-medium text-success">{formatCurrency(data.realized)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-primary">Unrealized:</span>
              <span className="font-medium text-primary">{formatCurrency(data.unrealized)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-destructive">Fees:</span>
              <span className="font-medium text-destructive">{formatCurrency(data.fees)}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Profit & Loss</CardTitle>
            <CardDescription>Real-time PnL tracking</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {stats.change24h >= 0 ? (
              <TrendingUp className="h-5 w-5 text-success" />
            ) : (
              <TrendingDown className="h-5 w-5 text-destructive" />
            )}
            <span
              className={`text-sm font-medium ${
                stats.change24h >= 0 ? 'text-success' : 'text-destructive'
              }`}
            >
              {formatPercentage(stats.change24h)} 24h
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-sm text-muted-foreground">Total PnL</p>
            <p className="text-2xl font-bold">{formatCurrency(stats.total)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Realized</p>
            <p className="text-2xl font-bold text-success">{formatCurrency(stats.realized)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Unrealized</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(stats.unrealized)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Fees</p>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(stats.fees)}</p>
          </div>
        </div>

        <div className="h-[300px] w-full">
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorRealized" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorUnrealized" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(ts) => format(new Date(ts), 'HH:mm')}
                  className="text-xs text-muted-foreground"
                />
                <YAxis
                  tickFormatter={(value) => `$${value.toFixed(0)}`}
                  className="text-xs text-muted-foreground"
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="realized"
                  stroke="hsl(var(--success))"
                  fillOpacity={1}
                  fill="url(#colorRealized)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="unrealized"
                  stroke="hsl(var(--primary))"
                  fillOpacity={1}
                  fill="url(#colorUnrealized)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-muted-foreground">Waiting for data...</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
