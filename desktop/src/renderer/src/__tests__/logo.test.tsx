import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import Login from '@/routes/Login';
import { Brand } from '@/ui/Brand';
import { Logo } from '@/ui/Logo';

describe('logo de la mano', () => {
  it('en modo continuo pinta el svg con tres ondas', () => {
    const { container } = render(<Logo mode="continuous" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('data-mode', 'continuous');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('[data-part="wave"]')).toHaveLength(3);
  });

  it('engrosa el trazo por debajo de 64 px', () => {
    const { container: grande } = render(<Logo size={64} />);
    const { container: pequeno } = render(<Logo size={40} />);
    expect(grande.querySelector('svg')).toHaveAttribute('stroke-width', '5.5');
    expect(pequeno.querySelector('svg')).toHaveAttribute('stroke-width', '7');
  });

  it('el tono onAccent añade su clase', () => {
    const { container: a } = render(<Logo tone="onAccent" />);
    const { container: b } = render(<Logo />);
    expect(a.querySelector('svg')!.getAttribute('class')).toMatch(/onAccent/);
    expect(b.querySelector('svg')!.getAttribute('class')).not.toMatch(/onAccent/);
  });

  it('la marca usa por defecto un solo saludo', () => {
    const { container } = render(<Brand />);
    expect(container.querySelector('svg')).toHaveAttribute('data-mode', 'once');
  });

  it('la pantalla de acceso lleva el logo continuo', () => {
    const { container } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(container.querySelector('svg[data-mode="continuous"]')).not.toBeNull();
  });
});
