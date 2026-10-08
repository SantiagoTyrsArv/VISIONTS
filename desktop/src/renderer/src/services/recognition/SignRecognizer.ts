/** Seña reconocida, identificada por el `code` de una frase del catálogo. */
export type RecognizedSign = { code: string; confidence: number };
export type RecognitionStatus = {
  phase: 'initializing' | 'ready' | 'error';
  handsDetected: boolean;
  modelAvailable: boolean;
};

export type Unsubscribe = () => void;

export interface SignRecognizer {
  start(): Promise<void>;
  stop(): void;
  onSign(callback: (sign: RecognizedSign) => void): Unsubscribe;
  onStatus(callback: (status: RecognitionStatus) => void): Unsubscribe;
}
