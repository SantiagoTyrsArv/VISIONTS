import { useId } from 'react';
import { useLocation } from 'react-router';

import { useOutputDevices } from '@/hooks/useOutputDevices';
import { t } from '@/i18n';
import { findCable, resolveMeetingOutput } from '@/services/audio/outputDevice';
import { speechService } from '@/services/speech';
import { useMeeting } from '@/store/meeting';
import { useSettings } from '@/store/settings';
import { Button } from '@/ui/Button';
import { IconCheck } from '@/ui/icons';

import styles from '../routes.module.css';

const VB_CABLE_URL = 'https://vb-audio.com/Cable/';

export function MeetingSection() {
  const { devices, refresh } = useOutputDevices();
  const meetingOutput = useSettings((s) => s.meetingOutput);
  const setMeetingOutput = useSettings((s) => s.setMeetingOutput);
  const failedShortcuts = useMeeting((s) => s.failedShortcuts);
  const needCable = (useLocation().state as { needCable?: boolean } | null)?.needCable === true;
  const outputId = useId();

  const cable = findCable(devices);
  const target = resolveMeetingOutput(meetingOutput, devices);

  return (
    <section
      className={
        needCable && !cable ? `${styles.section} ${styles.sectionHighlight}` : styles.section
      }
    >
      <div className={styles.sectionHead}>
        <div>
          <h2 className={styles.sectionTitle}>{t('settings.meeting')}</h2>
          <p className={styles.muted}>{t('settings.meetingHint')}</p>
        </div>
        {cable ? (
          <span className={styles.badgeLive}>
            <IconCheck size={16} />
            {t('settings.cableDetected')}
          </span>
        ) : (
          <span className={styles.badgeWarn}>{t('settings.cableMissing')}</span>
        )}
      </div>

      {needCable && !cable ? (
        <p className={styles.notice} role="alert">
          {t('settings.needCable')}
        </p>
      ) : null}

      {cable ? (
        <>
          <div className={styles.row}>
            <label htmlFor={outputId}>{t('settings.output')}</label>
            <select
              id={outputId}
              className={styles.select}
              value={meetingOutput?.id ?? ''}
              onChange={(e) => {
                const device = devices.find((d) => d.id === e.target.value);
                setMeetingOutput(device ?? null);
              }}
            >
              <option value="">{t('settings.outputAuto')}</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.callout}>
            <p>{t('settings.pickMic')}</p>
            <Button
              variant="secondary"
              label={t('settings.testMeeting')}
              disabled={!target}
              onClick={() =>
                target && void speechService.speak(t('settings.testPhrase'), target.id)
              }
            />
          </div>
        </>
      ) : (
        <>
          <ol className={styles.steps}>
            <li>{t('settings.cableStep1')}</li>
            <li>{t('settings.cableStep2')}</li>
            <li>{t('settings.cableStep3')}</li>
          </ol>
          <div className={styles.actionsRow}>
            {/* El main abre los enlaces https en el navegador del sistema. */}
            <a className={styles.linkButton} href={VB_CABLE_URL} target="_blank" rel="noreferrer">
              {t('settings.cableDownload')}
            </a>
            <Button variant="secondary" label={t('settings.cableRecheck')} onClick={refresh} />
          </div>
        </>
      )}

      {failedShortcuts.length ? (
        <p className={styles.notice}>
          {t('meeting.shortcutsFailed', { list: failedShortcuts.join(', ') })}
        </p>
      ) : null}
    </section>
  );
}
