import { existsSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve } from 'node:path';

import { CROSS_ORIGIN_ISOLATION_HEADERS } from '../shared/crossOriginIsolation';

export const APP_SCHEME = 'app';
export const APP_HOST = 'senavoz';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

export type Resolved = { kind: 'file'; path: string } | { kind: 'notFound' };

/**
 * Traduce una URL app://senavoz/... a un archivo dentro de `root`. Cualquier
 * ruta que (tras decodificar) salga de `root` es 404. Rutas sin archivo → index.html
 * (la app usa HashRouter, pero así una recarga nunca muestra un error).
 */
export function resolveAppPath(
  root: string,
  requestUrl: string,
  fileExists: (p: string) => boolean = existsSync,
): Resolved {
  let url: URL;
  let pathname: string;
  try {
    url = new URL(requestUrl);
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return { kind: 'notFound' };
  }
  if (url.host !== APP_HOST) return { kind: 'notFound' };

  // Barras invertidas de Windows y unidades ("C:") tras decodificar: nunca legítimas.
  const clean = pathname.replaceAll('\\', '/');
  if (clean.includes(':') || clean.split('/').includes('..')) return { kind: 'notFound' };

  const rootAbs = resolve(root);
  const candidate = resolve(rootAbs, normalize('.' + clean));
  const rel = relative(rootAbs, candidate);
  if (rel.startsWith('..') || isAbsolute(rel)) return { kind: 'notFound' };

  if (rel !== '' && fileExists(candidate)) return { kind: 'file', path: candidate };
  return { kind: 'file', path: join(rootAbs, 'index.html') };
}

/**
 * CSP de los scripts servidos por app://. Un worker no hereda la CSP del <meta> de index.html:
 * toma la de la respuesta de su propio script, así que sin esta cabecera el worker de
 * reconocimiento (donde corre MediaPipe) podría conectar con cualquier servidor. Solo necesita
 * la propia app: el WASM, el modelo y el cargador que importa desde un blob (recognition.worker.ts).
 */
export const SCRIPT_CSP =
  "default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'; connect-src 'self'";

/**
 * Añade SCRIPT_CSP a todo lo que no sea un documento HTML. index.html conserva solo la CSP de
 * su <meta>, que incluye la URL de la API; con dos políticas se aplicaría la intersección.
 */
export function withScriptCsp(response: Response, filePath: string): Response {
  if (filePath.toLowerCase().endsWith('.html')) return response;
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', SCRIPT_CSP);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Copia la respuesta añadiendo COOP + COEP (las de net.fetch pueden ser inmutables). */
export function withCrossOriginIsolation(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CROSS_ORIGIN_ISOLATION_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
