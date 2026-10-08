import { createHash } from 'node:crypto';
import { join } from 'node:path';

import type { SynthItem, SynthResult, TtsVoice } from '../../shared/ipc';

/** Ejecuta synth.ps1 con una petición JSON y devuelve su respuesta JSON. */
export type ScriptRunner = (request: unknown) => Promise<unknown>;
export type TtsFs = {
  readFile(path: string): Promise<Buffer>;
  readdir(path: string): Promise<string[]>;
  rm(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
};
export type TtsDeps = { cacheDir: string; run: ScriptRunner; fs: TtsFs };

const MAX_TEXT = 500;
const MAX_ITEMS = 50;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
/** Prefijo común a los audios de una combinación voz + velocidad: permite podar el resto. */
const comboPrefix = (voiceId: string | null, rate: number) =>
  sha(`${voiceId ?? ''}|${rate}`).slice(0, 12);

export const ttsFileName = (item: SynthItem) =>
  `${comboPrefix(item.voiceId, item.rate)}-${sha(item.text).slice(0, 24)}.wav`;

const isWav = (b: Buffer) => b.length > 44 && b.subarray(0, 4).toString('ascii') === 'RIFF';
const toArrayBuffer = (b: Buffer) =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

const isVoiceId = (v: unknown): v is string | null =>
  v === null || (typeof v === 'string' && v.length > 0 && v.length <= 300);
const isRate = (v: unknown): v is number => typeof v === 'number' && v >= 0.5 && v <= 2;

/** El renderer es de confianza, pero el IPC es una frontera: se valida la forma. */
export function parseSynthItems(input: unknown): SynthItem[] {
  if (!Array.isArray(input) || input.length > MAX_ITEMS) throw new Error('Lote no válido');
  return input.map((raw) => {
    const { text, voiceId, rate } = (raw ?? {}) as Record<string, unknown>;
    if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TEXT)
      throw new Error('Texto no válido');
    if (!isVoiceId(voiceId) || !isRate(rate)) throw new Error('Voz o velocidad no válidas');
    return { text, voiceId, rate };
  });
}

export function parseKeep(input: unknown): { voiceId: string | null; rate: number } {
  const { voiceId, rate } = (input ?? {}) as Record<string, unknown>;
  if (!isVoiceId(voiceId) || !isRate(rate)) throw new Error('Voz o velocidad no válidas');
  return { voiceId, rate };
}

export function createTtsService({ cacheDir, run, fs }: TtsDeps) {
  /** Audio guardado y válido; uno dañado se borra para regenerarlo. */
  async function cached(path: string): Promise<Buffer | null> {
    let data: Buffer;
    try {
      data = await fs.readFile(path);
    } catch {
      return null;
    }
    if (isWav(data)) return data;
    await fs.rm(path);
    return null;
  }

  return {
    async voices(): Promise<TtsVoice[]> {
      const out = await run({ action: 'voices' });
      return Array.isArray(out) ? (out as TtsVoice[]) : [];
    },

    async synthesize(items: SynthItem[]): Promise<SynthResult[]> {
      await fs.mkdir(cacheDir);
      const paths = items.map((i) => join(cacheDir, ttsFileName(i)));
      const results: (SynthResult | null)[] = await Promise.all(
        paths.map(async (p) => {
          const data = await cached(p);
          return data ? { ok: true as const, wav: toArrayBuffer(data) } : null;
        }),
      );

      const missing = results.flatMap((r, i) => (r ? [] : [i]));
      if (missing.length === 0) return results as SynthResult[];

      // Un solo proceso para todo lo que falta (arrancar PowerShell cuesta ~0,7 s).
      let out: unknown;
      try {
        out = await run({
          action: 'synthesize',
          items: missing.map((i) => ({ ...items[i], outPath: paths[i] })),
        });
      } catch (e) {
        out = missing.map(() => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      }
      const list = Array.isArray(out) ? out : [];
      await Promise.all(
        missing.map(async (i, k) => {
          const r = (list[k] ?? {}) as { ok?: boolean; error?: string };
          const data = r.ok ? await cached(paths[i]) : null;
          results[i] = data
            ? { ok: true, wav: toArrayBuffer(data) }
            : { ok: false, error: r.error ?? 'No se generó el audio' };
        }),
      );
      return results as SynthResult[];
    },

    async prune(keep: { voiceId: string | null; rate: number }): Promise<void> {
      const prefix = `${comboPrefix(keep.voiceId, keep.rate)}-`;
      let names: string[];
      try {
        names = await fs.readdir(cacheDir);
      } catch {
        return;
      }
      await Promise.all(
        names
          .filter((n) => n.endsWith('.wav') && !n.startsWith(prefix))
          .map((n) => fs.rm(join(cacheDir, n))),
      );
    },
  };
}
