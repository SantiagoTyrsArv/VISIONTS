import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveAppPath } from '../appProtocol';

const root = resolve('/app/renderer');
const exists = new Set([join(root, 'index.html'), join(root, 'assets', 'index-abc.js')]);
const fileExists = (p: string) => exists.has(p);

describe('resolveAppPath', () => {
  it('sirve archivos existentes dentro de la raíz', () => {
    expect(resolveAppPath(root, 'app://senavoz/assets/index-abc.js', fileExists)).toEqual({
      kind: 'file',
      path: join(root, 'assets', 'index-abc.js'),
    });
  });

  it('la raíz y rutas desconocidas devuelven index.html', () => {
    const index = { kind: 'file', path: join(root, 'index.html') };
    expect(resolveAppPath(root, 'app://senavoz/', fileExists)).toEqual(index);
    expect(resolveAppPath(root, 'app://senavoz/ajustes', fileExists)).toEqual(index);
  });

  // El parser de URL ya colapsa los segmentos ".." literales; lo importante es
  // que NINGUNA URL resuelva fuera de la raíz (como mucho, cae a index.html).
  it.each([
    'app://senavoz/../secret.txt',
    'app://senavoz/%2e%2e/secret.txt',
    'app://senavoz/assets/%2e%2e/%2e%2e/secret.txt',
  ])('segmentos .. nunca salen de la raíz: %s', (url) => {
    const r = resolveAppPath(root, url, fileExists);
    if (r.kind === 'file') expect(r.path.startsWith(root)).toBe(true);
  });

  // Barras codificadas dentro de un segmento sobreviven al parser: 404 explícito.
  it.each([
    'app://senavoz/%2e%2e%2fsecret.txt',
    'app://senavoz/..%5csecret.txt',
    'app://senavoz/assets%2f..%2f..%2fsecret.txt',
    'app://senavoz/C:%5cWindows%5cwin.ini',
  ])('rechaza escapes codificados: %s', (url) => {
    expect(resolveAppPath(root, url, fileExists)).toEqual({ kind: 'notFound' });
  });

  it('rechaza otro host', () => {
    expect(resolveAppPath(root, 'app://otro/index.html', fileExists)).toEqual({ kind: 'notFound' });
  });
});
