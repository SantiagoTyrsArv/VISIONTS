import { describe, expect, it } from 'vitest';

import {
  findCable,
  listOutputDevices,
  resolveMeetingOutput,
} from '@/services/audio/outputDevice';
import { useMeeting } from '@/store/meeting';

const cable = { id: 'c1', label: 'CABLE Input (VB-Audio Virtual Cable)' };
const speakers = { id: 's1', label: 'Altavoces (Realtek(R) Audio)' };

describe('dispositivos de salida', () => {
  it('lista solo salidas de audio reales (sin los alias default/communications)', async () => {
    const media = {
      enumerateDevices: async () =>
        [
          { kind: 'audiooutput', deviceId: 'default', label: 'Predeterminado' },
          { kind: 'audiooutput', deviceId: 'communications', label: 'Comunicaciones' },
          { kind: 'audiooutput', deviceId: 'c1', label: cable.label },
          { kind: 'audioinput', deviceId: 'm1', label: 'Micrófono' },
        ] as MediaDeviceInfo[],
    };
    expect(await listOutputDevices(media)).toEqual([cable]);
  });

  it('detecta VB-Cable por su etiqueta', () => {
    expect(findCable([speakers, cable])).toEqual(cable);
    expect(findCable([speakers])).toBeNull();
  });

  it('sin elección guardada usa el cable; con elección, la busca por id y luego por etiqueta', () => {
    expect(resolveMeetingOutput(null, [speakers, cable])).toEqual(cable);
    expect(resolveMeetingOutput(speakers, [speakers, cable])).toEqual(speakers);
    const renamed = { id: 'c2', label: cable.label };
    expect(resolveMeetingOutput(cable, [renamed])).toEqual(renamed);
    expect(resolveMeetingOutput(cable, [speakers])).toBeNull();
  });
});

describe('estado de reunión', () => {
  it('start/stop, dispositivo ausente y pausa', () => {
    useMeeting.getState().start('c1', ['Control+Alt+2']);
    expect(useMeeting.getState()).toMatchObject({
      active: true,
      sinkId: 'c1',
      deviceMissing: false,
    });
    useMeeting.getState().setSink(null);
    expect(useMeeting.getState().deviceMissing).toBe(true);
    useMeeting.getState().setSink('c1');
    expect(useMeeting.getState().deviceMissing).toBe(false);
    useMeeting.getState().togglePause();
    expect(useMeeting.getState().paused).toBe(true);
    useMeeting.getState().stop();
    expect(useMeeting.getState()).toMatchObject({ active: false, paused: false });
    // Los atajos fallidos se conservan para mostrarlos en Ajustes.
    expect(useMeeting.getState().failedShortcuts).toEqual(['Control+Alt+2']);
  });
});
