import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, Vite runs on :5173 and forwards API + WebSocket traffic to the Node server on :3001.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
