import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');

describe('paleta Noche cálida', () => {
  it.each([
    ['--bg', '#121320'],
    ['--surface', '#1A1C2B'],
    ['--surface-side', '#161826'],
    ['--surface-raised', '#24273A'],
    ['--border', '#2E3147'],
    ['--text', '#F5F2EA'],
    ['--text-muted', '#ADB0C4'],
    ['--accent', '#FFB547'],
    ['--accent-text', '#1E1405'],
    ['--live', '#6EDCC0'],
  ])('%s vale %s', (name, value) => {
    expect(css).toMatch(new RegExp(`${name}:\\s*${value};`, 'i'));
  });

  it('para todo con reducir movimiento', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});

describe('microanimaciones de los componentes', () => {
  const read = (file: string) => readFileSync(resolve(__dirname, file), 'utf8');
  const ui = read('../ui/ui.module.css');
  const routes = read('../routes/routes.module.css');

  // Cuerpos de todas las reglas cuyo selector coincide exactamente (juntos).
  const rule = (source: string, selector: string) => {
    const escaped = selector.replaceAll(/[.:()]/g, String.raw`\$&`);
    const re = new RegExp(String.raw`(?:^|\n)\s*${escaped}\s*\{([^}]*)\}`, 'g');
    return [...source.matchAll(re)].map((m) => m[1]).join('\n');
  };

  it.each([
    ['.card:hover', ui],
    ['.button:hover:not(:disabled)', ui],
    ['.navLink:hover', routes],
    ['.meetingBtn:hover', routes],
  ])('%s declara transform', (selector, source) => {
    expect(rule(source, selector)).toMatch(/transform:/);
  });

  it('al pulsar, tarjeta y botón vuelven a su sitio', () => {
    expect(rule(ui, '.card:active')).toMatch(/transform:\s*none/);
    expect(rule(ui, '.button:active:not(:disabled)')).toMatch(/transform:\s*none/);
  });

  it('ninguna transition dura más de 600 ms', () => {
    for (const source of [ui, routes]) {
      for (const [decl] of source.matchAll(/transition:[^;]*;/g)) {
        for (const [, value, unit] of decl.matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/g)) {
          const ms = unit === 's' ? Number(value) * 1000 : Number(value);
          expect(ms).toBeLessThanOrEqual(600);
        }
      }
    }
  });
});
