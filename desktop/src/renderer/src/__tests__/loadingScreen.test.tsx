import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { es } from '@/i18n/es';
import { LoadingScreen } from '@/ui/loading/LoadingScreen';
import { startupSteps } from '@/ui/loading/startupSteps';

describe('pantalla de carga', () => {
  it('muestra los textos, los pasos y se anuncia como estado', () => {
    const { steps, progress } = startupSteps({
      session: 'authenticated',
      model: 'loading',
      phrases: 'loading',
    });
    render(<LoadingScreen steps={steps} progress={progress} animate={false} />);
    expect(screen.getByRole('status', { name: 'Cargando SeñaVoz' })).toBeInTheDocument();
    expect(screen.getByText(es['auth.claim'])).toBeInTheDocument();
    expect(screen.getByText(es['loading.session'])).toBeInTheDocument();
    expect(screen.getByText(es['loading.model'])).toBeInTheDocument();
    expect(screen.getByText(es['loading.phrases'])).toBeInTheDocument();
    expect(screen.getByText(es['loading.privacy'])).toBeInTheDocument();
  });

  it('sin animar no pinta los anillos', () => {
    const { container } = render(<LoadingScreen steps={[]} progress={0} animate={false} />);
    expect(container.querySelector('[data-part="ring"]')).toBeNull();
  });
});
