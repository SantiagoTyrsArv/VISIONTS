import type { useSession } from '@/store/session';

type SessionStatus = ReturnType<typeof useSession.getState>['status'];

/** Login, registro y reunión son pantallas aparte; todo lo demás vive en AppLayout. */
function routeGroup(pathname: string): string {
  return ['/login', '/register', '/reunion'].includes(pathname) ? pathname : 'app';
}

/**
 * Grupo que debe verse según la URL y la sesión, y a dónde redirigir si no coinciden. Se decide
 * aquí y no en un guard: así la pantalla saliente pasa a salir en el mismo render en que cambia la
 * sesión, sin desmontarse (y volver a montarse) antes de su fundido. Mientras se restaura la
 * sesión no se pinta nada (grupo `loading`).
 */
export function sessionRoute(
  pathname: string,
  status: SessionStatus,
): { group: string; redirect: string | null } {
  if (status === 'loading') return { group: 'loading', redirect: null };
  const group = routeGroup(pathname);
  if (status === 'unauthenticated' && (group === 'app' || group === '/reunion')) {
    return { group: '/login', redirect: '/login' };
  }
  if (status === 'authenticated' && (group === '/login' || group === '/register')) {
    return { group: 'app', redirect: '/camara' };
  }
  return { group, redirect: null };
}
