import { useId } from 'react';

import { t } from '@/i18n';
import { speechService } from '@/services/speech';
import { useTtsVoices } from '@/services/speech/useTtsVoices';
import { useSettings } from '@/store/settings';
import { IconPlay } from '@/ui/icons';

import styles from '../routes.module.css';

/** 1 → "1", 1.25 → "1.25", 1.5 → "1.5". */
const formatRate = (rate: number) => `${Number(rate.toFixed(2))}×`;

export function VoiceSection() {
  const { volume, rate, voiceId, setVolume, setRate, setVoiceId } = useSettings();
  const { voices, loaded } = useTtsVoices();
  const voiceSelectId = useId();
  const volumeId = useId();
  const rateId = useId();
  const unavailable = loaded && voiceId !== null && !voices.some((v) => v.id === voiceId);

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t('settings.voice')}</h2>
      <div className={styles.row}>
        <label htmlFor={voiceSelectId}>{t('settings.voiceName')}</label>
        <select
          id={voiceSelectId}
          className={styles.select}
          value={unavailable ? '' : (voiceId ?? '')}
          onChange={(e) => setVoiceId(e.target.value || null)}
        >
          <option value="">{t('settings.voiceDefault')}</option>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {`${v.name} (${v.lang})`}
            </option>
          ))}
        </select>
      </div>
      {loaded && voices.length === 0 ? (
        <p className={styles.muted}>{t('settings.noSpanishVoice')}</p>
      ) : null}
      {unavailable ? <p className={styles.notice}>{t('settings.voiceUnavailable')}</p> : null}

      <div className={styles.row}>
        <label htmlFor={volumeId}>{t('settings.volume')}</label>
        <div className={styles.slider}>
          <input
            id={volumeId}
            type="range"
            min={0}
            max={100}
            step={10}
            value={Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
          />
          <output htmlFor={volumeId}>{`${Math.round(volume * 100)}%`}</output>
        </div>
      </div>
      <div className={styles.row}>
        <label htmlFor={rateId}>{t('settings.rate')}</label>
        <div className={styles.slider}>
          <input
            id={rateId}
            type="range"
            min={50}
            max={200}
            step={25}
            value={Math.round(rate * 100)}
            onChange={(e) => setRate(Number(e.target.value) / 100)}
          />
          <output htmlFor={rateId}>{formatRate(rate)}</output>
        </div>
      </div>
      <div>
        <button
          type="button"
          className={styles.secondaryInline}
          onClick={() => void speechService.speak(t('settings.testPhrase'))}
        >
          <IconPlay size={16} />
          {t('settings.test')}
        </button>
      </div>
    </section>
  );
}
