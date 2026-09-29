import { APP_ORIGIN } from './appProtocol';

export function isTrustedOrigin(url: string, devUrl: string | undefined): boolean {
  // Los esquemas propios dan origin "null" en Node: se comparan por prefijo.
  if (url === APP_ORIGIN || url.startsWith(`${APP_ORIGIN}/`)) return true;
  if (devUrl === undefined) return false;
  try {
    return new URL(url).origin === new URL(devUrl).origin;
  } catch {
    return false;
  }
}

/** Solo la cámara (permiso "media") y solo para la propia app. */
export function allowPermission(
  permission: string,
  requestingUrl: string,
  devUrl: string | undefined,
): boolean {
  return permission === 'media' && isTrustedOrigin(requestingUrl, devUrl);
}
