/**
 * Ambient type declaration for socket.io-client.
 *
 * This allows TypeScript to type-check dynamic imports without requiring
 * the package to be installed. The actual module is loaded at runtime
 * inside a try-catch in notification-store.ts — if the package is missing,
 * the system degrades gracefully to polling-based sync.
 */
declare module 'socket.io-client' {
  interface SocketOptions {
    query?: Record<string, string>;
    auth?: Record<string, string>;
    transports?: string[];
    reconnection?: boolean;
    reconnectionAttempts?: number;
    reconnectionDelay?: number;
    reconnectionDelayMax?: number;
    timeout?: number;
  }

  interface Socket {
    on(event: string, callback: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): this;
    removeAllListeners(): this;
    disconnect(): this;
    connected: boolean;
    id: string;
  }

  interface SocketIOStatic {
    (options?: SocketOptions): Socket;
  }

  export const io: SocketIOStatic;
}
