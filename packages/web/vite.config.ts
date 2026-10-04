import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const server = process.env.INSEL_SERVER ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': server,
      '/media': server,
      '/socket.io': { target: server, ws: true },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
});
