import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Meeting from '@/routes/Meeting';
import { useMeeting } from '@/store/meeting';
import { usePlayback } from '@/store/playback';
import { useSettings } from '@/store/settings';
import { installFakeSenavoz } from '@/test/fakeSenavoz';

const speak = vi.fn();
const stop = vi.fn();
vi.mock('@/services/speech', () => ({
  speechService: {
    speak: (...a: unknown[]) => speak(...a),
    stop: () => stop(),
    warm: async () => {},
  },
}));
vi.mock('@/hooks/useSignRecognition', () => ({
  useSignRecognition: () => ({
    cam: { kind: 'ready' },
    cameras: [],
    recognition: { phase: 'ready', handsDetected: true, modelAvailable: false },
    cameraId: null,
    retry: vi.fn(),
    selectCamera: vi.fn(),
  }),
  visionMessageKey: () => 'camera.handsWithoutModel',
}));
vi.mock('@/api/endpoints', () => ({
  phrasesApi: {
    list: async () => [
      { id: '1', code: 'yes', text_es: 'Sí', is_default: true },
      { id: '2', code: 'no', text_es: 'No', is_default: true },
    ],
  },
}));

const cable = {
  kind: 'audiooutput',
  deviceId: 'c1',
  label: 'CABLE Input (VB-Audio Virtual Cable)',
};
let outputs: (typeof cable)[] = [];
const changeListeners = new Set<() => void>();
Object.defineProperty(navigator, 'mediaDevices', {
  configurable: true,
  value: {
    enumerateDevices: async () => outputs,
    addEventListener: (_: string, cb: () => void) => changeListeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => changeListeners.delete(cb),
  },
});

let fake: ReturnType<typeof installFakeSenavoz>;

function renderMeeting() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/reunion']}>
        <Routes>
          <Route path="/reunion" element={<Meeting />} />
          <Route path="/frases" element={<p>pantalla frases</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  speak.mockReset();
  stop.mockReset();
  fake = installFakeSenavoz();
  outputs = [cable];
  useSettings.setState({ meetingOutput: null });
  useMeeting.getState().start('c1', []);
  usePlayback.setState({ lastText: null, playing: false, preparing: false, synthError: false });
});

describe('pantalla de Modo reunión', () => {
  it('Ctrl+Alt+N (atajo global) dice la frase N', async () => {
    renderMeeting();
    await screen.findByRole('button', { name: 'Decir: No' });
    act(() => fake.pressShortcut(1));
    expect(speak).toHaveBeenCalledWith({ code: 'no', text: 'No' });
  });

  it('clic en una frase la dice', async () => {
    renderMeeting();
    await userEvent.click(await screen.findByRole('button', { name: 'Decir: Sí' }));
    expect(speak).toHaveBeenCalledWith({ code: 'yes', text: 'Sí' });
  });

  it('muestra "Dijiste" con la última frase', async () => {
    usePlayback.setState({ lastText: 'Gracias', playing: true });
    renderMeeting();
    expect(await screen.findByText('Gracias')).toBeInTheDocument();
    expect(screen.getByText('Dijiste')).toBeInTheDocument();
  });

  it('pausar corta el audio y lo indica', async () => {
    renderMeeting();
    await userEvent.click(await screen.findByRole('button', { name: 'Pausar voz' }));
    expect(useMeeting.getState().paused).toBe(true);
    expect(stop).toHaveBeenCalled();
    expect(screen.getByText('Voz en pausa: no se envía nada.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reanudar voz' })).toBeInTheDocument();
  });

  it('si el micrófono virtual desaparece, avisa y marca el dispositivo como ausente', async () => {
    renderMeeting();
    await screen.findByRole('button', { name: 'Decir: Sí' });
    outputs = [];
    await act(async () => changeListeners.forEach((cb) => cb()));
    expect(await screen.findByText(/Los demás no te oyen/)).toBeInTheDocument();
    expect(useMeeting.getState().deviceMissing).toBe(true);
  });

  it('muestra los atajos ocupados', async () => {
    useMeeting.getState().start('c1', ['Control+Alt+2']);
    renderMeeting();
    expect(await screen.findByText(/Control\+Alt\+2/)).toBeInTheDocument();
  });

  it('salir del modo restaura la ventana y vuelve a Frases', async () => {
    renderMeeting();
    await userEvent.click(await screen.findByRole('button', { name: 'Salir del modo' }));
    expect(fake.api.meeting.exit).toHaveBeenCalled();
    expect(await screen.findByText('pantalla frases')).toBeInTheDocument();
    expect(useMeeting.getState().active).toBe(false);
  });
});
