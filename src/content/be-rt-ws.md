A WebSocket is a single TCP connection upgraded from HTTP to a persistent, full-duplex channel — the complexity isn't the handshake, it's managing rooms, presence, and what happens when you add a second server.

## The core

**The upgrade handshake:** the client sends an HTTP GET with `Upgrade: websocket` and a `Sec-WebSocket-Key` header. The server responds 101 Switching Protocols. After that, both sides send framed binary messages on the same TCP socket — no HTTP overhead per message.

**Rooms and namespaces** (Socket.IO model): a room is a named set of sockets. `socket.join('room:42')` adds the socket to that set; `io.to('room:42').emit('event', data)` broadcasts to every socket in it. This is the core primitive for per-user or per-resource push.

**Presence** — tracking who is online — requires state: a socket connects → user marked online; socket disconnects → user marked offline. With a single server this is in-memory. With multiple servers you need a shared store (Redis pub/sub or Redis hashes) so Server A can query whether a user connected to Server B is online.

**Scaling:** the standard pattern is Redis adapter for Socket.IO. Every server subscribes to a Redis pub/sub channel; `io.to(room).emit()` publishes to Redis; every server re-emits to local sockets in that room.

```ts
// server.ts — production WebSocket server with rooms and auth
import { createServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { verifyToken } from './auth';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN, credentials: true },
  transports: ['websocket'], // skip long-polling — reduces complexity
});

// Redis adapter for multi-instance scaling
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));

// Auth middleware — runs before 'connection'
io.use(async (socket: Socket, next) => {
  const token = socket.handshake.auth.token as string;
  try {
    socket.data.user = await verifyToken(token);
    next();
  } catch {
    next(new Error('UNAUTHORIZED'));
  }
});

io.on('connection', (socket: Socket) => {
  const { id: userId, orgId } = socket.data.user;

  // Mark presence in Redis
  pubClient.hSet('presence', userId, Date.now().toString());
  io.to(`org:${orgId}`).emit('user:online', { userId });

  // Join org room automatically
  socket.join(`org:${orgId}`);

  socket.on('chat:send', async (payload: { roomId: string; text: string }) => {
    const message = await messageService.save({ userId, ...payload });
    // broadcast to everyone in the room (including sender)
    io.to(`chat:${payload.roomId}`).emit('chat:message', message);
  });

  socket.on('join:room', (roomId: string) => {
    socket.join(`chat:${roomId}`);
  });

  socket.on('disconnect', async () => {
    await pubClient.hDel('presence', userId);
    io.to(`org:${orgId}`).emit('user:offline', { userId });
  });
});
```

## In your project

JARVIS uses a WebSocket for the voice agent loop: the browser sends audio chunks, the server transcribes, runs the tool loop, and streams TTS audio back — all on one persistent connection. The CUBE issue platform serves 1,000+ concurrent users with per-board rooms; when a user updates a card, `io.to('board:42').emit('card:updated', card)` pushes the change to every connected viewer of that board. Without the Redis adapter, two server instances would have isolated socket namespaces and half the users would miss updates.

## Tradeoffs & pitfalls

- WebSocket connections hold a file descriptor on the server. At 10,000 concurrent connections, Node's default `ulimit` (1024) will be exhausted. Increase `ulimit -n 65535` and set `SO_REUSEPORT` in production.
- If a client reconnects after a network blip, it may have missed messages. Implement a sequence number or `lastEventId` so the client can request a replay on reconnect.
- Don't emit to a room from inside `socket.on('connect')` using `io.to()` before the socket has joined — the socket isn't in any room yet. Use `socket.to()` (excludes sender) or wait for `socket.join()` to complete.
- Socket.IO's long-polling fallback is convenient for development but doubles the state management complexity in production. Disable it unless you need IE11 support.

## Top-1% insight

The correct way to handle disconnection is distinguishing between a temporary network drop and a deliberate close. Socket.IO has a `disconnecting` event (socket is about to leave rooms but hasn't yet) and a `disconnect` event (socket is gone). Use `disconnecting` to broadcast a "user left" event while you still have access to `socket.rooms`. More critically, Socket.IO's built-in reconnection will re-fire `connection` — if your presence logic just sets a Redis key on connect and deletes it on disconnect, a rapid reconnect (mobile switching networks) can leave the key deleted when the user is actually online. Use a Redis counter (increment on connect, decrement on disconnect) or a TTL-refreshed key to handle this correctly.
