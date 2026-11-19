import { Server } from 'socket.io';
import { config } from './config.js';
import { userFromToken } from './middleware/auth.js';
import { getAccess } from './lib/access.js';

let io = null;
// tenantId -> Map<userId, { user, sockets:Set<socketId> }>   (a user with 3 tabs shows once)
const presence = new Map();

// One Socket.IO room per tenant. Events are ONLY ever emitted to a tenant room,
// and a socket can only join the room after a membership check.
export const room = (tenantId) => `tenant:${tenantId}`;

export function emitToTenant(tenantId, event, payload) {
  if (!io) return;
  io.to(room(tenantId)).emit(event, JSON.parse(JSON.stringify(payload)));
}

const presenceList = (tid) => [...(presence.get(tid)?.values() || [])].map((e) => e.user);
const broadcastPresence = (tid) => io.to(room(tid)).emit('presence', { tenantId: tid, users: presenceList(tid) });

function addPresence(tid, socket) {
  if (!presence.has(tid)) presence.set(tid, new Map());
  const users = presence.get(tid);
  const u = socket.data.user;
  if (!users.has(u.id)) users.set(u.id, { user: u, sockets: new Set() });
  users.get(u.id).sockets.add(socket.id);
  broadcastPresence(tid);
}

function removePresence(tid, socket) {
  const users = presence.get(tid);
  const entry = users?.get(socket.data.user.id);
  if (!entry) return;
  entry.sockets.delete(socket.id);
  if (!entry.sockets.size) users.delete(socket.data.user.id);
  if (!users.size) presence.delete(tid);
  broadcastPresence(tid);
}

// Called when a membership is removed: drop the user's live sockets out of the tenant room.
export function kickUser(tenantId, userId) {
  if (!io) return;
  for (const s of io.sockets.sockets.values()) {
    if (s.data.tenantId === String(tenantId) && s.data.user.id === String(userId)) {
      s.leave(room(tenantId));
      removePresence(String(tenantId), s);
      s.data.tenantId = null;
      s.emit('access:revoked', { tenantId: String(tenantId) });
    }
  }
}

export function initSocket(server) {
  io = new Server(server, { cors: { origin: config.corsOrigin } });

  io.use(async (socket, next) => {
    try {
      const user = await userFromToken(socket.handshake.auth?.token);
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = { id: String(user._id), name: user.name, color: user.color };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const leave = () => {
      const tid = socket.data.tenantId;
      if (!tid) return;
      socket.leave(room(tid));
      removePresence(tid, socket);
      socket.data.tenantId = null;
    };

    socket.on('tenant:join', async (tenantId, ack = () => {}) => {
      try {
        const access = await getAccess(socket.data.user.id, tenantId);
        if (!access) return ack({ ok: false, error: 'forbidden' });
        const tid = String(access.tenant._id);
        if (socket.data.tenantId && socket.data.tenantId !== tid) leave(); // one active tenant per socket
        socket.data.tenantId = tid;
        socket.join(room(tid));
        addPresence(tid, socket);
        ack({ ok: true, users: presenceList(tid) });
      } catch {
        ack({ ok: false, error: 'bad request' });
      }
    });

    socket.on('tenant:leave', leave);
    socket.on('disconnect', leave);
  });
}
