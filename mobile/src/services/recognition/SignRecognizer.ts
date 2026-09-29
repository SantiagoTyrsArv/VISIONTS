/** Seña reconocida, identificada por el `code` de una frase del catálogo. */
export type RecognizedSign = { code: string; confidence: number };

export type Unsubscribe = () => void;

/**
 * Contrato del reconocedor de señas. En la fase 3 lo implementará un
 * `TfliteSignRecognizer` (MediaPipe + LSTM on-device) sin cambiar a los consumidores.
 */
export interface SignRecognizer {
  start(): Promise<void>;
  stop(): void;
  onSign(callback: (sign: RecognizedSign) => void): Unsubscribe;
}
