import { io } from 'socket.io-client';
import { SOCKET_URL, getToken } from './api';

let socket = null;

// One socket per signed-in user. Rooms are joined per tenant ("tenant:join"), see useBoard.
export function connectSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: (cb) => cb({ token: getToken() }),
      reconnection: true,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
