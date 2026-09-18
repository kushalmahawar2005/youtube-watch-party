import express from 'express';
import cors from 'cors';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { RoomManager } from './models/RoomManager.js';
import { SocketHandler } from './socket/SocketHandler.js';
import { YouTubeService, YouTubeError } from './services/YouTubeService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

/**
 * Builds Express + HTTP server + Socket.IO on the SAME port.
 * In production Express also serves the built React app, so frontend and
 * WebSocket share one origin (no CORS issues, one deploy).
 */
export function createApp({ corsOrigin = true, socketOptions = {}, youtube = new YouTubeService(process.env.YOUTUBE_API_KEY) } = {}) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: corsOrigin }, pingInterval: 10_000, pingTimeout: 8_000 });
  const roomManager = new RoomManager();

  new SocketHandler(io, roomManager, socketOptions).attach();

  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.round(process.uptime()), ...roomManager.stats() });
  });

  // Used by the Join screen to check a code before connecting
  app.get('/api/rooms/:roomId', (req, res) => {
    const room = roomManager.getRoom(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const host = room.getParticipant(room.hostUserId);
    res.json({ roomId: room.id, participantCount: room.size, hostName: host?.username ?? null });
  });

  // Feature flags for the client (search box is hidden when no API key is set)
  app.get('/api/config', (_req, res) => {
    res.json({ youtubeSearch: youtube.enabled });
  });

  // YouTube Data API proxy: the API key never reaches the browser
  const sendYouTubeError = (res, err) => {
    if (err instanceof YouTubeError) return res.status(err.status).json({ error: err.message });
    console.error('[youtube]', err);
    res.status(500).json({ error: 'Something went wrong.' });
  };

  app.get('/api/youtube/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q || q.length > 100) return res.status(400).json({ error: 'Search text must be 1-100 characters.' });
    try {
      res.json({ items: await youtube.search(q) });
    } catch (err) {
      sendYouTubeError(res, err);
    }
  });

  app.get('/api/youtube/videos', async (req, res) => {
    const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',').filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: 'Pass ?ids=videoId1,videoId2' });
    try {
      res.json({ items: await youtube.getVideos(ids) });
    } catch (err) {
      sendYouTubeError(res, err);
    }
  });

  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    // SPA fallback: /room/ABC123 should load index.html, React Router takes over
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  }

  return { app, server, io, roomManager };
}
