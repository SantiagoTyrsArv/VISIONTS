export type StepStatus = 'pending' | 'active' | 'done';

export type StartupInput = {
  session: 'loading' | 'authenticated' | 'unauthenticated';
  model: 'loading' | 'ready' | 'error';
  /** `done` cuando hay datos o la carga falló. */
  phrases: 'loading' | 'done';
};

export type StartupStep = { key: 'session' | 'model' | 'phrases'; status: StepStatus };

/** Pasos reales del arranque. Sin sesión solo cuenta comprobarla; el resto no se espera. */
export function startupSteps(i: StartupInput): {
  steps: StartupStep[];
  finished: boolean;
  progress: number;
} {
  let steps: StartupStep[];
  if (i.session === 'loading') {
    steps = [
      { key: 'session', status: 'active' },
      { key: 'model', status: 'pending' },
      { key: 'phrases', status: 'pending' },
    ];
  } else if (i.session === 'unauthenticated') {
    steps = [{ key: 'session', status: 'done' }];
  } else {
    steps = [
      { key: 'session', status: 'done' },
      { key: 'model', status: i.model === 'loading' ? 'active' : 'done' },
      { key: 'phrases', status: i.phrases === 'loading' ? 'active' : 'done' },
    ];
  }
  const hechos = steps.filter((s) => s.status === 'done').length;
  return { steps, finished: hechos === steps.length, progress: hechos / steps.length };
}
