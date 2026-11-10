import { describe, expect, it } from 'vitest';

import { probabilityMap } from './diagnostics';

describe('probabilityMap', () => {
  it('asocia cada etiqueta con su probabilidad', () => {
    expect(probabilityMap(['good_morning', 'neutral'], [0.3, 0.7])).toEqual({
      good_morning: 0.3,
      neutral: 0.7,
    });
  });
});
