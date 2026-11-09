import { describe, expect, it } from 'vitest';

import { startupSteps } from './startupSteps';

describe('pasos del arranque', () => {
  it('con la sesión cargando muestra tres pasos: activo y dos pendientes', () => {
    const r = startupSteps({ session: 'loading', model: 'loading', phrases: 'loading' });
    expect(r.steps).toEqual([
      { key: 'session', status: 'active' },
      { key: 'model', status: 'pending' },
      { key: 'phrases', status: 'pending' },
    ]);
    expect(r.finished).toBe(false);
    expect(r.progress).toBe(0);
  });

  it('sin sesión solo hay un paso y ya terminó', () => {
    const r = startupSteps({ session: 'unauthenticated', model: 'loading', phrases: 'loading' });
    expect(r.steps).toEqual([{ key: 'session', status: 'done' }]);
    expect(r.finished).toBe(true);
    expect(r.progress).toBe(1);
  });

  it('con sesión, modelo y frases cargando quedan dos activos', () => {
    const r = startupSteps({ session: 'authenticated', model: 'loading', phrases: 'loading' });
    expect(r.steps.map((s) => s.status)).toEqual(['done', 'active', 'active']);
    expect(r.finished).toBe(false);
    expect(r.progress).toBeCloseTo(1 / 3);
  });

  it('un error del modelo cuenta como paso hecho', () => {
    const r = startupSteps({ session: 'authenticated', model: 'error', phrases: 'done' });
    expect(r.steps.every((s) => s.status === 'done')).toBe(true);
    expect(r.finished).toBe(true);
    expect(r.progress).toBe(1);
  });
});
