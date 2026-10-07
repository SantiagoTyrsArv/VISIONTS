import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createPowerShellRunner } from '../tts/runPowerShell';

const script = fileURLToPath(new URL('../../../resources/tts/synth.ps1', import.meta.url));

// Usa el motor de voz real: solo en Windows.
describe.runIf(process.platform === 'win32')('synth.ps1 (Windows real)', () => {
  const run = createPowerShellRunner(script);

  it('lista voces en español', async () => {
    const voices = (await run({ action: 'voices' })) as { id: string; lang: string }[];
    expect(Array.isArray(voices)).toBe(true);
    for (const v of voices) expect(v.lang.startsWith('es')).toBe(true);
  }, 30_000);

  it('genera un WAV con texto no ASCII', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'senavoz-tts-'));
    try {
      const outPath = join(dir, 'x.wav');
      const [r] = (await run({
        action: 'synthesize',
        items: [{ text: '¿Mañana está libre?', voiceId: null, rate: 1, outPath }],
      })) as { ok: boolean }[];
      expect(r.ok).toBe(true);
      const wav = await readFile(outPath);
      expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(wav.length).toBeGreaterThan(10_000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
