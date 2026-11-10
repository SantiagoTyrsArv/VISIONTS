import { describe, expect, it, vi } from 'vitest';

import fixture from './__fixtures__/gru-parity.json';
import { GruModel, type GruWeightsJson } from './GruModel';
import { SEQUENCE_LENGTH, VALUES_PER_FRAME as F } from './landmarks';
import { FrameRing, LocalWindowModel } from './windowModels';

const weights = fixture.weights as GruWeightsJson;
const gru = GruModel.fromJson(weights);
const frames = Array.from({ length: 30 }, (_, t) => fixture.input.slice(t * F, (t + 1) * F));
const expected = gru.predict(fixture.input)!;

/** Unos frames de relleno antes de la ventana: el anillo da la vuelta. */
const pushAll = (target: { push(f: readonly number[]): void }, extra = 7) => {
  for (let i = 0; i < extra; i += 1) target.push(Array<number>(F).fill(9));
  frames.forEach((f) => target.push(f));
};

describe('FrameRing', () => {
  it('sin 30 frames no hay ventana; reset la vacía', () => {
    const ring = new FrameRing();
    frames.slice(1).forEach((f) => ring.push(f));
    expect(ring.windowStart()).toBeNull();
    ring.push(frames[0]);
    expect(ring.windowStart()).toBe(0);
    ring.reset();
    expect(ring.windowStart()).toBeNull();
  });

  it('tras dar la vuelta, la ventana empieza en el frame más antiguo', () => {
    const ring = new FrameRing();
    pushAll(ring, SEQUENCE_LENGTH + 5);
    const start = ring.windowStart()!;
    expect(start).toBe(5);
    expect(Array.from(ring.frames.subarray(start * F, (start + 1) * F))).toEqual(
      Array.from(Float32Array.from(frames[0])),
    );
  });
});

describe('LocalWindowModel', () => {
  it('predice lo mismo que la GRU sobre la secuencia ordenada y publica las probabilidades', () => {
    const onProbabilities = vi.fn();
    const model = new LocalWindowModel(gru, onProbabilities);
    expect(model.predict()).toBeNull();
    pushAll(model);
    const prediction = model.predict()!;
    expect(prediction.label).toBe(expected.label);
    expect(prediction.confidence).toBeCloseTo(expected.confidence, 4);
    expect(Object.keys(onProbabilities.mock.calls[0][0])).toEqual(weights.labels);
  });

  it('reset vacía la ventana', () => {
    const model = new LocalWindowModel(gru);
    pushAll(model);
    model.reset();
    expect(model.predict()).toBeNull();
  });
});
