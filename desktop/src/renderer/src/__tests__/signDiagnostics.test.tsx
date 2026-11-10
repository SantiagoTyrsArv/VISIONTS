import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_LONG_TASKS, shortTarget } from '@/services/recognition/perfMonitor';

import { useSignDiagnostics } from '@/store/signDiagnostics';
import { SignDiagnostics } from '@/ui/SignDiagnostics';

const names = { good_morning: 'Buenos días', good_afternoon: 'Buenas tardes' };

describe('SignDiagnostics', () => {
  beforeEach(() => {
    useSignDiagnostics.setState({
      probabilities: null,
      trace: null,
      longTasks: EMPTY_LONG_TASKS,
      inp: null,
      inpByThread: {},
      execution: null,
    });
  });

  const probabilityRows = () =>
    within(screen.getByRole('list', { name: 'Lo que ve el modelo' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent);

  it('sin lectura explica que el modelo no se ejecuta', () => {
    render(<SignDiagnostics names={names} />);
    expect(screen.getByText(/el modelo no se ejecuta/i)).toBeInTheDocument();
  });

  it('muestra cada clase con su porcentaje, la más probable primero', () => {
    render(<SignDiagnostics names={names} />);
    act(() =>
      useSignDiagnostics
        .getState()
        .update({ good_morning: 0.62, good_afternoon: 0.08, neutral: 0.3 }),
    );

    expect(probabilityRows()).toEqual([
      expect.stringContaining('Buenos días62 %'),
      expect.stringContaining('Sin seña (neutral)30 %'),
      expect.stringContaining('Buenas tardes8 %'),
    ]);
    // 62 % no llega al umbral: se indica que no se diría.
    expect(screen.getByText(/bajo el umbral/i)).toBeInTheDocument();
  });

  it('indica cuándo la seña más probable supera el umbral', () => {
    render(<SignDiagnostics names={names} />);
    act(() => useSignDiagnostics.getState().update({ good_morning: 0.91, neutral: 0.09 }));
    expect(screen.getByText(/supera el umbral/i)).toBeInTheDocument();
  });

  it('clear vuelve al estado sin lectura', () => {
    render(<SignDiagnostics names={names} />);
    act(() => useSignDiagnostics.getState().update({ good_morning: 0.91, neutral: 0.09 }));
    act(() => useSignDiagnostics.getState().clear());
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('dice si hay crossOriginIsolated y dónde corre el reconocimiento', () => {
    useSignDiagnostics.setState({ execution: 'worker-shared' });
    render(<SignDiagnostics names={names} />);
    expect(screen.getByText('crossOriginIsolated').nextSibling).toHaveTextContent('no');
    expect(screen.getByText(/worker · ocupado\/libre por SharedArrayBuffer/)).toBeInTheDocument();
  });

  it('el botón cambia de modo para medir el INP del otro', async () => {
    useSignDiagnostics.setState({ execution: 'worker-shared' });
    const onSwitchThread = vi.fn();
    render(<SignDiagnostics names={names} onSwitchThread={onSwitchThread} />);
    await userEvent.click(screen.getByRole('button', { name: /hilo principal/i }));
    expect(onSwitchThread).toHaveBeenCalledWith('main');
  });

  it('muestra el orden de ejecución del último ciclo con su cola', () => {
    render(<SignDiagnostics names={names} />);
    act(() =>
      useSignDiagnostics.getState().setTrace({
        total: 14.2,
        steps: [
          { id: 'frame', kind: 'task', start: 0, duration: 0.2 },
          { id: 'capture', kind: 'microtask', start: 0.2, duration: 0.05 },
          { id: 'workerDetect', kind: 'worker', start: 1.1, duration: 9.6 },
          { id: 'workerInfer', kind: 'worker', start: 10.8, duration: 1.8 },
          { id: 'message', kind: 'task', start: 14, duration: 0.2 },
        ],
      }),
    );
    const steps = within(screen.getByRole('list', { name: /event loop/i }))
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(steps).toEqual([
      expect.stringMatching(/^Callback de requestVideoFrameCallback.*task\+0,0 ms0,2 ms$/),
      expect.stringMatching(/^createImageBitmap y postMessage.*microtask\+0,2 ms< 0,1 ms$/),
      expect.stringMatching(/^MediaPipe en el worker.*otro hilo\+1,1 ms9,6 ms$/),
      expect.stringMatching(/^GRU en el worker.*otro hilo\+10,8 ms1,8 ms$/),
      expect.stringMatching(/^Evento message del worker.*task\+14,0 ms0,2 ms$/),
    ]);
    expect(screen.getByText('Del frame al resultado: 14,2 ms')).toBeInTheDocument();
  });

  it('muestra las long tasks y el INP con su atribución y la comparación por modo', () => {
    render(<SignDiagnostics names={names} />);
    const reading = {
      value: 72,
      rating: 'good' as const,
      target: 'button.quick',
      type: 'pointer' as const,
      inputDelay: 8,
      processingDuration: 30,
      presentationDelay: 34,
      thread: 'worker' as const,
      measuredAt: '2026-11-09T12:00:00.000Z',
    };
    act(() => {
      useSignDiagnostics.getState().addLongTasks([{ start: 5, duration: 140 }]);
      useSignDiagnostics.setState({
        inpByThread: {
          main: { ...reading, value: 184, rating: 'needs-improvement', thread: 'main' },
        },
      });
      useSignDiagnostics.getState().setInp(reading);
    });
    expect(screen.getByText('La más larga').nextSibling).toHaveTextContent('140 ms');
    // Valor de esta sesión (destacado) y, otra vez, en la comparación.
    expect(screen.getAllByText('72 ms (bueno)')).toHaveLength(2);
    expect(screen.getByText('button.quick')).toHaveAttribute('title', 'button.quick');
    const compare = screen.getByLabelText('Última lectura de cada modo');
    expect(compare).toHaveTextContent('Todo en el hilo principal184 ms (mejorable)');
    expect(compare).toHaveTextContent('Worker72 ms (bueno)');
  });

  it('acorta el selector del INP al último elemento sin hashes de CSS Modules', () => {
    expect(
      shortTarget('div>div._page_sgqwh_303>section._quick_sgqwh_755>button._quickBtn_sgqwh_787'),
    ).toBe('button.quickBtn');
    expect(shortTarget('button#entrar')).toBe('button#entrar');
    expect(shortTarget(null)).toBe('—');
  });
});
