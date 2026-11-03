import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSignDiagnostics } from '@/store/signDiagnostics';
import { SignDiagnostics } from '@/ui/SignDiagnostics';

const names = { good_morning: 'Buenos días', good_afternoon: 'Buenas tardes' };

describe('SignDiagnostics', () => {
  beforeEach(() => useSignDiagnostics.getState().clear());

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

    const rows = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual([
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
});
