import type { FromWorkerMessage, ToWorkerMessage } from '../../../../shared/recognitionProtocol';
import { createDefaultLandmarker } from './handLandmarker';
import { createRecognitionWorker } from './recognitionWorkerCore';

// Hilo de reconocimiento: MediaPipe y la GRU. Toda la lógica está en recognitionWorkerCore.ts.

// tsconfig.web usa la lib DOM; añadir "webworker" choca con ella, así que se tipa a mano
// lo poco que se usa de DedicatedWorkerGlobalScope.
type WorkerScope = {
  postMessage(message: FromWorkerMessage): void;
  close(): void;
  onmessage: ((event: MessageEvent<ToWorkerMessage>) => void) | null;
  /** Gancho que MediaPipe usa para cargar su cargador WASM cuando no hay importScripts. */
  import?: (url: string) => Promise<unknown>;
  ModuleFactory?: unknown;
};
const scope = self as unknown as WorkerScope;

// MediaPipe carga su cargador WASM con importScripts, que no existe en un worker de módulo;
// entonces usa `self.import(url)`. El cargador es un script clásico, y como módulo cambian dos
// cosas: `var ModuleFactory` queda local (MediaPipe la busca en `self`), y en modo estricto la
// función `custom_dbg` que declara dentro de un `if` no existe fuera de él. Se importa como
// módulo con `custom_dbg` declarada antes (mismo comportamiento: console.warn) y una línea
// final que publica ModuleFactory.
const LOADER_PREFIX = 'var custom_dbg = (...args) => console.warn(...args);\n';
const LOADER_SUFFIX = '\nself.ModuleFactory = ModuleFactory;\n';

scope.import = async (url) => {
  const code = await (await fetch(url)).text();
  const blob = new Blob([LOADER_PREFIX, code, LOADER_SUFFIX], { type: 'text/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  try {
    return await import(/* @vite-ignore */ blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
};

const core = createRecognitionWorker({
  post: (message) => scope.postMessage(message),
  close: () => scope.close(),
  now: () => performance.timeOrigin + performance.now(),
  createLandmarker: createDefaultLandmarker,
});

scope.onmessage = (event) => core.handle(event.data);
