import { describe, expect, it, vi } from 'vitest';

import { CachedAudioSpeechService } from '@/services/speech/CachedAudioSpeechService';
import { WebSpeechService } from '@/services/speech/WebSpeechService';
import { fakeSynth, voice } from '@/test/fakeSpeech';

const helena = voice('Helena', 'es-ES', true);
const pablo = voice('Pablo', 'es-ES');

describe('WebSpeechService', () => {
  it('cancela lo anterior y habla con voz, volumen y velocidad de ajustes', async () => {
    const { synth, raw } = fakeSynth([helena, pablo]);
    const svc = new WebSpeechService(
      () => ({ volume: 0.5, rate: 1.25, voiceURI: 'uri:Pablo' }),
      synth,
    );

    await svc.speak({ code: 'hello', text: 'Hola' });

    expect(raw.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      raw.speak.mock.invocationCallOrder[0],
    );
    const u = raw.speak.mock.calls[0][0];
    expect(u).toMatchObject({ text: 'Hola', lang: 'es-ES', volume: 0.5, rate: 1.25 });
    expect(u.voice).toBe(pablo);
  });

  it('si la voz guardada ya no existe, usa la predeterminada (voice = null)', async () => {
    const { synth, raw } = fakeSynth([helena]);
    const svc = new WebSpeechService(
      () => ({ volume: 1, rate: 1, voiceURI: 'uri:Desinstalada' }),
      synth,
    );

    await svc.speak('Hola');

    expect(raw.speak.mock.calls[0][0].voice).toBeNull();
  });
});

describe('CachedAudioSpeechService', () => {
  it('sin audio para el código delega en el fallback', async () => {
    const fallback = { speak: vi.fn(async () => {}), stop: vi.fn() };
    const svc = new CachedAudioSpeechService(fallback, () => ({
      volume: 1,
      rate: 1,
      voiceURI: null,
    }));
    await svc.speak({ code: 'yes', text: 'Sí' });
    expect(fallback.speak).toHaveBeenCalledWith({ code: 'yes', text: 'Sí' });
  });

  it('con audio para el código lo reproduce con el volumen de ajustes', async () => {
    const fallback = { speak: vi.fn(async () => {}), stop: vi.fn() };
    const audio = { volume: 1, play: vi.fn(async () => {}), pause: vi.fn() };
    const svc = new CachedAudioSpeechService(
      fallback,
      () => ({ volume: 0.3, rate: 1, voiceURI: null }),
      { yes: 'blob:yes' },
      () => audio as unknown as HTMLAudioElement,
    );
    await svc.speak({ code: 'yes', text: 'Sí' });
    expect(audio.play).toHaveBeenCalled();
    expect(audio.volume).toBe(0.3);
    expect(fallback.speak).not.toHaveBeenCalled();
  });
});
