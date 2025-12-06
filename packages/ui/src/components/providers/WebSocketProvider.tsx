'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { socketClient } from '@/lib/socket';
import type { ConnectionState } from '@/types/dashboard';

interface WebSocketContextType {
  connected: boolean;
  authenticated: boolean;
  reconnecting: boolean;
  error?: string;
  emit: (event: string, data?: unknown) => void;
  on: <T = unknown>(event: string, callback: (data: T) => void) => void;
  off: <T = unknown>(event: string, callback?: ((data: T) => void)) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    connected: false,
    authenticated: false,
    reconnecting: false,
  });

  useEffect(() => {
    // Connect to WebSocket server
    socketClient.connect(
      process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001'
    );

    const handleConnect = () => {
      setConnectionState({
        connected: true,
        authenticated: true,
        reconnecting: false,
      });
    };

    const handleDisconnect = () => {
      setConnectionState((prev) => ({
        ...prev,
        connected: false,
      }));
    };

    const handleReconnecting = () => {
      setConnectionState((prev) => ({
        ...prev,
        reconnecting: true,
      }));
    };

    const handleError = (error: Error | { message?: string }) => {
      setConnectionState((prev) => ({
        ...prev,
        error: (typeof error === 'object' && error.message) || 'Connection error',
      }));
    };

    socketClient.on('connect', handleConnect);
    socketClient.on('disconnect', handleDisconnect);
    socketClient.on('reconnecting', handleReconnecting);
    socketClient.on('error', handleError);

    return () => {
      socketClient.off('connect', handleConnect as () => void);
      socketClient.off('disconnect', handleDisconnect as () => void);
      socketClient.off('reconnecting', handleReconnecting as () => void);
      socketClient.off('error', handleError as () => void);
      socketClient.disconnect();
    };
  }, []);

  const emit = useCallback((event: string, data?: unknown) => {
    socketClient.emit(event, data);
  }, []);

  const on = useCallback(<T = unknown>(event: string, callback: (data: T) => void) => {
    socketClient.on<T>(event, callback);
  }, []);

  const off = useCallback(<T = unknown>(event: string, callback?: ((data: T) => void)) => {
    socketClient.off(event, callback);
  }, []);

  return (
    <WebSocketContext.Provider
      value={{
        connected: connectionState.connected,
        authenticated: connectionState.authenticated,
        reconnecting: connectionState.reconnecting,
        error: connectionState.error,
        emit,
        on,
        off,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return context;
}
