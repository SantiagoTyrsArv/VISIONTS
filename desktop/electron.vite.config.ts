import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {},
  // Bundle completo del preload: requisito de sandbox: true.
  preload: { build: { externalizeDeps: false } },
  renderer: {
    publicDir: resolve('src/renderer/public'),
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
      },
    },
    plugins: [react()],
  },
});
