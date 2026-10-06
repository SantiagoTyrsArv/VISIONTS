import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Phrase } from '@/api/types';
import { usePhraseShortcuts } from '@/hooks/usePhraseShortcuts';

const phrases: Phrase[] = ['hello', 'yes', 'no'].map((code, i) => ({
  id: String(i),
  code,
  text_es: code,
  is_default: true,
}));

function Harness({ onPhrase }: { onPhrase: (p: Phrase) => void }) {
  usePhraseShortcuts(phrases, onPhrase);
  return <input aria-label="campo" />;
}

describe('atajos 1–9', () => {
  it('la tecla N reproduce la frase N', async () => {
    const onPhrase = vi.fn();
    render(<Harness onPhrase={onPhrase} />);
    await userEvent.keyboard('2');
    expect(onPhrase).toHaveBeenCalledWith(phrases[1]);
  });

  it('una tecla sin frase no hace nada', async () => {
    const onPhrase = vi.fn();
    render(<Harness onPhrase={onPhrase} />);
    await userEvent.keyboard('9');
    expect(onPhrase).not.toHaveBeenCalled();
  });

  it('se ignora al escribir en un campo de texto', async () => {
    const onPhrase = vi.fn();
    const { getByLabelText } = render(<Harness onPhrase={onPhrase} />);
    await userEvent.type(getByLabelText('campo'), '1');
    expect(onPhrase).not.toHaveBeenCalled();
  });

  it('se ignora con modificadores (Ctrl/Alt/Meta) y con autorrepetición', async () => {
    const onPhrase = vi.fn();
    render(<Harness onPhrase={onPhrase} />);
    await userEvent.keyboard('{Control>}1{/Control}{Alt>}1{/Alt}{Meta>}1{/Meta}');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', repeat: true }));
    expect(onPhrase).not.toHaveBeenCalled();
  });
});
