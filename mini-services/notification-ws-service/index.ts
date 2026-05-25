/**
 * Notification WebSocket Service (Socket.IO on Bun)
 *
 * Provides real-time broadcast of notification read-state changes
 * across all devices and browser instances for the same user.
 *
 * Architecture:
 *   - Clients connect via Socket.IO through the Caddy gateway (XTransformPort=3001)
 *   - Each connection is mapped to a userId (from auth handshake)
 *   - The Next.js mark-read API calls POST /broadcast to push events to all sockets for a user
 *   - Clients receive 'notification-update' events with the new readIds
 *
 * Port: 3001 (configurable via PORT env var)
 */

import { createServer } from 'http';
import { Server, type Socket } from 'socket.io';

const PORT = parseInt(process.env.PORT || '3001', 10);

// ─── HTTP + Socket.IO Server ──────────────────────────────────────────

const httpServer = createServer((req, res) => {
  // Health check
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'notification-ws', port: PORT, connections: userSockets.size }));
    return;
  }

  // Broadcast endpoint — called by Next.js mark-read API (localhost only)
  if (req.url === '/broadcast' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { userId, readIds } = data;

        if (!userId || !Array.isArray(readIds)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing userId or readIds' }));
          return;
        }

        broadcastToUser(userId, {
          type: 'READ_STATE_CHANGED',
          readIds,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, sentTo: countUserSockets(userId) }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  // Stats endpoint
  if (req.url === '/stats' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      totalConnections: io.engine.clientsCount,
      trackedUsers: userSockets.size,
      totalSockets: [...userSockets.values()].reduce((sum, set) => sum + set.size, 0),
    }));
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

const io = new Server(httpServer, {
  // Use default Socket.IO path '/socket.io/' so the HTTP server's own
  // endpoints (/health, /broadcast, /stats) remain accessible.
  // Client connects via: /socket.io/?EIO=4&transport=...&XTransformPort=3001
  // Caddy matches XTransformPort=3001 and proxies to this service.
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
  },
  // Cleanup stalled connections faster
  pingInterval: 10000,
  pingTimeout: 5000,
});

// ─── Connection Registry ──────────────────────────────────────────────
// Map: userId -> Set<socketId>

const userSockets = new Map<string, Set<string>>();

function countUserSockets(userId: string): number {
  return userSockets.get(userId)?.size ?? 0;
}

function broadcastToUser(userId: string, data: unknown): void {
  const socketIds = userSockets.get(userId);
  if (!socketIds || socketIds.size === 0) return;

  let sent = 0;
  for (const socketId of socketIds) {
    const socket: Socket | undefined = io.sockets.sockets.get(socketId);
    if (socket?.connected) {
      socket.emit('notification-update', data);
      sent++;
    }
  }

  if (sent < socketIds.size) {
    // Clean up disconnected sockets
    for (const socketId of socketIds) {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket?.connected) {
        socketIds.delete(socketId);
      }
    }
    if (socketIds.size === 0) {
      userSockets.delete(userId);
    }
  }

  console.log(
    `[NotificationWS] Broadcast to user ${userId}: ${sent} socket(s), readIds count: ${Array.isArray((data as { readIds?: unknown }).readIds) ? (data as { readIds: unknown[] }).readIds.length : '?'}`
  );
}

// ─── Socket.IO Connection Handling ───────────────────────────────────

io.on('connection', (socket) => {
  const userId = socket.handshake.auth.userId as string | undefined;

  if (!userId) {
    console.log('[NotificationWS] Rejected connection: no userId in auth');
    socket.disconnect();
    return;
  }

  // Register this socket
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId)!.add(socket.id);

  console.log(`[NotificationWS] User ${userId} connected (socket ${socket.id}, total for user: ${countUserSockets(userId)}, total connections: ${io.engine.clientsCount})`);

  // Send current connection count as confirmation
  socket.emit('connected', { userId, socketCount: countUserSockets(userId) });

  socket.on('disconnect', (reason) => {
    userSockets.get(userId)?.delete(socket.id);
    if (userSockets.get(userId)?.size === 0) {
      userSockets.delete(userId);
    }
    console.log(`[NotificationWS] User ${userId} disconnected (${reason}), remaining: ${countUserSockets(userId)}, total: ${io.engine.clientsCount}`);
  });
});

// ─── Start Server ────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[NotificationWS] Socket.IO server running on port ${PORT}`);
  console.log(`[NotificationWS] Endpoints: /health, /broadcast (POST), /stats`);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────

function shutdown() {
  console.log('[NotificationWS] Shutting down...');
  io.close();
  httpServer.close(() => {
    console.log('[NotificationWS] Server closed');
    process.exit(0);
  });
  // Force exit after 5s if graceful shutdown hangs
  setTimeout(() => process.exit(0), 5000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
