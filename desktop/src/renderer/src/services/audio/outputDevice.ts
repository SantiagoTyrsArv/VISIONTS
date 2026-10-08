export type OutputDevice = { id: string; label: string };

const CABLE = /CABLE Input/i;
// Chromium añade alias que no son dispositivos reales.
const ALIASES = new Set(['default', 'communications']);

export async function listOutputDevices(
  media: Pick<MediaDevices, 'enumerateDevices'> = navigator.mediaDevices,
): Promise<OutputDevice[]> {
  const devices = await media.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audiooutput' && !ALIASES.has(d.deviceId))
    .map((d) => ({ id: d.deviceId, label: d.label }));
}

/** VB-Cable: en Windows su extremo de reproducción se llama "CABLE Input". */
export const findCable = (devices: OutputDevice[]) =>
  devices.find((d) => CABLE.test(d.label)) ?? null;

/**
 * Dispositivo por el que habla el Modo reunión: el elegido en Ajustes (por id o, si
 * Windows le cambió el id, por etiqueta) o, sin elección, VB-Cable.
 */
export function resolveMeetingOutput(
  saved: OutputDevice | null,
  devices: OutputDevice[],
): OutputDevice | null {
  if (!saved) return findCable(devices);
  return (
    devices.find((d) => d.id === saved.id) ?? devices.find((d) => d.label === saved.label) ?? null
  );
}
