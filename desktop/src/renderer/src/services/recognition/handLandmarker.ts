import { HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import simdLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import simdWasmUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';

import type { DetectedHand } from './landmarks';

export type Landmarker = Pick<HandLandmarker, 'detectForVideo' | 'close'>;

/** URL del cargador WASM de MediaPipe (el worker lo necesita para su `self.import`). */
export const WASM_LOADER_URL = simdLoaderUrl;

/**
 * Detector de manos de MediaPipe. Sirve en la ventana y en el worker: `self.location` es la
 * página o el script del worker, ambos en el mismo origen que el modelo.
 * Solo se empaqueta el WASM con SIMD: cualquier PC con Windows 10/11 x64 lo admite.
 */
export function createDefaultLandmarker(): Promise<Landmarker> {
  const modelAssetPath = new URL('/models/hand_landmarker.task', self.location.href).toString();
  return HandLandmarker.createFromOptions(
    { wasmLoaderPath: simdLoaderUrl, wasmBinaryPath: simdWasmUrl },
    { baseOptions: { modelAssetPath }, runningMode: 'VIDEO', numHands: 2 },
  );
}

export function toDetectedHands(result: HandLandmarkerResult): DetectedHand[] {
  return result.landmarks.map((landmarks, index) => {
    const category = result.handedness[index]?.[0]?.categoryName;
    return {
      landmarks,
      ...(category === 'Left' || category === 'Right' ? { handedness: category } : {}),
    };
  });
}
