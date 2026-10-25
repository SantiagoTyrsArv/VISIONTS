import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'electron-vite';
import react from '@vitejs/plugin-react';

// Sin .env, index.html dejaría "%RENDERER_VITE_API_URL%" literal en la CSP y la
// app empaquetada no podría hablar con la API. Mismo valor por defecto que config/env.ts.
// (Las variables de process.env tienen prioridad sobre .env, así que solo se fija si falta en ambos.)
const DEFAULT_API_URL = 'http://localhost:8000';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'RENDERER_VITE_');
  process.env.RENDERER_VITE_API_URL ??= env.RENDERER_VITE_API_URL || DEFAULT_API_URL;
  // style-src de la CSP: el servidor de desarrollo inyecta el CSS en etiquetas <style>; el build
  // lo emite en archivos, así que la app empaquetada no necesita 'unsafe-inline'.
  process.env.RENDERER_VITE_CSP_STYLE_SRC =
    command === 'serve' ? "'self' 'unsafe-inline'" : "'self'";
  return {
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
  };
});
