import { vi } from 'vitest';

export class FakeUtterance {
  lang = '';
  volume = 1;
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;
  constructor(public text: string) {}
}

export function voice(name: string, lang: string, isDefault = false): SpeechSynthesisVoice {
  return {
    name,
    lang,
    voiceURI: `uri:${name}`,
    default: isDefault,
    localService: true,
  } as SpeechSynthesisVoice;
}

/** speechSynthesis falso: registra cancel/speak y permite emitir voiceschanged. */
export function fakeSynth(initialVoices: SpeechSynthesisVoice[] = []) {
  let voices = initialVoices;
  const target = new EventTarget();
  const synth = {
    cancel: vi.fn(),
    speak: vi.fn(),
    getVoices: () => voices,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  };
  return {
    synth: synth as unknown as SpeechSynthesis,
    raw: synth,
    setVoices(next: SpeechSynthesisVoice[]) {
      voices = next;
      target.dispatchEvent(new Event('voiceschanged'));
    },
  };
}

vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
