import { describe, expect, it, vi } from 'vitest';

import {
  GeneratedSpeechService,
  type GeneratedSpeechDeps,
  type SpeechRoute,
} from '@/services/speech/GeneratedSpeechService';

function fakeAudio(sinkError?: Error) {
  return {
    src: '',
    volume: 1,
    onended: null as null | (() => void),
    setSinkId: vi.fn(async () => {
      if (sinkError) throw sinkError;
    }),
    play: vi.fn(async () => {}),
    pause: vi.fn(),
  };
}

function setup(
  route: Partial<SpeechRoute> = {},
  { ok = true, sinkError = undefined as Error | undefined } = {},
) {
  const audios: ReturnType<typeof fakeAudio>[] = [];
  const deps = {
    synthesize: vi.fn(async (items: { text: string }[]) =>
      items.map(() =>
        ok ? { ok: true as const, wav: new ArrayBuffer(8) } : { ok: false as const, error: 'x' },
      ),
    ),
    options: () => ({ volume: 0.4, rate: 1, voiceId: 'v1' }),
    route: () => ({ meeting: false, sinkId: '', blocked: false, ...route }),
    fallback: { speak: vi.fn(async () => {}), stop: vi.fn() },
    events: { onSpoken: vi.fn(), onPlaying: vi.fn(), onError: vi.fn() },
    createAudio: () => {
      const a = fakeAudio(sinkError);
      audios.push(a);
      return a as unknown as HTMLAudioElement;
    },
    toUrl: () => 'blob:x',
  } satisfies GeneratedSpeechDeps;
  return { svc: new GeneratedSpeechService(deps), deps, audios };
}

describe('GeneratedSpeechService', () => {
  it('fuera de reunión reproduce el audio generado por la salida predeterminada', async () => {
    const { svc, deps, audios } = setup();
    await svc.speak({ code: 'yes', text: 'Sí' });
    expect(deps.synthesize).toHaveBeenCalledWith([{ text: 'Sí', voiceId: 'v1', rate: 1 }]);
    expect(audios[0].setSinkId).toHaveBeenCalledWith('');
    expect(audios[0].volume).toBe(0.4);
    expect(audios[0].play).toHaveBeenCalled();
    expect(deps.events.onSpoken).toHaveBeenCalledWith('Sí');
    expect(deps.events.onPlaying).toHaveBeenCalledWith(true);
  });

  it('en reunión envía el audio al dispositivo del cable', async () => {
    const { svc, audios } = setup({ meeting: true, sinkId: 'cable' });
    await svc.speak('Hola');
    expect(audios[0].setSinkId).toHaveBeenCalledWith('cable');
  });

  it('reutiliza el audio ya generado', async () => {
    const { svc, deps } = setup();
    await svc.speak('Hola');
    await svc.speak('Hola');
    expect(deps.synthesize).toHaveBeenCalledTimes(1);
  });

  it('en reunión, si falla la síntesis no usa speechSynthesis (altavoces) y avisa', async () => {
    const { svc, deps, audios } = setup({ meeting: true, sinkId: 'cable' }, { ok: false });
    await svc.speak('Hola');
    expect(deps.fallback.speak).not.toHaveBeenCalled();
    expect(audios).toHaveLength(0);
    expect(deps.events.onError).toHaveBeenCalledWith('synth');
  });

  it('fuera de reunión, si falla la síntesis usa la voz del sistema', async () => {
    const { svc, deps } = setup({}, { ok: false });
    await svc.speak('Hola');
    expect(deps.fallback.speak).toHaveBeenCalledWith('Hola');
    expect(deps.events.onSpoken).toHaveBeenCalledWith('Hola');
  });

  it('en reunión con la voz en pausa o sin dispositivo no suena nada', async () => {
    const { svc, deps, audios } = setup({ meeting: true, sinkId: 'cable', blocked: true });
    await svc.speak('Hola');
    expect(deps.synthesize).not.toHaveBeenCalled();
    expect(deps.fallback.speak).not.toHaveBeenCalled();
    expect(audios).toHaveLength(0);
  });

  it('si setSinkId falla en reunión, no reproduce y marca el dispositivo como perdido', async () => {
    const { svc, deps, audios } = setup(
      { meeting: true, sinkId: 'cable' },
      { sinkError: new Error('NotFoundError') },
    );
    await svc.speak('Hola');
    expect(audios[0].play).not.toHaveBeenCalled();
    expect(deps.events.onError).toHaveBeenCalledWith('device');
    expect(deps.fallback.speak).not.toHaveBeenCalled();
  });

  it('sinkOverride manda una prueba al cable aunque no haya reunión', async () => {
    const { svc, audios } = setup();
    await svc.speak('Prueba', 'cable');
    expect(audios[0].setSinkId).toHaveBeenCalledWith('cable');
  });

  it('warm genera en un lote solo lo que falta', async () => {
    const { svc, deps } = setup();
    await svc.speak('Sí');
    deps.synthesize.mockClear();
    await svc.warm(['Sí', 'No', 'No', 'Gracias']);
    expect(deps.synthesize).toHaveBeenCalledTimes(1);
    expect(deps.synthesize).toHaveBeenCalledWith([
      { text: 'No', voiceId: 'v1', rate: 1 },
      { text: 'Gracias', voiceId: 'v1', rate: 1 },
    ]);
  });

  it('al terminar el audio avisa de que ya no suena; stop corta y avisa', async () => {
    const { svc, deps, audios } = setup();
    await svc.speak('Hola');
    audios[0].onended!();
    expect(deps.events.onPlaying).toHaveBeenLastCalledWith(false);
    await svc.speak('Otra');
    svc.stop();
    expect(audios[1].pause).toHaveBeenCalled();
    expect(deps.fallback.stop).toHaveBeenCalled();
    expect(deps.events.onPlaying).toHaveBeenLastCalledWith(false);
  });
});
