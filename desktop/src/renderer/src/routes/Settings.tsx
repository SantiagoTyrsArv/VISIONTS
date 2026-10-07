import { useEffect, useId, useState } from 'react';

import { queryClient } from '@/api/queryClient';
import { t } from '@/i18n';
import { listCameras } from '@/services/camera/camera';
import { speechService } from '@/services/speech';
import { useSpanishVoices } from '@/services/speech/useSpanishVoices';
import { useSession } from '@/store/session';
import { useSettings } from '@/store/settings';
import { Button } from '@/ui/Button';

import styles from './routes.module.css';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v * 100) / 100;

function Stepper({
  label,
  value,
  display,
  onChange,
  step,
  min,
  max,
}: {
  label: string;
  value: number;
  display: string;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
}) {
  return (
    <div className={styles.row}>
      <span>{label}</span>
      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.stepBtn}
          aria-label={`${label} -`}
          onClick={() => onChange(round(clamp(value - step, min, max)))}
        >
          −
        </button>
        <output className={styles.value} aria-label={`${label}: ${display}`}>
          {display}
        </output>
        <button
          type="button"
          className={styles.stepBtn}
          aria-label={`${label} +`}
          onClick={() => onChange(round(clamp(value + step, min, max)))}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const { volume, rate, voiceURI, cameraId, setVolume, setRate, setVoiceURI, setCameraId } =
    useSettings();
  const voices = useSpanishVoices();
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);
  const voiceId = useId();
  const cameraSelectId = useId();

  useEffect(() => {
    listCameras().then(setCameras, () => setCameras([]));
  }, []);

  const onLogout = async () => {
    setLoggingOut(true);
    await logout();
    queryClient.clear();
  };

  return (
    <div className={styles.stack}>
      <h1 className={styles.title}>{t('settings.title')}</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.profile')}</h2>
        <p className={styles.name}>{user?.display_name}</p>
        <p className={styles.muted}>{user?.email}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.voice')}</h2>
        <div className={styles.row}>
          <label htmlFor={voiceId}>{t('settings.voiceName')}</label>
          <select
            id={voiceId}
            className={styles.select}
            value={voiceURI ?? ''}
            onChange={(e) => setVoiceURI(e.target.value || null)}
          >
            <option value="">{t('settings.voiceDefault')}</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {`${v.name} (${v.lang})`}
              </option>
            ))}
          </select>
        </div>
        {voices.length === 0 ? (
          <p className={styles.muted}>{t('settings.noSpanishVoice')}</p>
        ) : null}
        <Stepper
          label={t('settings.volume')}
          value={volume}
          display={`${Math.round(volume * 100)}%`}
          onChange={setVolume}
          step={0.1}
          min={0}
          max={1}
        />
        <Stepper
          label={t('settings.rate')}
          value={rate}
          display={`${rate.toFixed(2)}×`}
          onChange={setRate}
          step={0.25}
          min={0.5}
          max={2}
        />
        <Button
          variant="secondary"
          label={t('settings.test')}
          onClick={() => void speechService.speak(t('settings.testPhrase'))}
        />
      </section>

      {cameras.length > 0 ? (
        <section className={styles.section}>
          <div className={styles.row}>
            <label htmlFor={cameraSelectId}>{t('settings.camera')}</label>
            <select
              id={cameraSelectId}
              className={styles.select}
              value={cameraId ?? ''}
              onChange={(e) => setCameraId(e.target.value || null)}
            >
              <option value="">{t('settings.cameraDefault')}</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </section>
      ) : null}

      <div className={styles.actions}>
        <Button
          variant="danger"
          label={loggingOut ? t('settings.loggingOut') : t('settings.logout')}
          ariaLabel={t('settings.logout')}
          loading={loggingOut}
          onClick={() => void onLogout()}
        />
      </div>
    </div>
  );
}
