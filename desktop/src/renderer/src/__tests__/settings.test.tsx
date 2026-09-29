import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Settings from '@/routes/Settings';
import { useSession } from '@/store/session';
import { useSettings } from '@/store/settings';
import { voice } from '@/test/fakeSpeech';

const speak = vi.fn();
vi.mock('@/services/speech', () => ({
  speechService: { speak: (...a: unknown[]) => speak(...a), stop: vi.fn() },
}));
let voices: SpeechSynthesisVoice[] = [];
vi.mock('@/services/speech/useSpanishVoices', () => ({ useSpanishVoices: () => voices }));
vi.mock('@/services/camera/camera', () => ({ listCameras: async () => [] }));

const logout = vi.fn(async () => {});

beforeEach(() => {
  voices = [voice('Helena', 'es-ES', true), voice('Pablo', 'es-ES')];
  logout.mockClear();
  speak.mockReset();
  useSettings.setState({ volume: 1, rate: 1, voiceURI: null, cameraId: null });
  useSession.setState({
    status: 'authenticated',
    user: { id: '1', email: 'ana@example.com', display_name: 'Ana', is_active: true, created_at: '' },
    logout,
  });
});

describe('ajustes', () => {
  it('muestra el perfil', () => {
    render(<Settings />);
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
  });

  it('volumen y velocidad se ajustan y guardan', async () => {
    render(<Settings />);
    await userEvent.click(screen.getByRole('button', { name: 'Volumen -' }));
    await userEvent.click(screen.getByRole('button', { name: 'Velocidad +' }));
    expect(useSettings.getState()).toMatchObject({ volume: 0.9, rate: 1.25 });
  });

  it('elegir una voz la guarda', async () => {
    render(<Settings />);
    await userEvent.selectOptions(screen.getByLabelText('Voz del sistema'), 'uri:Pablo');
    expect(useSettings.getState().voiceURI).toBe('uri:Pablo');
  });

  it('sin voces en español lo avisa', () => {
    voices = [];
    render(<Settings />);
    expect(screen.getByText(/No hay voces en español instaladas/)).toBeInTheDocument();
  });

  it('probar voz habla la frase de prueba', async () => {
    render(<Settings />);
    await userEvent.click(screen.getByRole('button', { name: 'Probar voz' }));
    expect(speak).toHaveBeenCalledWith('Hola, así sonará mi voz');
  });

  it('cerrar sesión llama a logout', async () => {
    render(<Settings />);
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(logout).toHaveBeenCalled();
  });
});
