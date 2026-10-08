import { useCallback, useEffect, useRef } from 'react';
import { Navigate } from 'react-router';

import type { Phrase } from '@/api/types';
import { usePhrases } from '@/api/usePhrases';
import { useMeetingMode } from '@/hooks/useMeetingMode';
import { useOutputDevices } from '@/hooks/useOutputDevices';
import { usePhraseShortcuts } from '@/hooks/usePhraseShortcuts';
import { useSignRecognition, visionMessageKey } from '@/hooks/useSignRecognition';
import { useVoicePreload } from '@/hooks/useVoicePreload';
import { t } from '@/i18n';
import { resolveMeetingOutput } from '@/services/audio/outputDevice';
import { speechService } from '@/services/speech';
import { useMeeting } from '@/store/meeting';
import { usePlayback } from '@/store/playback';
import { useSettings } from '@/store/settings';
import { IconExpand, IconWave } from '@/ui/icons';

import styles from './meeting.module.css';

const say = (p: Phrase) => void speechService.speak({ code: p.code, text: p.text_es });

export default function Meeting() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { data: phrases } = usePhrases();
  const { exit } = useMeetingMode();
  const active = useMeeting((s) => s.active);
  const paused = useMeeting((s) => s.paused);
  const deviceMissing = useMeeting((s) => s.deviceMissing);
  const failedShortcuts = useMeeting((s) => s.failedShortcuts);
  const togglePause = useMeeting((s) => s.togglePause);
  const setSink = useMeeting((s) => s.setSink);
  const lastText = usePlayback((s) => s.lastText);
  const playing = usePlayback((s) => s.playing);
  const preparing = usePlayback((s) => s.preparing);
  const synthError = usePlayback((s) => s.synthError);
  const meetingOutput = useSettings((s) => s.meetingOutput);
  const { devices, loaded } = useOutputDevices();
  useVoicePreload();

  const phrasesRef = useRef(phrases);
  useEffect(() => {
    phrasesRef.current = phrases;
  });

  const { recognition } = useSignRecognition(videoRef, (code) => {
    const phrase = phrasesRef.current?.find((p) => p.code === code);
    if (phrase) say(phrase);
  });

  // Atajos 1–9 con la ventana enfocada y Ctrl+Alt+1–9 globales con la reunión enfocada.
  usePhraseShortcuts(phrases, say);
  useEffect(
    () =>
      window.senavoz.meeting.onShortcut((index) => {
        const phrase = phrasesRef.current?.[index];
        if (phrase) say(phrase);
      }),
    [],
  );

  // Si el micrófono virtual desaparece (o vuelve), se refleja al momento.
  useEffect(() => {
    if (!loaded) return;
    setSink(resolveMeetingOutput(meetingOutput, devices)?.id ?? null);
  }, [loaded, devices, meetingOutput, setSink]);

  const onTogglePause = useCallback(() => {
    if (!useMeeting.getState().paused) speechService.stop();
    togglePause();
  }, [togglePause]);

  if (!active) return <Navigate to="/frases" replace />;

  return (
    <main className={styles.meeting}>
      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <span className={styles.mark} aria-hidden>
            <IconWave size={16} />
          </span>
          <div>
            <p className={styles.live}>
              <span className={styles.dot} aria-hidden />
              {t('meeting.live')}
            </p>
            <p className={styles.small}>{t('meeting.mic')}</p>
          </div>
        </div>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={t('meeting.expand')}
          onClick={() => void exit()}
        >
          <IconExpand size={18} />
        </button>
      </header>

      <div className={styles.cam}>
        <video ref={videoRef} className={styles.thumb} autoPlay muted playsInline />
        <p className={styles.small}>{t(visionMessageKey(recognition))}</p>
      </div>

      {deviceMissing ? (
        <p className={styles.alert} role="alert">
          {t('meeting.deviceMissing')}
        </p>
      ) : null}
      {synthError ? (
        <p className={styles.alert} role="alert">
          {t('meeting.synthError')}
        </p>
      ) : null}
      {paused ? <p className={styles.note}>{t('meeting.paused')}</p> : null}
      {preparing ? (
        <p className={styles.note} role="status">
          {t('meeting.preparing')}
        </p>
      ) : null}
      {failedShortcuts.length ? (
        <p className={styles.note}>
          {t('meeting.shortcutsFailed', { list: failedShortcuts.join(', ') })}
        </p>
      ) : null}

      <section
        className={playing ? `${styles.said} ${styles.saidPlaying}` : styles.said}
        aria-live="polite"
      >
        <span className={styles.eyebrow}>{t('meeting.said')}</span>
        <span className={styles.saidText}>{lastText ?? t('meeting.nothingYet')}</span>
      </section>

      <div className={styles.grid}>
        {phrases?.slice(0, 9).map((p, i) => (
          <button
            key={p.code}
            type="button"
            className={p.text_es === lastText ? `${styles.key} ${styles.keyActive}` : styles.key}
            aria-label={t('meeting.say', { text: p.text_es })}
            aria-keyshortcuts={`Control+Alt+${i + 1}`}
            onClick={() => say(p)}
          >
            <span className={styles.keyNum} aria-hidden>
              {i + 1}
            </span>
            <span className={styles.keyText}>{p.text_es}</span>
          </button>
        ))}
      </div>

      <p className={styles.small}>{t('meeting.shortcutHint')}</p>

      <footer className={styles.footer}>
        <button type="button" className={styles.ghost} onClick={onTogglePause}>
          {t(paused ? 'meeting.resume' : 'meeting.pause')}
        </button>
        <button type="button" className={styles.solid} onClick={() => void exit()}>
          {t('meeting.exit')}
        </button>
      </footer>
    </main>
  );
}
