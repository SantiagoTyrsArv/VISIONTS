import { describe, expect, it, vi } from 'vitest';

import {
  createTtsService,
  parseKeep,
  parseSynthItems,
  ttsFileName,
  type TtsDeps,
} from '../tts/ttsService';

const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(60, 1)]);

/** Disco en memoria y un "script" que escribe un WAV en cada outPath pedido. */
function fakeDeps() {
  const files = new Map<string, Buffer>();
  const run = vi.fn(async (request: unknown) => {
    const req = request as { action: string; items?: { outPath: string }[] };
    if (req.action === 'voices') return [{ id: 'v1', name: 'Microsoft Pablo', lang: 'es-ES' }];
    return req.items!.map((i) => {
      files.set(i.outPath, WAV);
      return { ok: true };
    });
  });
  const deps: TtsDeps = {
    cacheDir: 'C:\\cache',
    run,
    fs: {
      readFile: async (p) => {
        const v = files.get(p);
        if (!v) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        return v;
      },
      readdir: async () => [...files.keys()].map((p) => p.split('\\').pop()!),
      rm: async (p) => void files.delete(p),
      mkdir: async () => {},
    },
  };
  return { deps, files, run };
}

const item = { text: 'Hola', voiceId: 'v1', rate: 1 };

describe('ttsService', () => {
  it('sintetiza lo que falta y devuelve los bytes WAV', async () => {
    const { deps, run } = fakeDeps();
    const [r] = await createTtsService(deps).synthesize([item]);
    expect(r).toMatchObject({ ok: true });
    expect(Buffer.from((r as { wav: ArrayBuffer }).wav).subarray(0, 4).toString()).toBe('RIFF');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('con caché no vuelve a lanzar el script', async () => {
    const { deps, run } = fakeDeps();
    const tts = createTtsService(deps);
    await tts.synthesize([item]);
    await tts.synthesize([item]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('un lote lanza un solo proceso solo con lo que falta', async () => {
    const { deps, run } = fakeDeps();
    const tts = createTtsService(deps);
    await tts.synthesize([item]);
    run.mockClear();
    await tts.synthesize([item, { ...item, text: 'Sí' }, { ...item, text: 'No' }]);
    expect(run).toHaveBeenCalledTimes(1);
    expect((run.mock.calls[0][0] as { items: unknown[] }).items).toHaveLength(2);
  });

  it('un archivo dañado se borra y se regenera', async () => {
    const { deps, files, run } = fakeDeps();
    files.set(`C:\\cache\\${ttsFileName(item)}`, Buffer.from('basura'));
    const [r] = await createTtsService(deps).synthesize([item]);
    expect(r.ok).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('si el script falla, cada frase devuelve ok: false', async () => {
    const { deps, run } = fakeDeps();
    run.mockRejectedValueOnce(new Error('sin WinRT'));
    const results = await createTtsService(deps).synthesize([item, { ...item, text: 'Sí' }]);
    expect(results).toEqual([
      { ok: false, error: expect.stringContaining('sin WinRT') },
      { ok: false, error: expect.stringContaining('sin WinRT') },
    ]);
  });

  it('el nombre cambia con voz, velocidad o texto', () => {
    const base = ttsFileName(item);
    expect(ttsFileName({ ...item, voiceId: 'v2' })).not.toBe(base);
    expect(ttsFileName({ ...item, rate: 1.25 })).not.toBe(base);
    expect(ttsFileName({ ...item, text: 'Adiós' })).not.toBe(base);
    expect(base).toMatch(/^[0-9a-f]{12}-[0-9a-f]{24}\.wav$/);
  });

  it('prune borra los audios de otras combinaciones de voz y velocidad', async () => {
    const { deps, files } = fakeDeps();
    const tts = createTtsService(deps);
    await tts.synthesize([item, { ...item, rate: 1.5 }]);
    await tts.prune({ voiceId: 'v1', rate: 1 });
    expect([...files.keys()]).toEqual([`C:\\cache\\${ttsFileName(item)}`]);
  });

  it('voices devuelve la lista del script', async () => {
    const { deps } = fakeDeps();
    expect(await createTtsService(deps).voices()).toEqual([
      { id: 'v1', name: 'Microsoft Pablo', lang: 'es-ES' },
    ]);
  });
});

describe('validación de entrada IPC', () => {
  it('acepta items válidos', () => {
    expect(parseSynthItems([item, { text: 'Sí', voiceId: null, rate: 0.5 }])).toHaveLength(2);
  });

  it('rechaza formas inválidas', () => {
    expect(() => parseSynthItems('x')).toThrow();
    expect(() => parseSynthItems([{ text: 1, voiceId: null, rate: 1 }])).toThrow();
    expect(() => parseSynthItems([{ text: '', voiceId: null, rate: 1 }])).toThrow();
    expect(() => parseSynthItems([{ text: 'a'.repeat(501), voiceId: null, rate: 1 }])).toThrow();
    expect(() => parseSynthItems([{ text: 'Hola', voiceId: null, rate: 9 }])).toThrow();
    expect(() => parseSynthItems(Array(51).fill(item))).toThrow();
  });

  it('parseKeep valida voz y velocidad', () => {
    expect(parseKeep({ voiceId: null, rate: 1 })).toEqual({ voiceId: null, rate: 1 });
    expect(() => parseKeep({ voiceId: 3, rate: 1 })).toThrow();
  });
});
