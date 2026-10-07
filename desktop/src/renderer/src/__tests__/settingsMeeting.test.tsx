import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Settings from '@/routes/Settings';
import { useMeeting } from '@/store/meeting';
import { useSession } from '@/store/session';
import { useSettings } from '@/store/settings';
import { installFakeSenavoz } from '@/test/fakeSenavoz';

const speak = vi.fn();
vi.mock('@/services/speech', () => ({
  speechService: { speak: (...a: unknown[]) => speak(...a), stop: vi.fn() },
}));
vi.mock('@/services/camera/camera', () => ({ listCameras: async () => [] }));

const cable = {
  kind: 'audiooutput',
  deviceId: 'c1',
  label: 'CABLE Input (VB-Audio Virtual Cable)',
};
const speakers = { kind: 'audiooutput', deviceId: 's1', label: 'Altavoces (Realtek(R) Audio)' };
let outputs: (typeof cable)[] = [];
Object.defineProperty(navigator, 'mediaDevices', {
  configurable: true,
  value: {
    enumerateDevices: async () => outputs,
    addEventListener: () => {},
    removeEventListener: () => {},
  },
});

function renderSettings(needCable = false) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/ajustes', state: needCable ? { needCable: true } : null }]}
    >
      <Settings />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  installFakeSenavoz();
  speak.mockReset();
  outputs = [speakers];
  useMeeting.setState({ failedShortcuts: [] });
  useSettings.setState({ meetingOutput: null, voiceId: null });
  useSession.setState({
    status: 'authenticated',
    user: { id: '1', email: 'a@b.c', display_name: 'A', is_active: true, created_at: '' },
    logout: vi.fn(async () => {}),
  });
});

describe('ajustes › reunión', () => {
  it('sin VB-Cable muestra los pasos y el enlace de descarga', async () => {
    renderSettings();
    expect(await screen.findByText('Falta instalar VB-Cable')).toBeInTheDocument();
    expect(screen.getByText('Descarga VB-Cable desde la web de VB-Audio.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Descargar VB-Cable' })).toHaveAttribute(
      'href',
      'https://vb-audio.com/Cable/',
    );
  });

  it('al instalarlo y comprobar de nuevo, lo detecta', async () => {
    renderSettings();
    await screen.findByText('Falta instalar VB-Cable');
    outputs = [speakers, cable];
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar de nuevo' }));
    expect(await screen.findByText('VB-Cable detectado')).toBeInTheDocument();
  });

  it('con VB-Cable: recordatorio de CABLE Output y prueba por el cable', async () => {
    outputs = [speakers, cable];
    renderSettings();
    expect(await screen.findByText('VB-Cable detectado')).toBeInTheDocument();
    expect(screen.getByText(/CABLE Output/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Probar en la reunión' }));
    expect(speak).toHaveBeenCalledWith('Hola, así sonará mi voz', 'c1');
  });

  it('elegir otra salida la guarda con id y etiqueta', async () => {
    outputs = [speakers, cable];
    renderSettings();
    await screen.findByText('VB-Cable detectado');
    await userEvent.selectOptions(screen.getByLabelText('Salida de la voz en reunión'), 's1');
    expect(useSettings.getState().meetingOutput).toEqual({ id: 's1', label: speakers.label });
  });

  it('si llega desde "Modo reunión" sin cable, explica por qué', async () => {
    renderSettings(true);
    expect(
      await screen.findByText('Instala VB-Cable para usar el Modo reunión.'),
    ).toBeInTheDocument();
  });

  it('lista los atajos que no se pudieron registrar', async () => {
    outputs = [cable];
    useMeeting.setState({ failedShortcuts: ['Control+Alt+2'] });
    renderSettings();
    expect(await screen.findByText(/Control\+Alt\+2/)).toBeInTheDocument();
  });
});
