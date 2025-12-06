'use client';

import { WifiOff, AlertCircle } from 'lucide-react';
import { useWebSocket } from '@/components/providers/WebSocketProvider';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

export function ConnectionStatus() {
  const { connected, authenticated, reconnecting, error } = useWebSocket();

  if (connected && authenticated && !error) {
    return null; // Don't show when everything is fine
  }

  return (
    <Card className="border-l-4 border-l-destructive bg-destructive/10">
      <div className="flex items-center gap-3 p-4">
        {reconnecting ? (
          <>
            <WifiOff className="h-5 w-5 animate-pulse text-destructive" />
            <div className="flex-1">
              <p className="font-medium">Reconnecting...</p>
              <p className="text-sm text-muted-foreground">
                Attempting to reconnect to bot server
              </p>
            </div>
            <Badge variant="outline">Reconnecting</Badge>
          </>
        ) : !connected ? (
          <>
            <WifiOff className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="font-medium">Disconnected</p>
              <p className="text-sm text-muted-foreground">
                Unable to connect to bot server
              </p>
            </div>
            <Badge variant="destructive">Offline</Badge>
          </>
        ) : error ? (
          <>
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="font-medium">Connection Error</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Badge variant="destructive">Error</Badge>
          </>
        ) : null}
      </div>
    </Card>
  );
}
