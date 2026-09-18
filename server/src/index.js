import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

// Local dev: read the repo-root .env (on Render, env vars are set in the dashboard instead)
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  /* no .env file */
}

const PORT = Number(process.env.PORT) || 3001;
// Comma-separated list of allowed frontend origins. Not needed when the server serves the client itself.
const corsOrigin = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',').map((s) => s.trim()) : true;

const { server, io } = createApp({ corsOrigin });

server.listen(PORT, () => {
  console.log(`🎬 Watch Party server running on http://localhost:${PORT}`);
  if (!process.env.YOUTUBE_API_KEY) console.log('ℹ️  YOUTUBE_API_KEY not set: in-room YouTube search is disabled (links still work).');
});

function shutdown() {
  console.log('Shutting down...');
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
