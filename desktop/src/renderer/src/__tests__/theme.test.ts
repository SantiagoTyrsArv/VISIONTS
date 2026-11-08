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
