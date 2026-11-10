import { describe, expect, it } from 'vitest';

import fixture from './__fixtures__/gru-parity.json';
import { GruModel, InvalidModelError, type GruWeightsJson } from './GruModel';

const weights = fixture.weights as GruWeightsJson;

function clone(): GruWeightsJson {
  return JSON.parse(JSON.stringify(weights)) as GruWeightsJson;
}

describe('GruModel', () => {
  it('calcula las mismas probabilidades que PyTorch', () => {
    const model = GruModel.fromJson(weights);
    const probs = model.probabilities(fixture.input);
    expect(probs).toHaveLength(fixture.probabilities.length);
    probs.forEach((p, i) => expect(p).toBeCloseTo(fixture.probabilities[i], 4));
  });

  it('predice la etiqueta más probable con su confianza', () => {
    const model = GruModel.fromJson(weights);
    const best = fixture.probabilities.indexOf(Math.max(...fixture.probabilities));
    const prediction = model.predict(fixture.input);
    expect(prediction?.label).toBe(weights.labels[best]);
    expect(prediction?.confidence).toBeCloseTo(fixture.probabilities[best], 4);
  });

  it('lee la secuencia de un anillo rotado sin cambiar el resultado', () => {
    const model = GruModel.fromJson(weights);
    const slots = 31;
    const first = 20; // el frame 0 de la ventana está en el hueco 20; el 11 vuelve al 0
    const ring = new Float32Array(slots * 126).fill(99);
    for (let t = 0; t < 30; t += 1) {
      ring.set(fixture.input.slice(t * 126, (t + 1) * 126), ((first + t) % slots) * 126);
    }
    const probs = model.probabilitiesFrom(ring, first, slots);
    probs.forEach((p, i) => expect(p).toBeCloseTo(fixture.probabilities[i], 4));
  });

  it('devuelve null con una secuencia de longitud incorrecta', () => {
    expect(GruModel.fromJson(weights).predict([1, 2, 3])).toBeNull();
  });

  it('rechaza un formato desconocido', () => {
    expect(() => GruModel.fromJson({ ...clone(), format: 'otro' })).toThrow(InvalidModelError);
  });

  it('rechaza una capa de salida que no coincide con las etiquetas', () => {
    const w = clone();
    w.labels = [...w.labels, 'extra'];
    expect(() => GruModel.fromJson(w)).toThrow(InvalidModelError);
  });

  it('rechaza dimensiones de la GRU incorrectas', () => {
    const w = clone();
    w.gru.weight_hh = w.gru.weight_hh.slice(1);
    expect(() => GruModel.fromJson(w)).toThrow(InvalidModelError);
  });

  it('rechaza valores no finitos', () => {
    const w = clone();
    w.head.bias[0] = Number.NaN;
    expect(() => GruModel.fromJson(w)).toThrow(InvalidModelError);
  });

  it('rechaza un tamaño de entrada distinto de 126', () => {
    expect(() => GruModel.fromJson({ ...clone(), input_size: 63 })).toThrow(InvalidModelError);
  });
});
