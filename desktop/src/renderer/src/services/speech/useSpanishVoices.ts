import { useEffect, useState } from 'react';

const spanish = (synth: SpeechSynthesis) =>
  synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'));

/** Voces en español instaladas; se actualiza cuando el sistema termina de cargarlas. */
export function useSpanishVoices(
  synth: SpeechSynthesis = window.speechSynthesis,
): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(() => spanish(synth));
  useEffect(() => {
    const update = () => setVoices(spanish(synth));
    synth.addEventListener('voiceschanged', update);
    update();
    return () => synth.removeEventListener('voiceschanged', update);
  }, [synth]);
  return voices;
}
