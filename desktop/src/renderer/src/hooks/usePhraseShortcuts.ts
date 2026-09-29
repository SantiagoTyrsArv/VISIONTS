import { useEffect, useRef } from 'react';

import type { Phrase } from '@/api/types';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Teclas 1–9 reproducen las nueve primeras frases (útil durante una reunión). */
export function usePhraseShortcuts(
  phrases: Phrase[] | undefined,
  onPhrase: (p: Phrase) => void,
): void {
  // Ref para no re-suscribir el listener en cada render.
  const latest = useRef({ phrases, onPhrase });
  useEffect(() => {
    latest.current = { phrases, onPhrase };
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || isTyping(e.target)) return;
      if (!/^[1-9]$/.test(e.key)) return;
      const phrase = latest.current.phrases?.[Number(e.key) - 1];
      if (!phrase) return;
      e.preventDefault();
      latest.current.onPhrase(phrase);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
