import { describe, expect, it } from 'vitest';

describe('entorno de test', () => {
  it('expone la URL de la API de test', () => {
    expect(import.meta.env.RENDERER_VITE_API_URL).toBe('http://api.test');
  });
});
