import { describe, expect, it } from 'vitest';

import { allowPermission, isTrustedOrigin } from '../security';

const dev = 'http://localhost:5173';

describe('isTrustedOrigin', () => {
  it('acepta app://senavoz y el servidor de desarrollo', () => {
    expect(isTrustedOrigin('app://senavoz/index.html', undefined)).toBe(true);
    expect(isTrustedOrigin('app://senavoz', undefined)).toBe(true);
    expect(isTrustedOrigin('http://localhost:5173/#/frases', dev)).toBe(true);
  });

  it('rechaza el resto', () => {
    expect(isTrustedOrigin('http://localhost:5173/', undefined)).toBe(false);
    expect(isTrustedOrigin('https://evil.example/', dev)).toBe(false);
    expect(isTrustedOrigin('app://otro/', dev)).toBe(false);
    expect(isTrustedOrigin('app://senavoz.evil/', dev)).toBe(false);
    expect(isTrustedOrigin('no es url', dev)).toBe(false);
  });
});

describe('allowPermission', () => {
  it('solo concede media a orígenes propios', () => {
    expect(allowPermission('media', 'app://senavoz/', undefined)).toBe(true);
    expect(allowPermission('media', 'https://evil.example/', undefined)).toBe(false);
    expect(allowPermission('geolocation', 'app://senavoz/', undefined)).toBe(false);
    expect(allowPermission('notifications', 'app://senavoz/', undefined)).toBe(false);
  });

  it('concede speaker-selection (setSinkId) solo a orígenes propios', () => {
    expect(allowPermission('speaker-selection', 'app://senavoz/', undefined)).toBe(true);
    expect(allowPermission('speaker-selection', 'https://evil.example/', undefined)).toBe(false);
  });
});
