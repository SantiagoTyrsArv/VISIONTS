export type CameraErrorKey =
  | 'camera.permissionDenied'
  | 'camera.noCamera'
  | 'camera.inUse'
  | 'camera.error';

const errorName = (e: unknown) =>
  typeof e === 'object' && e !== null ? (e as { name?: string }).name : undefined;

/** Traduce los errores de getUserMedia a un mensaje claro. */
export function cameraErrorKey(error: unknown): CameraErrorKey {
  switch (errorName(error)) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'camera.permissionDenied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'camera.noCamera';
    case 'NotReadableError':
      return 'camera.inUse';
    default:
      return 'camera.error';
  }
}

type Media = Pick<MediaDevices, 'getUserMedia'>;

/**
 * Abre la webcam preferida; si ya no existe (desenchufada), cae a la
 * predeterminada. Los errores de permiso o de cámara en uso se propagan.
 */
export async function openCamera(
  preferredId: string | null,
  media: Media = navigator.mediaDevices,
): Promise<MediaStream> {
  if (preferredId) {
    try {
      return await media.getUserMedia({ video: { deviceId: { exact: preferredId } }, audio: false });
    } catch (e) {
      if (cameraErrorKey(e) !== 'camera.noCamera') throw e;
    }
  }
  return media.getUserMedia({ video: true, audio: false });
}

export async function listCameras(
  media: Pick<MediaDevices, 'enumerateDevices'> = navigator.mediaDevices,
): Promise<{ id: string; label: string }[]> {
  const devices = await media.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Cámara ${i + 1}` }));
}
