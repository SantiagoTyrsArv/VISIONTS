import { describe, expect, it } from 'vitest';

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
