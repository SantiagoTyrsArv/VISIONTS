import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSignModelBoot } from '@/hooks/useSignModelBoot';
import { useSession } from '@/store/session';
import { useSignModel } from '@/store/signModel';

const load = vi.fn(async () => undefined);

beforeEach(() => {
  load.mockClear();
  useSession.setState({ status: 'loading', user: null });
  useSignModel.setState({ load });
});

describe('useSignModelBoot', () => {
  it('sin sesión no carga el modelo', () => {
    renderHook(() => useSignModelBoot());
    act(() => useSession.setState({ status: 'unauthenticated' }));
    expect(load).not.toHaveBeenCalled();
  });

  it('carga el modelo al autenticarse', () => {
    renderHook(() => useSignModelBoot());
    act(() => useSession.setState({ status: 'authenticated' }));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('una sola carga aunque se cierre y se vuelva a abrir sesión', () => {
    useSession.setState({ status: 'authenticated' });
    const { rerender } = renderHook(() => useSignModelBoot());
    for (const status of ['unauthenticated', 'authenticated'] as const) {
      act(() => useSession.setState({ status }));
      rerender();
    }
    expect(load).toHaveBeenCalledTimes(1);
  });
});
