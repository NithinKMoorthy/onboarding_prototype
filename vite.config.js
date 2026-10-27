import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Loopback only: the prototype has no authentication, so it must not be reachable from other machines.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
