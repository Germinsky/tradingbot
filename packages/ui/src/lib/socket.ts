import { io, Socket } from 'socket.io-client';

class SocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private authToken: string | null = null;

  connect(url: string = 'http://localhost:3001', token?: string) {
    if (this.socket?.connected) {
      console.log('Socket already connected');
      return this.socket;
    }

    if (token) {
      this.authToken = token;
    }

    this.socket = io(url, {
      auth: {
        token: this.authToken || this.generateToken(),
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
    return this.socket;
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected:', this.socket?.id);
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error.message);
      this.reconnectAttempts++;
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  on<T = unknown>(event: string, callback: (data: T) => void) {
    this.socket?.on(event, callback);
  }

  off<T = unknown>(event: string, callback?: ((data: T) => void)) {
    if (callback) {
      this.socket?.off(event, callback);
    } else {
      this.socket?.off(event);
    }
  }

  emit(event: string, data?: unknown) {
    this.socket?.emit(event, data);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  private generateToken(): string {
    // Generate a simple token for development
    // In production, this should come from your auth system
    return `bot-dashboard-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  setAuthToken(token: string) {
    this.authToken = token;
    if (this.socket?.connected) {
      this.socket.emit('auth', { token });
    }
  }
}

export const socketClient = new SocketClient();
