import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Served from the root of its own domain (penstrike.paycoach.app).
  base: '/',
  server: { host: true },
  build: {
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        play: resolve(__dirname, 'play/index.html'),
      },
    },
  },
});
