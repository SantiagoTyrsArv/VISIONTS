import { SEQUENCE_LENGTH, VALUES_PER_FRAME } from './landmarks';
import type { LandmarkModel, ModelPrediction } from './SignClassifier';

export const GRU_FORMAT = 'senavoz-gru-v1';

/** Pesos tal como los exporta el servidor (convención de PyTorch, puertas r, z, n). */
export type GruWeightsJson = {
  format: string;
  input_size: number;
  hidden_size: number;
  labels: string[];
  gru: { weight_ih: number[][]; weight_hh: number[][]; bias_ih: number[]; bias_hh: number[] };
  head: { weight: number[][]; bias: number[] };
};

export class InvalidModelError extends Error {}

type Matrix = { data: Float64Array; rows: number; cols: number };

function fail(message: string): never {
  throw new InvalidModelError(message);
}

function vector(value: unknown, length: number, name: string): Float64Array {
  if (!Array.isArray(value) || value.length !== length) fail(`${name}: tamaño incorrecto`);
  const out = Float64Array.from(value as number[]);
  if (!out.every(Number.isFinite)) fail(`${name}: valores no finitos`);
  return out;
}

function matrix(value: unknown, rows: number, cols: number, name: string): Matrix {
  if (!Array.isArray(value) || value.length !== rows) fail(`${name}: filas incorrectas`);
  const data = new Float64Array(rows * cols);
  (value as unknown[]).forEach((row, r) => data.set(vector(row, cols, name), r * cols));
  return { data, rows, cols };
}

/** out = W·x + b, con x leído desde `offset`. */
function affine(
  w: Matrix,
  x: ArrayLike<number>,
  offset: number,
  b: Float64Array,
  out: Float64Array,
) {
  for (let r = 0; r < w.rows; r += 1) {
    let sum = b[r];
    const base = r * w.cols;
    for (let c = 0; c < w.cols; c += 1) sum += w.data[base + c] * x[offset + c];
    out[r] = sum;
  }
}

const sigmoid = (v: number): number => 1 / (1 + Math.exp(-v));

/** GRU de una capa + capa lineal + softmax, en TypeScript puro (sin runtimes de ML). */
export class GruModel implements LandmarkModel {
  private constructor(
    readonly labels: readonly string[],
    private readonly hidden: number,
    private readonly wih: Matrix,
    private readonly whh: Matrix,
    private readonly bih: Float64Array,
    private readonly bhh: Float64Array,
    private readonly headW: Matrix,
    private readonly headB: Float64Array,
  ) {}

  static fromJson(json: unknown): GruModel {
    const w = json as Partial<GruWeightsJson> | null;
    if (!w || w.format !== GRU_FORMAT) fail('Formato de modelo desconocido');
    if (w.input_size !== VALUES_PER_FRAME) fail('Tamaño de entrada distinto de 126');
    const h = w.hidden_size;
    if (!Number.isInteger(h) || (h as number) <= 0) fail('hidden_size no válido');
    const labels = w.labels;
    if (
      !Array.isArray(labels) ||
      labels.length < 2 ||
      !labels.every((l) => typeof l === 'string') ||
      new Set(labels).size !== labels.length
    ) {
      fail('Etiquetas no válidas');
    }
    const H = h as number;
    if (!w.gru || !w.head) fail('Faltan capas');
    return new GruModel(
      labels,
      H,
      matrix(w.gru.weight_ih, 3 * H, VALUES_PER_FRAME, 'weight_ih'),
      matrix(w.gru.weight_hh, 3 * H, H, 'weight_hh'),
      vector(w.gru.bias_ih, 3 * H, 'bias_ih'),
      vector(w.gru.bias_hh, 3 * H, 'bias_hh'),
      matrix(w.head.weight, labels.length, H, 'head.weight'),
      vector(w.head.bias, labels.length, 'head.bias'),
    );
  }

  /** Probabilidades por etiqueta para una secuencia de 30 × 126 valores. */
  probabilities(sequence: readonly number[]): number[] {
    const H = this.hidden;
    let h = new Float64Array(H);
    const gi = new Float64Array(3 * H);
    const gh = new Float64Array(3 * H);
    for (let t = 0; t < SEQUENCE_LENGTH; t += 1) {
      affine(this.wih, sequence, t * VALUES_PER_FRAME, this.bih, gi);
      affine(this.whh, h, 0, this.bhh, gh);
      const next = new Float64Array(H);
      for (let j = 0; j < H; j += 1) {
        const r = sigmoid(gi[j] + gh[j]);
        const z = sigmoid(gi[H + j] + gh[H + j]);
        const n = Math.tanh(gi[2 * H + j] + r * gh[2 * H + j]);
        next[j] = (1 - z) * n + z * h[j];
      }
      h = next;
    }
    const logits = new Float64Array(this.labels.length);
    affine(this.headW, h, 0, this.headB, logits);
    const max = Math.max(...logits);
    const exps = Array.from(logits, (v) => Math.exp(v - max));
    const total = exps.reduce((a, b) => a + b, 0);
    return exps.map((v) => v / total);
  }

  predict(sequence: readonly number[]): ModelPrediction | null {
    if (sequence.length !== SEQUENCE_LENGTH * VALUES_PER_FRAME) return null;
    const probs = this.probabilities(sequence);
    let best = 0;
    for (let i = 1; i < probs.length; i += 1) if (probs[i] > probs[best]) best = i;
    return { label: this.labels[best], confidence: probs[best] };
  }
}
