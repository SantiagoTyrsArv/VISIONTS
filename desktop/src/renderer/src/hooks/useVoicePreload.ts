import { useEffect } from 'react';

import { usePhrases } from '@/api/usePhrases';
import { speechService } from '@/services/speech';
import { usePlayback } from '@/store/playback';
import { useSettings } from '@/store/settings';

/**
 * Genera los audios del catálogo al iniciar sesión y al cambiar voz o velocidad, para
 * que durante la reunión cada frase suene al instante. Espera `delayMs` a que el
 * usuario deje de mover el control de velocidad.
 */
export function useVoicePreload(delayMs = 400): void {
  const { data: phrases } = usePhrases();
  const voiceId = useSettings((s) => s.voiceId);
  const rate = useSettings((s) => s.rate);

  useEffect(() => {
    if (!phrases?.length) return;
    let cancelled = false;
    usePlayback.getState().setPreparing(true);
    const timer = setTimeout(() => {
      speechService
        .warm(phrases.map((p) => p.text_es))
        .then(() => window.senavoz.tts.prune({ voiceId, rate }))
        // Si falla, cada frase se generará al pedirla.
        .catch(() => {})
        .finally(() => {
          if (!cancelled) usePlayback.getState().setPreparing(false);
        });
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phrases, voiceId, rate, delayMs]);
}
