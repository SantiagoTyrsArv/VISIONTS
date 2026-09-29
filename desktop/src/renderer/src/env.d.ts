/// <reference types="vite/client" />
import type { SenavozApi } from '../../shared/ipc';

declare global {
  interface Window {
    senavoz: SenavozApi;
  }
  interface ImportMetaEnv {
    readonly RENDERER_VITE_API_URL?: string;
  }
}
export {};
