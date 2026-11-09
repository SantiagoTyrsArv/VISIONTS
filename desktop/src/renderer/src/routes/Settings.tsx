import { motion } from 'motion/react';
import { useEffect, useId, useState } from 'react';

import { queryClient } from '@/api/queryClient';
import { t } from '@/i18n';
import { listCameras } from '@/services/camera/camera';
import { useSession } from '@/store/session';
import { useSettings } from '@/store/settings';
import { Button } from '@/ui/Button';
import { useEnter } from '@/ui/motion/useEnter';

import styles from './routes.module.css';
import { MeetingSection } from './settings/MeetingSection';
import { VoiceSection } from './settings/VoiceSection';

export default function Settings() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const cameraId = useSettings((s) => s.cameraId);
  const setCameraId = useSettings((s) => s.setCameraId);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);
  const cameraSelectId = useId();
  const enter = useEnter();

  useEffect(() => {
    listCameras().then(setCameras, () => setCameras([]));
  }, []);

  const onLogout = async () => {
    setLoggingOut(true);
    await logout();
    queryClient.clear();
  };

  return (
    <div className={`${styles.page} ${styles.settingsPage}`}>
      <h1 className={styles.title}>{t('settings.title')}</h1>

      <motion.div {...enter(0)}>
        <MeetingSection />
      </motion.div>
      <motion.div {...enter(1)}>
        <VoiceSection />
      </motion.div>

      {cameras.length > 0 ? (
        <motion.section className={styles.section} {...enter(2)}>
          <div className={styles.row}>
            <h2 className={styles.sectionTitle}>{t('settings.cameraTitle')}</h2>
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
          </div>
        </motion.section>
      ) : null}

      <motion.section
        className={styles.section}
        aria-label={t('settings.creditsTitle')}
        {...enter(3)}
      >
        <h2 className={styles.sectionTitle}>{t('settings.creditsTitle')}</h2>
        <p className={styles.muted}>{t('settings.credits')}</p>
      </motion.section>

      <motion.section className={styles.section} aria-label={t('settings.profile')} {...enter(4)}>
        <div className={styles.row}>
          <div className={styles.profile}>
            <span className={styles.avatar} aria-hidden>
              {user?.display_name.charAt(0).toUpperCase()}
            </span>
            <div>
              <p className={styles.name}>{user?.display_name}</p>
              <p className={styles.muted}>{user?.email}</p>
            </div>
          </div>
          <Button
            variant="danger"
            label={loggingOut ? t('settings.loggingOut') : t('settings.logout')}
            ariaLabel={t('settings.logout')}
            loading={loggingOut}
            onClick={() => void onLogout()}
          />
        </div>
      </motion.section>
    </div>
  );
}
