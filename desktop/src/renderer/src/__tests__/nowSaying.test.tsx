import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlayback } from '@/store/playback';
import { NowSaying } from '@/ui/NowSaying';

const stop = vi.fn();
vi.mock('@/services/speech', () => ({
  speechService: { speak: vi.fn(), stop: () => stop() },
}));

beforeEach(() => {
  stop.mockReset();
  usePlayback.setState({ lastText: null, playing: false });
});

describe('banda «Sonando ahora»', () => {
  it('sin frase dicha no pinta nada', () => {
    const { container } = render(<NowSaying />);
    expect(container.querySelector('section')).toBeNull();
  });

  it('mientras suena muestra «Sonando ahora» y la frase', () => {
    usePlayback.setState({ lastText: 'Hola', playing: true });
    render(<NowSaying />);
    expect(screen.getByText('Sonando ahora')).toBeInTheDocument();
    expect(screen.getByText('Hola')).toBeInTheDocument();
  });

  it('cuando termina se queda como «Lo último que dijiste»', () => {
    usePlayback.setState({ lastText: 'Hola', playing: false });
    render(<NowSaying overlay />);
    expect(screen.getByText('Lo último que dijiste')).toBeInTheDocument();
    expect(screen.queryByText('Sonando ahora')).toBeNull();
  });

  it('«Detener» corta la voz', async () => {
    usePlayback.setState({ lastText: 'Hola', playing: true });
    render(<NowSaying />);
    await userEvent.click(screen.getByRole('button', { name: 'Detener' }));
    expect(stop).toHaveBeenCalled();
  });
});
