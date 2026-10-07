import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useVoicePreload } from '@/hooks/useVoicePreload';
import { usePlayback } from '@/store/playback';
import { useSettings } from '@/store/settings';
import { installFakeSenavoz } from '@/test/fakeSenavoz';

const warm = vi.fn(async (_texts: string[]) => {});
vi.mock('@/services/speech', () => ({ speechService: { warm: (t: string[]) => warm(t) } }));
vi.mock('@/api/endpoints', () => ({
  phrasesApi: {
    list: async () => [
      { id: '1', code: 'yes', text_es: 'Sí', is_default: true },
      { id: '2', code: 'no', text_es: 'No', is_default: true },
    ],
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

let fake: ReturnType<typeof installFakeSenavoz>;
beforeEach(() => {
  warm.mockClear();
  fake = installFakeSenavoz();
  useSettings.setState({ voiceId: 'v1', rate: 1 });
  usePlayback.setState({ preparing: false });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('precarga de voces', () => {
  it('genera el catálogo, poda la caché y marca el progreso', async () => {
    renderHook(() => useVoicePreload(0), { wrapper });
    await waitFor(() => expect(warm).toHaveBeenCalledWith(['Sí', 'No']));
    await waitFor(() =>
      expect(fake.api.tts.prune).toHaveBeenCalledWith({ voiceId: 'v1', rate: 1 }),
    );
    await waitFor(() => expect(usePlayback.getState().preparing).toBe(false));
  });

  it('una ráfaga de cambios de velocidad genera una sola vez', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderHook(() => useVoicePreload(400), { wrapper });
    await waitFor(() => expect(usePlayback.getState().preparing).toBe(true));
    act(() => useSettings.setState({ rate: 1.25 }));
    act(() => useSettings.setState({ rate: 1.5 }));
    act(() => useSettings.setState({ rate: 1.75 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(warm).toHaveBeenCalledTimes(1);
  });
});
