import { NavLink, Outlet } from 'react-router';

import { useMeetingMode } from '@/hooks/useMeetingMode';
import { useOutputDevices } from '@/hooks/useOutputDevices';
import { useVoicePreload } from '@/hooks/useVoicePreload';
import { t } from '@/i18n';
import { resolveMeetingOutput } from '@/services/audio/outputDevice';
import { useSettings } from '@/store/settings';
import { Brand } from '@/ui/Brand';
import { IconCamera, IconMeeting, IconPhrases, IconSettings } from '@/ui/icons';

import styles from './routes.module.css';

const links = [
  { to: '/frases', label: 'nav.home', Icon: IconPhrases },
  { to: '/camara', label: 'nav.camera', Icon: IconCamera },
  { to: '/ajustes', label: 'nav.settings', Icon: IconSettings },
] as const;

export function AppLayout() {
  useVoicePreload();
  const { enter } = useMeetingMode();
  const { devices } = useOutputDevices();
  const meetingOutput = useSettings((s) => s.meetingOutput);
  const ready = resolveMeetingOutput(meetingOutput, devices) !== null;

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar} aria-label={t('nav.label')}>
        <Brand />
        <div className={styles.navList}>
          {links.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={styles.navLink}>
              <Icon />
              {t(label)}
            </NavLink>
          ))}
        </div>
        <div className={styles.meetingCard}>
          <p className={styles.statusLine}>
            <span className={ready ? styles.dotLive : styles.dotWarn} aria-hidden />
            {t(ready ? 'meeting.cableReady' : 'meeting.cableMissing')}
          </p>
          <button type="button" className={styles.meetingBtn} onClick={() => void enter()}>
            <IconMeeting size={18} />
            {t('meeting.enter')}
          </button>
        </div>
      </nav>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
