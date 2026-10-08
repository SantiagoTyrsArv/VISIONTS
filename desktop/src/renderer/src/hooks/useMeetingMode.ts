import { useNavigate } from 'react-router';

import { listOutputDevices, resolveMeetingOutput } from '@/services/audio/outputDevice';
import { useMeeting } from '@/store/meeting';
import { useSettings } from '@/store/settings';

/** Entrar y salir del Modo reunión (ventana compacta + voz al micrófono virtual). */
export function useMeetingMode() {
  const navigate = useNavigate();
  return {
    async enter() {
      const devices = await listOutputDevices().catch(() => []);
      const device = resolveMeetingOutput(useSettings.getState().meetingOutput, devices);
      // Sin micrófono virtual nadie te oiría: se lleva a la guía de instalación.
      if (!device) {
        navigate('/ajustes', { state: { needCable: true } });
        return;
      }
      const { failedShortcuts } = await window.senavoz.meeting.enter();
      useMeeting.getState().start(device.id, failedShortcuts);
      navigate('/reunion');
    },
    async exit() {
      await window.senavoz.meeting.exit();
      useMeeting.getState().stop();
      navigate('/frases');
    },
  };
}
