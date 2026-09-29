import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type SettingsState = {
  /** 0..1 */
  volume: number;
  /** Velocidad de habla; 1 = normal. */
  rate: number;
  setVolume: (v: number) => void;
  setRate: (r: number) => void;
};

// Preferencias no sensibles: AsyncStorage es apropiado (los tokens NO van aquí).
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      volume: 1,
      rate: 1,
      setVolume: (volume) => set({ volume }),
      setRate: (rate) => set({ rate }),
    }),
    { name: 'senavoz.settings', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
