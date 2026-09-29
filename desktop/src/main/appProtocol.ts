import { existsSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve } from 'node:path';

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
  const clean = pathname.replace(/\\/g, '/');
  if (clean.includes(':') || clean.split('/').includes('..')) return { kind: 'notFound' };

  const rootAbs = resolve(root);
  const candidate = resolve(rootAbs, normalize('.' + clean));
  const rel = relative(rootAbs, candidate);
  if (rel.startsWith('..') || isAbsolute(rel)) return { kind: 'notFound' };

  if (rel !== '' && fileExists(candidate)) return { kind: 'file', path: candidate };
  return { kind: 'file', path: join(rootAbs, 'index.html') };
}
