import type { RecognizedSign, SignRecognizer, Unsubscribe } from './SignRecognizer';

/** Reconocedor simulado: las señas se disparan a mano con `simulate()`. */
export class MockSignRecognizer implements SignRecognizer {
  private listeners = new Set<(sign: RecognizedSign) => void>();
  private running = false;

  async start(): Promise<void> {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  onSign(callback: (sign: RecognizedSign) => void): Unsubscribe {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /** Solo para depuración: emite una seña como si el modelo la hubiese detectado. */
  simulate(code: string, confidence = 1): void {
    if (!this.running) return;
    this.listeners.forEach((cb) => cb({ code, confidence }));
  }
}
