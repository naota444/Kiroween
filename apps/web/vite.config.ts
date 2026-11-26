import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { coreAlias } from '../../vitest.shared';

const LOCAL_SERVER_PORT = process.env['LOCAL_SERVER_PORT'] ?? '8787';

export default defineConfig({
  plugins: [react(), basicSsl()],
  resolve: { alias: coreAlias },
  optimizeDeps: {
    include: ['@doodle-nearby/core > ngeohash'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/ws': {
        target: `ws://127.0.0.1:${LOCAL_SERVER_PORT}`,
        ws: true,
      },
    },
  },
});
