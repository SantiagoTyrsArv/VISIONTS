import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSpanishVoices } from '@/services/speech/useSpanishVoices';
import { fakeSynth, voice } from '@/test/fakeSpeech';

describe('useSpanishVoices', () => {
  it('se rellena cuando llegan las voces (voiceschanged) y filtra a es-*', () => {
    const fake = fakeSynth([]);
    const { result } = renderHook(() => useSpanishVoices(fake.synth));
    expect(result.current).toEqual([]);

    act(() =>
      fake.setVoices([voice('Helena', 'es-ES'), voice('Zira', 'en-US'), voice('Sabina', 'es-MX')]),
    );

    expect(result.current.map((v) => v.name)).toEqual(['Helena', 'Sabina']);
  });
});
