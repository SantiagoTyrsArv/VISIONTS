export type ClassProbabilities = Record<string, number>;

/**
 * Probabilidad de cada etiqueta, para el panel Diagnóstico (solo desarrollo). La calculan
 * los modelos de ventana (windowModels.ts), en el hilo principal o en el worker.
 */
export function probabilityMap(
  labels: readonly string[],
  probabilities: readonly number[],
): ClassProbabilities {
  return Object.fromEntries(labels.map((label, i) => [label, probabilities[i]]));
}
