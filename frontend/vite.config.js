import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API and WebSocket are proxied, so no env vars are needed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
});
