import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SigningHand } from '@/ui/loading/SigningHand';

afterEach(() => vi.restoreAllMocks());

describe('mano que signa', () => {
  it('sin animar pinta la postura abierta y no usa requestAnimationFrame', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const { container } = render(<SigningHand animate={false} />);
    expect(raf).not.toHaveBeenCalled();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[data-part="finger"]')).toHaveAttribute(
      'd',
      'M25.5 62 L25.5 30',
    );
    expect(container.querySelectorAll('[data-part="wave"]')).toHaveLength(3);
  });

  it('animando pide frames y los cancela al desmontar', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(7);
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const { unmount } = render(<SigningHand animate />);
    expect(raf).toHaveBeenCalled();
    unmount();
    expect(cancel).toHaveBeenCalledWith(7);
  });
});
