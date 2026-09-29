import { describe, expect, it } from 'vitest';

import { asciiUserAgent } from '../userAgent';

const withAppName =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'SeñaVoz/0.1.0 Chrome/152.0.7977.130 Electron/44.5.0 Safari/537.36';

describe('asciiUserAgent', () => {
  it('sustituye los caracteres no ASCII del nombre de la app', () => {
    // Chromium rechaza las subpeticiones de app:// si el User-Agent no es ASCII.
    const ua = asciiUserAgent(withAppName);
    expect(ua).toContain('SenaVoz/0.1.0');
    expect(/^[\x20-\x7e]*$/.test(ua)).toBe(true);
  });

  it('deja intacto un User-Agent que ya es ASCII', () => {
    const ascii = withAppName.replace('ñ', 'n');
    expect(asciiUserAgent(ascii)).toBe(ascii);
  });
});
