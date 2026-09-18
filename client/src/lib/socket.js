import { io } from 'socket.io-client';

/**
 * One shared Socket.IO connection for the whole app.
 * VITE_SERVER_URL is only needed when the frontend is hosted separately (e.g. Netlify + Render).
 * Otherwise it connects to the same origin that served the page.
 */
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export const socket = io(SERVER_URL || undefined, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
});

/** emit + wait for the server's acknowledgement. */
export function emitWithAck(event, payload, timeoutMs = 8000) {
  return new Promise((resolve) => {
    socket.timeout(timeoutMs).emit(event, payload, (err, res) => {
      if (err) resolve({ ok: false, error: { code: 'TIMEOUT', message: 'Server did not respond.' } });
      else resolve(res ?? { ok: false });
    });
  });
}

export const apiUrl = (path) => `${SERVER_URL}${path}`;
