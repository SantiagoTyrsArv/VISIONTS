/**
 * COOP + COEP: con ambas, el renderer queda en crossOriginIsolated y puede usar
 * SharedArrayBuffer (el indicador «worker ocupado», que el hilo principal lee con Atomics).
 * COEP require-corp no rompe nada: fuentes, WASM y modelo son locales (mismo origen) y la
 * API se llama con CORS. Se aplican en app:// (main/index.ts) y en el servidor de desarrollo
 * (electron.vite.config.ts). Comprobación: `self.crossOriginIsolated === true`.
 */
export const CROSS_ORIGIN_ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
} as const;
