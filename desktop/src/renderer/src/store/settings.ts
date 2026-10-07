import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { OutputDevice } from '@/services/audio/outputDevice';

type SettingsState = {
  /** 0..1 */
  volume: number;
  /** Velocidad de habla; 1 = normal. */
  rate: number;
  /** voiceURI de la voz elegida; null = predeterminada del sistema. */
  voiceURI: string | null;
  /** deviceId de la webcam preferida; null = predeterminada. */
  cameraId: string | null;
  /** Salida del Modo reunión; null = VB-Cable detectado automáticamente. */
  meetingOutput: OutputDevice | null;
  setVolume: (v: number) => void;
  setRate: (r: number) => void;
  setVoiceURI: (uri: string | null) => void;
  setCameraId: (id: string | null) => void;
  setMeetingOutput: (device: OutputDevice | null) => void;
};

// Preferencias no sensibles: localStorage es apropiado (los tokens NO van aquí).
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      volume: 1,
      rate: 1,
      voiceURI: null,
      cameraId: null,
      meetingOutput: null,
      setVolume: (volume) => set({ volume }),
      setRate: (rate) => set({ rate }),
      setVoiceURI: (voiceURI) => set({ voiceURI }),
      setCameraId: (cameraId) => set({ cameraId }),
      setMeetingOutput: (meetingOutput) => set({ meetingOutput }),
    }),
    { name: 'senavoz.settings', storage: createJSONStorage(() => localStorage) },
  ),
);
