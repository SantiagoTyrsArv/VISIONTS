import { NavLink, Outlet } from 'react-router';

import { t } from '@/i18n';

import styles from './routes.module.css';

const links = [
  { to: '/frases', label: 'nav.home' },
  { to: '/camara', label: 'nav.camera' },
  { to: '/ajustes', label: 'nav.settings' },
] as const;

export function AppLayout() {
  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar} aria-label={t('nav.label')}>
        <p className={styles.sidebarBrand}>{t('app.name')}</p>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} className={styles.navLink}>
            {t(l.label)}
          </NavLink>
        ))}
      </nav>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
