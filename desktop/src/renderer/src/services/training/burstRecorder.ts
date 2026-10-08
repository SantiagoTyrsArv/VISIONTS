import { SEQUENCE_LENGTH } from '@/services/recognition/landmarks';
import type { LandmarkFrame } from '@/services/recognition/SignRecognizer';

export const BURSTS_PER_SESSION = 5;
/** Una ráfaga con manos en menos de la mitad de los frames no sirve para entrenar. */
export const MIN_HAND_FRAMES = 15;

export type BurstEvent =
  | { type: 'countdown'; secondsLeft: number }
  | { type: 'recording'; burst: number }
  | { type: 'sample'; frames: number[] }
  | { type: 'rejected' }
  | { type: 'done' };

export type BurstOptions = {
  /** false para la clase de reposo, que se graba sin manos. */
  requireHands: boolean;
  bursts?: number;
  countdownSeconds?: number;
  pauseMs?: number;
};

type Phase = 'idle' | 'countdown' | 'recording' | 'pause';

/** Sesión de grabación: cuenta atrás, ráfagas de 30 frames y pausas entre ellas. */
export class BurstRecorder {
  private phase: Phase = 'idle';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private frames: number[][] = [];
  private handFrames = 0;
  private burst = 0;
  private readonly bursts: number;
  private readonly countdownSeconds: number;
  private readonly pauseMs: number;

  constructor(
    private readonly onEvent: (event: BurstEvent) => void,
    private readonly options: BurstOptions,
  ) {
    this.bursts = options.bursts ?? BURSTS_PER_SESSION;
    this.countdownSeconds = options.countdownSeconds ?? 3;
    this.pauseMs = options.pauseMs ?? 1000;
  }

  get running(): boolean {
    return this.phase !== 'idle';
  }

  start(): void {
    if (this.running) return;
    this.burst = 0;
    this.countdown(this.countdownSeconds);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.phase = 'idle';
    this.frames = [];
  }

  addFrame(frame: LandmarkFrame): void {
    if (this.phase !== 'recording') return;
    this.frames.push(frame.values);
    if (frame.handsDetected) this.handFrames += 1;
    if (this.frames.length < SEQUENCE_LENGTH) return;

    const accepted = !this.options.requireHands || this.handFrames >= MIN_HAND_FRAMES;
    const frames = this.frames.flat();
    this.frames = [];
    // El evento puede llamar a stop() (p. ej. si falla la subida): se comprueba después.
    this.onEvent(accepted ? { type: 'sample', frames } : { type: 'rejected' });
    if (this.phase !== 'recording') return;
    if (this.burst >= this.bursts) {
      this.phase = 'idle';
      this.onEvent({ type: 'done' });
      return;
    }
    this.phase = 'pause';
    this.timer = setTimeout(() => this.record(), this.pauseMs);
  }

  private countdown(secondsLeft: number): void {
    if (secondsLeft <= 0) {
      this.record();
      return;
    }
    this.phase = 'countdown';
    this.onEvent({ type: 'countdown', secondsLeft });
    this.timer = setTimeout(() => this.countdown(secondsLeft - 1), 1000);
  }

  private record(): void {
    this.timer = null;
    this.burst += 1;
    this.frames = [];
    this.handFrames = 0;
    this.phase = 'recording';
    this.onEvent({ type: 'recording', burst: this.burst });
  }
}
