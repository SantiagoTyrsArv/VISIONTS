# Modo reunión y rediseño visual — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que SeñaVoz hable por un micrófono virtual (VB-Cable) en cualquier app de reuniones, desde una ventana compacta siempre visible con atajos globales, y que toda la app adopte el nuevo diseño.

**Architecture:** El proceso main sintetiza WAV con las voces OneCore de Windows mediante un script PowerShell/WinRT, con caché en disco; gestiona la ventana compacta y los atajos globales. El renderer reproduce el audio con `HTMLAudioElement.setSinkId` hacia el dispositivo del cable (o los altavoces fuera del modo), y el estado de reunión/reproducción vive en dos stores Zustand. El rediseño cambia tokens, tipografías y el marcado de todas las pantallas.

**Tech Stack:** Electron 44, electron-vite 5, React 19, TypeScript, Zustand, TanStack Query, Vitest + Testing Library, PowerShell 5.1 + WinRT (`Windows.Media.SpeechSynthesis`), `@fontsource`.

**Spec:** `docs/superpowers/specs/2026-10-07-meeting-mode-design.md` · Diseño visual: <https://claude.ai/artifact/Pv6uDV8yVhyTMUYfFoFkZk>

## Global Constraints

- Todo el código vive en `desktop/`; los comandos se ejecutan desde `desktop/`.
- Plataforma objetivo: Windows. macOS/Linux no se rompen a propósito, pero no se prueban.
- En Modo reunión la voz **nunca** sale por los altavoces: sin `speechSynthesis` y sin `setSinkId('')`.
- Los textos de síntesis viajan a PowerShell **por stdin como JSON**, nunca como argumentos; las rutas de salida las decide main dentro de `userData/tts-cache/`.
- Ventana compacta: 380×600, mínimo 340×520; tamaño normal mínimo 900×600; `setAlwaysOnTop(true, 'floating')`.
- Atajos globales `Control+Alt+1` … `Control+Alt+9`, registrados solo en Modo reunión.
- Detección de VB-Cable por etiqueta `/CABLE Input/i`; en la reunión se elige "CABLE Output".
- Tokens de color: fondo `#0F1114`, superficie `#181B20`, barra lateral `#14171B`, bordes `#262A31`/`#2A2F38`, texto `#F2F0EA`, atenuado `#A3A8B3`, ámbar `#FFB547` (texto encima `#1A1206`) solo para lo que habla, azul `#7AB8FF` solo para estados activo/detectado, peligro `#FFA597`.
- Tipografías empaquetadas: Atkinson Hyperlegible (texto) y Bricolage Grotesque (títulos). Nada de Google Fonts (la CSP no lo permite).
- Objetivos táctiles ≥ 44 px; contraste de texto ≥ 4.5:1; foco visible.
- Todo texto de UI va en `src/renderer/src/i18n/es.ts` y se lee con `t()`.
- Comentarios en español, en la misma densidad que el código existente.
- Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Frases con caracteres no ASCII** ("¿Puedes repetir, por favor?", "Sí", "ñ"): deben llegar intactas al sintetizador. Test de integración en Windows con `ñ`, `¿` y `á` (Task 1).
- **Arrastrar el control de velocidad** genera una ráfaga de cambios: la precarga no debe lanzar una síntesis por cada valor intermedio. Test de *debounce* (Task 6).
- **Archivo de caché truncado o vacío** (corte de luz a mitad de escritura): se regenera y no se reproduce basura. Test de archivo dañado (Task 1).
- **Pulsar Ctrl+Alt+N con la voz en pausa o sin micrófono virtual**: no suena nada, en ningún dispositivo. Tests de bloqueo (Task 5) y de pantalla (Task 12).
- **La ventana estaba maximizada al entrar en Modo reunión**: al salir vuelve a estar maximizada, no en un tamaño intermedio. Test del controlador de ventana (Task 2).

---

## Mapa de archivos

**Main**
- Create `resources/tts/synth.ps1`: WinRT → lista de voces y WAV.
- Create `src/main/tts/ttsService.ts`: caché, nombres por combinación, poda, validación de entrada.
- Create `src/main/tts/runPowerShell.ts`: lanza el script, JSON por stdin/stdout, timeout.
- Create `src/main/meetingWindow.ts`: límites compactos (función pura) y controlador entrar/salir.
- Create `src/main/meetingShortcuts.ts`: registro/liberación de Ctrl+Alt+1…9.
- Modify `src/main/security.ts`: permitir `speaker-selection`.
- Modify `src/main/index.ts`: cablear IPC, ventana y atajos.
- Modify `src/shared/ipc.ts`, `src/preload/index.ts`: contrato `tts` y `meeting`.
- Modify `electron-builder.yml`: `extraResources` con `resources/tts`.

**Renderer, lógica**
- Create `services/audio/outputDevice.ts`: listar salidas, detectar el cable, resolver la elección guardada.
- Create `store/meeting.ts`: estado del Modo reunión.
- Create `store/playback.ts`: última frase, reproduciendo, preparando, error de síntesis.
- Modify `store/settings.ts`: `voiceURI` → `voiceId`, añadir `meetingOutput`, versión de persistencia 1.
- Create `services/speech/GeneratedSpeechService.ts`; delete `CachedAudioSpeechService.ts`, `useSpanishVoices.ts`.
- Create `services/speech/useTtsVoices.ts`.
- Modify `services/speech/index.ts`: nuevo cableado.
- Create `hooks/useVoicePreload.ts`, `hooks/useOutputDevices.ts`, `hooks/useSignRecognition.ts`, `hooks/useMeetingMode.ts`.

**Renderer, UI**
- Modify `main.tsx` (fuentes), `styles.css` (tokens).
- Create `ui/icons.tsx`, `ui/Brand.tsx`.
- Rewrite `ui/ui.module.css`, `ui/AuthScreen.tsx`, `ui/PhraseCard.tsx`.
- Rewrite `routes/routes.module.css`, `routes/AppLayout.tsx`, `routes/Phrases.tsx`, `routes/Camera.tsx`, `routes/Settings.tsx`.
- Create `routes/settings/MeetingSection.tsx`, `routes/settings/VoiceSection.tsx`.
- Create `routes/Meeting.tsx`, `routes/meeting.module.css`.
- Modify `App.tsx`: ruta `/reunion`.
- Modify `i18n/es.ts`.

**Tests**
- Create `src/main/__tests__/ttsService.test.ts`, `synth.integration.test.ts`, `meetingWindow.test.ts`, `meetingShortcuts.test.ts`.
- Modify `src/main/__tests__/security.test.ts`.
- Modify `src/renderer/src/test/fakeSenavoz.ts`.
- Create `src/renderer/src/__tests__/outputDevice.test.ts`, `generatedSpeech.test.ts`, `voicePreload.test.tsx`, `meetingScreen.test.tsx`, `settingsMeeting.test.tsx`.
- Modify `speech.test.ts`, `settings.test.tsx`, `cameraScreen.test.tsx`, `phrases.test.tsx`; delete `voices.test.tsx`.

---

### Task 1: Sintetizador en main (script WinRT + servicio con caché)

**Files:**
- Create: `desktop/resources/tts/synth.ps1`
- Create: `desktop/src/main/tts/ttsService.ts`
- Create: `desktop/src/main/tts/runPowerShell.ts`
- Modify: `desktop/src/shared/ipc.ts` (solo tipos `TtsVoice`, `SynthItem`, `SynthResult`)
- Modify: `desktop/electron-builder.yml`
- Test: `desktop/src/main/__tests__/ttsService.test.ts`, `desktop/src/main/__tests__/synth.integration.test.ts`

**Interfaces:**
- Produces (en `src/shared/ipc.ts`):
  ```ts
  export type TtsVoice = { id: string; name: string; lang: string };
  export type SynthItem = { text: string; voiceId: string | null; rate: number };
  export type SynthResult = { ok: true; wav: ArrayBuffer } | { ok: false; error: string };
  ```
- Produces (en `src/main/tts/ttsService.ts`):
  `createTtsService(deps: TtsDeps): { voices(): Promise<TtsVoice[]>; synthesize(items: SynthItem[]): Promise<SynthResult[]>; prune(keep: { voiceId: string | null; rate: number }): Promise<void> }`,
  `parseSynthItems(input: unknown): SynthItem[]`, `parseKeep(input: unknown): { voiceId: string | null; rate: number }`, `ttsFileName(item: SynthItem): string`, `type ScriptRunner = (request: unknown) => Promise<unknown>`.
- Produces (en `src/main/tts/runPowerShell.ts`): `createPowerShellRunner(scriptPath: string, timeoutMs?: number): ScriptRunner`.

- [ ] **Step 1: Añadir los tipos compartidos**

En `desktop/src/shared/ipc.ts`, encima de `SenavozApi`:

```ts
/** Voz de Windows (OneCore) en español. */
export type TtsVoice = { id: string; name: string; lang: string };
/** Una frase a sintetizar con la voz y velocidad de ajustes (voiceId null = predeterminada). */
export type SynthItem = { text: string; voiceId: string | null; rate: number };
export type SynthResult = { ok: true; wav: ArrayBuffer } | { ok: false; error: string };
```

- [ ] **Step 2: Escribir los tests del servicio**

`desktop/src/main/__tests__/ttsService.test.ts`:

```ts
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
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `npx vitest run src/main/__tests__/ttsService.test.ts`
Expected: FAIL, `Failed to resolve import "../tts/ttsService"`.

- [ ] **Step 4: Implementar el servicio**

`desktop/src/main/tts/ttsService.ts`:

```ts
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
```

Nota: en los tests `join` de Node en Windows produce `C:\cache\<nombre>`, que es la clave que usa el disco falso.

- [ ] **Step 5: Ejecutar los tests del servicio**

Run: `npx vitest run src/main/__tests__/ttsService.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 6: Escribir el script WinRT**

`desktop/resources/tts/synth.ps1`:

```powershell
# Sintetizador de SeñaVoz: voces OneCore de Windows (WinRT) a WAV.
# Entrada por stdin (JSON UTF-8):
#   {"action":"voices"}
#   {"action":"synthesize","items":[{"text":"...","voiceId":"...|null","rate":1,"outPath":"C:\\...\\x.wav"}]}
# Salida por stdout (JSON): la lista de voces en español o un resultado por frase.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

# PowerShell 5.1 no sabe esperar operaciones WinRT: se convierten a Task con AsTask.
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($operation, [Type]$resultType) {
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.Wait()
  $task.Result
}

$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$all = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
$spanish = @($all | Where-Object { $_.Language -like 'es*' })

if ($request.action -eq 'voices') {
  $list = @($spanish | ForEach-Object { [pscustomobject]@{ id = $_.Id; name = $_.DisplayName; lang = $_.Language } })
  ConvertTo-Json -InputObject $list -Compress
  exit 0
}

# Voz por defecto: la del sistema si es española; si no, la primera española.
$systemDefault = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::DefaultVoice
$default = if ($systemDefault.Language -like 'es*') { $systemDefault } elseif ($spanish.Count -gt 0) { $spanish[0] } else { $systemDefault }

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$results = @(foreach ($item in $request.items) {
  try {
    $voice = $all | Where-Object { $_.Id -eq $item.voiceId } | Select-Object -First 1
    $synth.Voice = if ($voice) { $voice } else { $default }
    $synth.Options.SpeakingRate = [double]$item.rate
    $stream = Await ($synth.SynthesizeTextToStreamAsync([string]$item.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
    $size = [uint32]$stream.Size
    $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
    $null = Await ($reader.LoadAsync($size)) ([uint32])
    $bytes = New-Object byte[] $size
    $reader.ReadBytes($bytes)
    [IO.File]::WriteAllBytes([string]$item.outPath, $bytes)
    [pscustomobject]@{ ok = $true }
  } catch {
    [pscustomobject]@{ ok = $false; error = $_.Exception.Message }
  }
})
ConvertTo-Json -InputObject $results -Compress
```

- [ ] **Step 7: Implementar el lanzador de PowerShell**

`desktop/src/main/tts/runPowerShell.ts`:

```ts
import { spawn } from 'node:child_process';

import type { ScriptRunner } from './ttsService';

/** Lanza synth.ps1; la petición va por stdin (nunca como argumento) y la respuesta llega por stdout. */
export function createPowerShellRunner(scriptPath: string, timeoutMs = 30_000): ScriptRunner {
  return (request) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
        { windowsHide: true },
      );
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('El sintetizador no respondió a tiempo'));
      }, timeoutMs);
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => (err += chunk));
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(err.trim() || `PowerShell terminó con código ${code}`));
          return;
        }
        try {
          resolve(JSON.parse(out));
        } catch {
          reject(new Error('Respuesta no válida del sintetizador'));
        }
      });
      child.stdin.end(JSON.stringify(request), 'utf8');
    });
}
```

- [ ] **Step 8: Test de integración en Windows (texto con ñ, ¿ y á)**

`desktop/src/main/__tests__/synth.integration.test.ts`:

```ts
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
```

- [ ] **Step 9: Ejecutar la integración**

Run: `npx vitest run src/main/__tests__/synth.integration.test.ts`
Expected: PASS (2 tests) en Windows.

- [ ] **Step 10: Empaquetar el script**

En `desktop/electron-builder.yml`, después del bloque `files:`:

```yaml
# synth.ps1 se ejecuta con powershell.exe: debe quedar fuera del asar.
extraResources:
  - from: resources/tts
    to: tts
```

- [ ] **Step 11: Commit**

```bash
git add desktop/resources/tts desktop/src/main/tts desktop/src/main/__tests__/ttsService.test.ts desktop/src/main/__tests__/synth.integration.test.ts desktop/src/shared/ipc.ts desktop/electron-builder.yml
git commit -m "feat(desktop): sintetizador de voz de Windows con caché en main"
```

---

### Task 2: Ventana compacta, atajos globales y permiso de salida de audio

**Files:**
- Create: `desktop/src/main/meetingWindow.ts`
- Create: `desktop/src/main/meetingShortcuts.ts`
- Modify: `desktop/src/main/security.ts`
- Test: `desktop/src/main/__tests__/meetingWindow.test.ts`, `desktop/src/main/__tests__/meetingShortcuts.test.ts`, `desktop/src/main/__tests__/security.test.ts`

**Interfaces:**
- Produces: `type Rect = { x: number; y: number; width: number; height: number }`, `compactBounds(workArea: Rect, saved: Rect | null): Rect`, `parseRect(v: unknown): Rect | null`, `createMeetingWindow(deps): { readonly active: boolean; enter(): Promise<void>; exit(): Promise<void>; saveCompact(): Promise<void> }`.
- Produces: `MEETING_ACCELERATORS: string[]`, `createMeetingShortcuts(registry, onPhrase: (index: number) => void): { register(): string[]; unregister(): void }`.

- [ ] **Step 1: Tests de la ventana**

`desktop/src/main/__tests__/meetingWindow.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import {
  compactBounds,
  createMeetingWindow,
  parseRect,
  type MeetingWin,
  type Rect,
} from '../meetingWindow';

const work: Rect = { x: 0, y: 0, width: 1920, height: 1040 };

describe('compactBounds', () => {
  it('sin posición guardada, va a la esquina inferior derecha', () => {
    expect(compactBounds(work, null)).toEqual({ x: 1524, y: 424, width: 380, height: 600 });
  });

  it('reutiliza la posición guardada si cabe en la pantalla', () => {
    const saved = { x: 100, y: 100, width: 360, height: 560 };
    expect(compactBounds(work, saved)).toEqual(saved);
  });

  it('ignora la guardada si quedó fuera (p. ej. otro monitor desconectado)', () => {
    expect(compactBounds(work, { x: 2500, y: 100, width: 380, height: 600 })).toEqual(
      compactBounds(work, null),
    );
  });

  it('en una pantalla baja no se sale del área de trabajo', () => {
    const small = { x: 0, y: 0, width: 800, height: 500 };
    expect(compactBounds(small, null)).toEqual({ x: 404, y: 0, width: 380, height: 500 });
  });
});

describe('parseRect', () => {
  it('acepta un rectángulo y rechaza lo demás', () => {
    expect(parseRect({ x: 1, y: 2, width: 3, height: 4 })).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(parseRect({ x: 1 })).toBeNull();
    expect(parseRect(null)).toBeNull();
  });
});

function fakeWin(bounds: Rect, maximized = false) {
  let current = bounds;
  let isMax = maximized;
  const win = {
    getBounds: () => current,
    setBounds: vi.fn((r: Rect) => void (current = r)),
    setMinimumSize: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    isMaximized: () => isMax,
    unmaximize: vi.fn(() => void (isMax = false)),
    maximize: vi.fn(() => void (isMax = true)),
  };
  return win as typeof win & MeetingWin;
}

describe('createMeetingWindow', () => {
  const normal = { x: 50, y: 50, width: 1100, height: 720 };

  it('entrar compacta y fija encima; salir restaura y guarda la posición compacta', async () => {
    const win = fakeWin(normal);
    const save = vi.fn(async () => {});
    const mw = createMeetingWindow({ win, workArea: () => work, load: async () => null, save });

    await mw.enter();
    expect(mw.active).toBe(true);
    expect(win.getBounds()).toEqual({ x: 1524, y: 424, width: 380, height: 600 });
    expect(win.setMinimumSize).toHaveBeenLastCalledWith(340, 520);
    expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(true, 'floating');

    await mw.exit();
    expect(mw.active).toBe(false);
    expect(save).toHaveBeenCalledWith({ x: 1524, y: 424, width: 380, height: 600 });
    expect(win.getBounds()).toEqual(normal);
    expect(win.setMinimumSize).toHaveBeenLastCalledWith(900, 600);
    expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
  });

  it('si estaba maximizada, al salir vuelve a maximizarse', async () => {
    const win = fakeWin(normal, true);
    const mw = createMeetingWindow({ win, workArea: () => work, load: async () => null, save: async () => {} });
    await mw.enter();
    expect(win.unmaximize).toHaveBeenCalled();
    await mw.exit();
    expect(win.maximize).toHaveBeenCalled();
  });

  it('entrar dos veces no pisa los límites originales', async () => {
    const win = fakeWin(normal);
    const mw = createMeetingWindow({ win, workArea: () => work, load: async () => null, save: async () => {} });
    await mw.enter();
    await mw.enter();
    await mw.exit();
    expect(win.getBounds()).toEqual(normal);
  });

  it('salir sin haber entrado no hace nada', async () => {
    const win = fakeWin(normal);
    const save = vi.fn(async () => {});
    await createMeetingWindow({ win, workArea: () => work, load: async () => null, save }).exit();
    expect(save).not.toHaveBeenCalled();
    expect(win.setBounds).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Tests de los atajos**

`desktop/src/main/__tests__/meetingShortcuts.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { createMeetingShortcuts, MEETING_ACCELERATORS } from '../meetingShortcuts';

function fakeRegistry(taken: string[] = []) {
  const handlers = new Map<string, () => void>();
  return {
    handlers,
    register: vi.fn((accel: string, cb: () => void) => {
      if (taken.includes(accel)) return false;
      handlers.set(accel, cb);
      return true;
    }),
    unregister: vi.fn((accel: string) => void handlers.delete(accel)),
  };
}

describe('atajos de reunión', () => {
  it('registra Ctrl+Alt+1…9 y cada uno envía su índice', () => {
    const reg = fakeRegistry();
    const onPhrase = vi.fn();
    expect(createMeetingShortcuts(reg, onPhrase).register()).toEqual([]);
    expect([...reg.handlers.keys()]).toEqual(MEETING_ACCELERATORS);
    expect(MEETING_ACCELERATORS[0]).toBe('Control+Alt+1');
    reg.handlers.get('Control+Alt+3')!();
    expect(onPhrase).toHaveBeenCalledWith(2);
  });

  it('devuelve los atajos ocupados por otra app y registra el resto', () => {
    const reg = fakeRegistry(['Control+Alt+2']);
    expect(createMeetingShortcuts(reg, vi.fn()).register()).toEqual(['Control+Alt+2']);
    expect(reg.handlers.size).toBe(8);
  });

  it('unregister libera solo los que registró', () => {
    const reg = fakeRegistry(['Control+Alt+2']);
    const sc = createMeetingShortcuts(reg, vi.fn());
    sc.register();
    sc.unregister();
    expect(reg.handlers.size).toBe(0);
    expect(reg.unregister).toHaveBeenCalledTimes(8);
  });
});
```

- [ ] **Step 3: Añadir el caso de permiso**

En `desktop/src/main/__tests__/security.test.ts`, dentro de `describe('allowPermission')`:

```ts
  it('concede speaker-selection (setSinkId) solo a orígenes propios', () => {
    expect(allowPermission('speaker-selection', 'app://senavoz/', undefined)).toBe(true);
    expect(allowPermission('speaker-selection', 'https://evil.example/', undefined)).toBe(false);
  });
```

- [ ] **Step 4: Ejecutar y ver que fallan**

Run: `npx vitest run src/main`
Expected: FAIL (módulos `meetingWindow`/`meetingShortcuts` inexistentes y el nuevo caso de permiso).

- [ ] **Step 5: Implementar `meetingWindow.ts`**

```ts
export type Rect = { x: number; y: number; width: number; height: number };

/** Lo que el controlador usa de BrowserWindow (permite probarlo sin Electron). */
export type MeetingWin = {
  getBounds(): Rect;
  setBounds(bounds: Rect): void;
  setMinimumSize(width: number, height: number): void;
  setAlwaysOnTop(flag: boolean, level?: 'floating'): void;
  isMaximized(): boolean;
  unmaximize(): void;
  maximize(): void;
};

const COMPACT = { width: 380, height: 600, minWidth: 340, minHeight: 520 };
const NORMAL_MIN = { width: 900, height: 600 };
const MARGIN = 16;

const inside = (r: Rect, area: Rect) =>
  r.x >= area.x &&
  r.y >= area.y &&
  r.x + r.width <= area.x + area.width &&
  r.y + r.height <= area.y + area.height;

/** Límites de la ventana compacta: la posición guardada si cabe; si no, abajo a la derecha. */
export function compactBounds(workArea: Rect, saved: Rect | null): Rect {
  if (saved && inside(saved, workArea)) return saved;
  const width = Math.min(COMPACT.width, workArea.width);
  const height = Math.min(COMPACT.height, workArea.height);
  return {
    x: Math.max(workArea.x, workArea.x + workArea.width - width - MARGIN),
    y: Math.max(workArea.y, workArea.y + workArea.height - height - MARGIN),
    width,
    height,
  };
}

export function parseRect(v: unknown): Rect | null {
  if (typeof v !== 'object' || v === null) return null;
  const { x, y, width, height } = v as Record<string, unknown>;
  return [x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n))
    ? { x: x as number, y: y as number, width: width as number, height: height as number }
    : null;
}

export type MeetingWindowDeps = {
  win: MeetingWin;
  workArea: () => Rect;
  load: () => Promise<Rect | null>;
  save: (compact: Rect) => Promise<void>;
};

/** Transforma la única ventana de la app en la compacta "siempre visible" y la restaura. */
export function createMeetingWindow({ win, workArea, load, save }: MeetingWindowDeps) {
  let previous: { bounds: Rect; maximized: boolean } | null = null;

  return {
    get active() {
      return previous !== null;
    },
    async enter() {
      if (previous) return;
      previous = { bounds: win.getBounds(), maximized: win.isMaximized() };
      if (previous.maximized) {
        win.unmaximize();
        // unmaximize restaura los límites previos a maximizar; se guardan esos.
        previous.bounds = win.getBounds();
      }
      win.setMinimumSize(COMPACT.minWidth, COMPACT.minHeight);
      win.setBounds(compactBounds(workArea(), await load()));
      win.setAlwaysOnTop(true, 'floating');
    },
    /** Guarda dónde dejó el usuario la ventana compacta. */
    async saveCompact() {
      if (previous) await save(win.getBounds());
    },
    async exit() {
      if (!previous) return;
      await save(win.getBounds());
      const { bounds, maximized } = previous;
      previous = null;
      win.setAlwaysOnTop(false);
      win.setMinimumSize(NORMAL_MIN.width, NORMAL_MIN.height);
      win.setBounds(bounds);
      if (maximized) win.maximize();
    },
  };
}
```

- [ ] **Step 6: Implementar `meetingShortcuts.ts`**

```ts
/** Lo que se usa de globalShortcut. */
export type ShortcutRegistry = {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
};

/** Ctrl+Alt+1…9: no bloquean los números al escribir en el chat de la reunión. */
export const MEETING_ACCELERATORS = Array.from({ length: 9 }, (_, i) => `Control+Alt+${i + 1}`);

export function createMeetingShortcuts(
  registry: ShortcutRegistry,
  onPhrase: (index: number) => void,
) {
  let registered: string[] = [];
  const unregister = () => {
    registered.forEach((a) => registry.unregister(a));
    registered = [];
  };
  return {
    /** Registra los nueve atajos y devuelve los que otra app ya ocupa. */
    register(): string[] {
      unregister();
      const failed: string[] = [];
      MEETING_ACCELERATORS.forEach((accel, index) => {
        if (registry.register(accel, () => onPhrase(index))) registered.push(accel);
        else failed.push(accel);
      });
      return failed;
    },
    unregister,
  };
}
```

- [ ] **Step 7: Permitir `speaker-selection`**

En `desktop/src/main/security.ts`, reemplazar `allowPermission`:

```ts
/** Cámara ("media") y elección de salida de audio (setSinkId), solo para la propia app. */
export function allowPermission(
  permission: string,
  requestingUrl: string,
  devUrl: string | undefined,
): boolean {
  return (
    (permission === 'media' || permission === 'speaker-selection') &&
    isTrustedOrigin(requestingUrl, devUrl)
  );
}
```

- [ ] **Step 8: Ejecutar los tests de main**

Run: `npx vitest run src/main`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add desktop/src/main
git commit -m "feat(desktop): ventana compacta, atajos Ctrl+Alt+1–9 y permiso de salida de audio"
```

---

### Task 3: Contrato IPC, preload y cableado en main

**Files:**
- Modify: `desktop/src/shared/ipc.ts`
- Modify: `desktop/src/preload/index.ts`
- Modify: `desktop/src/main/index.ts`
- Modify: `desktop/src/renderer/src/test/fakeSenavoz.ts`

**Interfaces:**
- Consumes: Task 1 (`createTtsService`, `parseSynthItems`, `parseKeep`, `createPowerShellRunner`), Task 2 (`createMeetingWindow`, `parseRect`, `createMeetingShortcuts`).
- Produces: `window.senavoz.tts.{voices, synthesize, prune}`, `window.senavoz.meeting.{enter, exit, onShortcut}`; `installFakeSenavoz(opts?)` que devuelve `{ stored, api, pressShortcut(index) }`.

- [ ] **Step 1: Ampliar el contrato**

En `desktop/src/shared/ipc.ts`, reemplazar `SenavozApi` e `IPC`:

```ts
/** Única API que el preload expone al renderer. */
export type SenavozApi = {
  tokens: {
    get(): Promise<Tokens | null>;
    save(tokens: Tokens): Promise<void>;
    clear(): Promise<void>;
  };
  tts: {
    voices(): Promise<TtsVoice[]>;
    synthesize(items: SynthItem[]): Promise<SynthResult[]>;
    /** Borra los audios que no sean de esta voz y velocidad. */
    prune(keep: { voiceId: string | null; rate: number }): Promise<void>;
  };
  meeting: {
    enter(): Promise<{ failedShortcuts: string[] }>;
    exit(): Promise<void>;
    /** Ctrl+Alt+N durante el Modo reunión; devuelve la función para cancelar la suscripción. */
    onShortcut(callback: (index: number) => void): () => void;
  };
};

export const IPC = {
  tokensGet: 'tokens:get',
  tokensSave: 'tokens:save',
  tokensClear: 'tokens:clear',
  ttsVoices: 'tts:voices',
  ttsSynthesize: 'tts:synthesize',
  ttsPrune: 'tts:prune',
  meetingEnter: 'meeting:enter',
  meetingExit: 'meeting:exit',
  meetingShortcut: 'meeting:shortcut',
} as const;
```

- [ ] **Step 2: Preload**

`desktop/src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import { IPC, type SenavozApi, type SynthItem, type Tokens } from '../shared/ipc';

const api: SenavozApi = {
  tokens: {
    get: () => ipcRenderer.invoke(IPC.tokensGet),
    save: (tokens: Tokens) => ipcRenderer.invoke(IPC.tokensSave, tokens),
    clear: () => ipcRenderer.invoke(IPC.tokensClear),
  },
  tts: {
    voices: () => ipcRenderer.invoke(IPC.ttsVoices),
    synthesize: (items: SynthItem[]) => ipcRenderer.invoke(IPC.ttsSynthesize, items),
    prune: (keep) => ipcRenderer.invoke(IPC.ttsPrune, keep),
  },
  meeting: {
    enter: () => ipcRenderer.invoke(IPC.meetingEnter),
    exit: () => ipcRenderer.invoke(IPC.meetingExit),
    onShortcut: (callback) => {
      const listener = (_e: IpcRendererEvent, index: number) => callback(index);
      ipcRenderer.on(IPC.meetingShortcut, listener);
      return () => ipcRenderer.removeListener(IPC.meetingShortcut, listener);
    },
  },
};

contextBridge.exposeInMainWorld('senavoz', api);
```

- [ ] **Step 3: Cablear en main**

En `desktop/src/main/index.ts`:

1. Imports:

```ts
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  net,
  protocol,
  safeStorage,
  screen,
  session,
  shell,
} from 'electron';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { IPC, type Tokens } from '../shared/ipc';
import { APP_ORIGIN, APP_SCHEME, resolveAppPath } from './appProtocol';
import { createMeetingShortcuts } from './meetingShortcuts';
import { createMeetingWindow, parseRect } from './meetingWindow';
import { allowPermission, isTrustedOrigin } from './security';
import { createTokenStore } from './tokenStore';
import { createPowerShellRunner } from './tts/runPowerShell';
import { createTtsService, parseKeep, parseSynthItems } from './tts/ttsService';
import { asciiUserAgent } from './userAgent';
```

2. Reemplazar `registerIpc` por:

```ts
/** synth.ps1 va en extraResources al empaquetar; en desarrollo se lee de resources/. */
const synthScriptPath = () =>
  app.isPackaged
    ? join(process.resourcesPath, 'tts', 'synth.ps1')
    : join(app.getAppPath(), 'resources', 'tts', 'synth.ps1');

function registerIpc(win: BrowserWindow) {
  const userData = app.getPath('userData');
  const store = createTokenStore({
    filePath: join(userData, 'session.bin'),
    safeStorage,
    fs: { readFile, writeFile, rm: (p) => rm(p, { force: true }) },
  });
  ipcMain.handle(IPC.tokensGet, () => store.get());
  ipcMain.handle(IPC.tokensSave, (_e, tokens: Tokens) => store.save(tokens));
  ipcMain.handle(IPC.tokensClear, () => store.clear());

  const tts = createTtsService({
    cacheDir: join(userData, 'tts-cache'),
    run: createPowerShellRunner(synthScriptPath()),
    fs: {
      readFile,
      readdir,
      rm: (p) => rm(p, { force: true }),
      mkdir: async (p) => void (await mkdir(p, { recursive: true })),
    },
  });
  ipcMain.handle(IPC.ttsVoices, () => tts.voices().catch(() => []));
  ipcMain.handle(IPC.ttsSynthesize, (_e, items: unknown) => tts.synthesize(parseSynthItems(items)));
  ipcMain.handle(IPC.ttsPrune, (_e, keep: unknown) => tts.prune(parseKeep(keep)));

  const statePath = join(userData, 'window-state.json');
  const meetingWindow = createMeetingWindow({
    win,
    workArea: () => screen.getDisplayMatching(win.getBounds()).workArea,
    load: async () => {
      try {
        return parseRect(JSON.parse(await readFile(statePath, 'utf8')).compact);
      } catch {
        return null;
      }
    },
    save: (compact) => writeFile(statePath, JSON.stringify({ compact })),
  });
  const shortcuts = createMeetingShortcuts(globalShortcut, (index) =>
    win.webContents.send(IPC.meetingShortcut, index),
  );
  ipcMain.handle(IPC.meetingEnter, async () => {
    await meetingWindow.enter();
    return { failedShortcuts: shortcuts.register() };
  });
  ipcMain.handle(IPC.meetingExit, async () => {
    shortcuts.unregister();
    await meetingWindow.exit();
  });
  // Cerrar en Modo reunión: se recuerda la posición compacta y la próxima vez arranca normal.
  win.on('close', () => {
    void meetingWindow.saveCompact();
    shortcuts.unregister();
  });
}
```

3. `createWindow` devuelve la ventana (`return win;` al final, tipo `BrowserWindow`), y en `app.whenReady()`:

```ts
  applySecurity();
  registerIpc(createWindow());
```

(eliminar la llamada antigua `registerIpc();` y la segunda `createWindow();`).

4. Al final del archivo:

```ts
app.on('will-quit', () => globalShortcut.unregisterAll());
```

- [ ] **Step 4: Ampliar el preload falso de los tests**

`desktop/src/renderer/src/test/fakeSenavoz.ts`:

```ts
import { vi } from 'vitest';

import type { SenavozApi, SynthItem, SynthResult, Tokens, TtsVoice } from '../../../shared/ipc';

type Options = {
  voices?: TtsVoice[];
  synthesize?: (items: SynthItem[]) => Promise<SynthResult[]>;
  failedShortcuts?: string[];
};

/** Sustituto en memoria del preload para los tests del renderer. */
export function installFakeSenavoz(options: Options = {}) {
  let stored: Tokens | null = null;
  const shortcutListeners = new Set<(index: number) => void>();
  const api: SenavozApi = {
    tokens: {
      get: async () => stored,
      save: async (t) => void (stored = t),
      clear: async () => void (stored = null),
    },
    tts: {
      voices: vi.fn(async () => options.voices ?? []),
      synthesize: vi.fn(
        options.synthesize ??
          (async (items: SynthItem[]) =>
            items.map(() => ({ ok: true as const, wav: new ArrayBuffer(8) }))),
      ),
      prune: vi.fn(async () => {}),
    },
    meeting: {
      enter: vi.fn(async () => ({ failedShortcuts: options.failedShortcuts ?? [] })),
      exit: vi.fn(async () => {}),
      onShortcut: (callback) => {
        shortcutListeners.add(callback);
        return () => void shortcutListeners.delete(callback);
      },
    },
  };
  Object.defineProperty(window, 'senavoz', { value: api, configurable: true });
  return {
    stored: () => stored,
    api,
    pressShortcut: (index: number) => shortcutListeners.forEach((cb) => cb(index)),
  };
}
```

- [ ] **Step 5: Verificar tipos y tests**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck sin errores; todos los tests PASS.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/shared desktop/src/preload desktop/src/main/index.ts desktop/src/renderer/src/test/fakeSenavoz.ts
git commit -m "feat(desktop): IPC de voz y Modo reunión entre main y renderer"
```

---

### Task 4: Ajustes, dispositivos de salida y estado de reunión

**Files:**
- Modify: `desktop/src/renderer/src/store/settings.ts`
- Create: `desktop/src/renderer/src/services/audio/outputDevice.ts`
- Create: `desktop/src/renderer/src/store/meeting.ts`
- Create: `desktop/src/renderer/src/store/playback.ts`
- Create: `desktop/src/renderer/src/hooks/useOutputDevices.ts`
- Test: `desktop/src/renderer/src/__tests__/outputDevice.test.ts`

**Interfaces:**
- Produces (`store/settings.ts`): estado `{ volume, rate, voiceId: string | null, cameraId, meetingOutput: OutputDevice | null }` y setters `setVolume, setRate, setVoiceId, setCameraId, setMeetingOutput`.
- Produces (`outputDevice.ts`): `type OutputDevice = { id: string; label: string }`, `listOutputDevices(media?): Promise<OutputDevice[]>`, `findCable(devices): OutputDevice | null`, `resolveMeetingOutput(saved: OutputDevice | null, devices: OutputDevice[]): OutputDevice | null`.
- Produces (`store/meeting.ts`): `useMeeting` con `{ active, sinkId, deviceMissing, paused, failedShortcuts, start(sinkId, failedShortcuts), stop(), setSink(id: string | null), togglePause() }`.
- Produces (`store/playback.ts`): `usePlayback` con `{ lastText, playing, preparing, synthError, spoke(text), setPlaying(b), setPreparing(b), setSynthError(b) }`.
- Produces (`useOutputDevices.ts`): `useOutputDevices(): { devices: OutputDevice[]; loaded: boolean; refresh(): void }`.

- [ ] **Step 1: Tests de dispositivos y stores**

`desktop/src/renderer/src/__tests__/outputDevice.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  findCable,
  listOutputDevices,
  resolveMeetingOutput,
} from '@/services/audio/outputDevice';
import { useMeeting } from '@/store/meeting';

const cable = { id: 'c1', label: 'CABLE Input (VB-Audio Virtual Cable)' };
const speakers = { id: 's1', label: 'Altavoces (Realtek(R) Audio)' };

describe('dispositivos de salida', () => {
  it('lista solo salidas de audio reales (sin los alias default/communications)', async () => {
    const media = {
      enumerateDevices: async () =>
        [
          { kind: 'audiooutput', deviceId: 'default', label: 'Predeterminado' },
          { kind: 'audiooutput', deviceId: 'communications', label: 'Comunicaciones' },
          { kind: 'audiooutput', deviceId: 'c1', label: cable.label },
          { kind: 'audioinput', deviceId: 'm1', label: 'Micrófono' },
        ] as MediaDeviceInfo[],
    };
    expect(await listOutputDevices(media)).toEqual([cable]);
  });

  it('detecta VB-Cable por su etiqueta', () => {
    expect(findCable([speakers, cable])).toEqual(cable);
    expect(findCable([speakers])).toBeNull();
  });

  it('sin elección guardada usa el cable; con elección, la busca por id y luego por etiqueta', () => {
    expect(resolveMeetingOutput(null, [speakers, cable])).toEqual(cable);
    expect(resolveMeetingOutput(speakers, [speakers, cable])).toEqual(speakers);
    const renamed = { id: 'c2', label: cable.label };
    expect(resolveMeetingOutput(cable, [renamed])).toEqual(renamed);
    expect(resolveMeetingOutput(cable, [speakers])).toBeNull();
  });
});

describe('estado de reunión', () => {
  it('start/stop, dispositivo ausente y pausa', () => {
    const m = useMeeting.getState();
    m.start('c1', ['Control+Alt+2']);
    expect(useMeeting.getState()).toMatchObject({ active: true, sinkId: 'c1', deviceMissing: false });
    useMeeting.getState().setSink(null);
    expect(useMeeting.getState().deviceMissing).toBe(true);
    useMeeting.getState().setSink('c1');
    expect(useMeeting.getState().deviceMissing).toBe(false);
    useMeeting.getState().togglePause();
    expect(useMeeting.getState().paused).toBe(true);
    useMeeting.getState().stop();
    expect(useMeeting.getState()).toMatchObject({ active: false, paused: false });
    // Los atajos fallidos se conservan para mostrarlos en Ajustes.
    expect(useMeeting.getState().failedShortcuts).toEqual(['Control+Alt+2']);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/renderer/src/__tests__/outputDevice.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar `outputDevice.ts`**

```ts
export type OutputDevice = { id: string; label: string };

const CABLE = /CABLE Input/i;
// Chromium añade alias que no son dispositivos reales.
const ALIASES = new Set(['default', 'communications']);

export async function listOutputDevices(
  media: Pick<MediaDevices, 'enumerateDevices'> = navigator.mediaDevices,
): Promise<OutputDevice[]> {
  const devices = await media.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audiooutput' && !ALIASES.has(d.deviceId))
    .map((d) => ({ id: d.deviceId, label: d.label }));
}

/** VB-Cable: en Windows su extremo de reproducción se llama "CABLE Input". */
export const findCable = (devices: OutputDevice[]) =>
  devices.find((d) => CABLE.test(d.label)) ?? null;

/**
 * Dispositivo por el que habla el Modo reunión: el elegido en Ajustes (por id o, si
 * Windows le cambió el id, por etiqueta) o, sin elección, VB-Cable.
 */
export function resolveMeetingOutput(
  saved: OutputDevice | null,
  devices: OutputDevice[],
): OutputDevice | null {
  if (!saved) return findCable(devices);
  return (
    devices.find((d) => d.id === saved.id) ?? devices.find((d) => d.label === saved.label) ?? null
  );
}
```

- [ ] **Step 4: Implementar los stores**

`desktop/src/renderer/src/store/meeting.ts`:

```ts
import { create } from 'zustand';

type MeetingState = {
  active: boolean;
  /** deviceId del micrófono virtual (lado de reproducción). */
  sinkId: string;
  /** El dispositivo desapareció: no se envía nada hasta que vuelva. */
  deviceMissing: boolean;
  paused: boolean;
  failedShortcuts: string[];
  start: (sinkId: string, failedShortcuts: string[]) => void;
  stop: () => void;
  setSink: (sinkId: string | null) => void;
  togglePause: () => void;
};

// No se persiste: la app siempre arranca fuera del Modo reunión.
export const useMeeting = create<MeetingState>()((set) => ({
  active: false,
  sinkId: '',
  deviceMissing: false,
  paused: false,
  failedShortcuts: [],
  start: (sinkId, failedShortcuts) =>
    set({ active: true, sinkId, deviceMissing: false, paused: false, failedShortcuts }),
  stop: () => set({ active: false, sinkId: '', deviceMissing: false, paused: false }),
  setSink: (sinkId) => set(sinkId ? { sinkId, deviceMissing: false } : { deviceMissing: true }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
}));
```

`desktop/src/renderer/src/store/playback.ts`:

```ts
import { create } from 'zustand';

type PlaybackState = {
  /** Última frase dicha (por clic, atajo o seña). */
  lastText: string | null;
  /** Hay audio sonando: se muestra porque el usuario no lo oye. */
  playing: boolean;
  /** Generando los audios del catálogo. */
  preparing: boolean;
  synthError: boolean;
  spoke: (text: string) => void;
  setPlaying: (playing: boolean) => void;
  setPreparing: (preparing: boolean) => void;
  setSynthError: (synthError: boolean) => void;
};

export const usePlayback = create<PlaybackState>()((set) => ({
  lastText: null,
  playing: false,
  preparing: false,
  synthError: false,
  spoke: (lastText) => set({ lastText, synthError: false }),
  setPlaying: (playing) => set({ playing }),
  setPreparing: (preparing) => set({ preparing }),
  setSynthError: (synthError) => set({ synthError }),
}));
```

`desktop/src/renderer/src/store/settings.ts`:

```ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { OutputDevice } from '@/services/audio/outputDevice';

type SettingsState = {
  /** 0..1 */
  volume: number;
  /** Velocidad de habla; 1 = normal. */
  rate: number;
  /** Id de la voz de Windows elegida; null = predeterminada. */
  voiceId: string | null;
  /** deviceId de la webcam preferida; null = predeterminada. */
  cameraId: string | null;
  /** Salida del Modo reunión; null = VB-Cable detectado automáticamente. */
  meetingOutput: OutputDevice | null;
  setVolume: (v: number) => void;
  setRate: (r: number) => void;
  setVoiceId: (id: string | null) => void;
  setCameraId: (id: string | null) => void;
  setMeetingOutput: (device: OutputDevice | null) => void;
};

// Preferencias no sensibles: localStorage es apropiado (los tokens NO van aquí).
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      volume: 1,
      rate: 1,
      voiceId: null,
      cameraId: null,
      meetingOutput: null,
      setVolume: (volume) => set({ volume }),
      setRate: (rate) => set({ rate }),
      setVoiceId: (voiceId) => set({ voiceId }),
      setCameraId: (cameraId) => set({ cameraId }),
      setMeetingOutput: (meetingOutput) => set({ meetingOutput }),
    }),
    {
      name: 'senavoz.settings',
      storage: createJSONStorage(() => localStorage),
      // v0 guardaba `voiceURI` de Chromium, que no sirve para las voces de Windows: se descarta.
      version: 1,
      migrate: (persisted) => {
        const { voiceURI: _dropped, ...rest } = (persisted ?? {}) as Record<string, unknown>;
        return { ...rest, voiceId: null } as unknown as SettingsState;
      },
    },
  ),
);
```

- [ ] **Step 5: Hook de dispositivos**

`desktop/src/renderer/src/hooks/useOutputDevices.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';

import { listOutputDevices, type OutputDevice } from '@/services/audio/outputDevice';

/** Salidas de audio; se actualiza al conectar o desconectar dispositivos. */
export function useOutputDevices() {
  const [state, setState] = useState<{ devices: OutputDevice[]; loaded: boolean }>({
    devices: [],
    loaded: false,
  });
  const refresh = useCallback(() => {
    listOutputDevices().then(
      (devices) => setState({ devices, loaded: true }),
      () => setState({ devices: [], loaded: true }),
    );
  }, []);
  useEffect(() => {
    refresh();
    const media = navigator.mediaDevices;
    media?.addEventListener?.('devicechange', refresh);
    return () => media?.removeEventListener?.('devicechange', refresh);
  }, [refresh]);
  return { ...state, refresh };
}
```

- [ ] **Step 6: Ejecutar los tests**

Run: `npx vitest run src/renderer/src/__tests__/outputDevice.test.ts`
Expected: PASS. (`settings.test.tsx` fallará hasta la Task 11; no se toca aquí.)

- [ ] **Step 7: Commit**

```bash
git add desktop/src/renderer/src/store desktop/src/renderer/src/services/audio desktop/src/renderer/src/hooks/useOutputDevices.ts desktop/src/renderer/src/__tests__/outputDevice.test.ts
git commit -m "feat(desktop): detección de VB-Cable y estado de reunión y reproducción"
```

---

### Task 5: `GeneratedSpeechService` (audio generado + `setSinkId`)

**Files:**
- Create: `desktop/src/renderer/src/services/speech/GeneratedSpeechService.ts`
- Create: `desktop/src/renderer/src/services/speech/useTtsVoices.ts`
- Modify: `desktop/src/renderer/src/services/speech/index.ts`
- Delete: `desktop/src/renderer/src/services/speech/CachedAudioSpeechService.ts`, `desktop/src/renderer/src/services/speech/useSpanishVoices.ts`, `desktop/src/renderer/src/__tests__/voices.test.tsx`
- Modify: `desktop/src/renderer/src/__tests__/speech.test.ts`
- Test: `desktop/src/renderer/src/__tests__/generatedSpeech.test.ts`

**Interfaces:**
- Consumes: `SynthItem`, `SynthResult` (Task 1); `useMeeting`, `usePlayback`, `useSettings` (Task 4).
- Produces: `class GeneratedSpeechService implements SpeechService` con `speak(target, sinkOverride?: string): Promise<void>`, `stop(): void`, `warm(texts: string[]): Promise<void>`; `speechService: GeneratedSpeechService` exportado por `@/services/speech`; `useTtsVoices(): { voices: TtsVoice[]; loaded: boolean }`.

- [ ] **Step 1: Tests**

`desktop/src/renderer/src/__tests__/generatedSpeech.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import {
  GeneratedSpeechService,
  type GeneratedSpeechDeps,
  type SpeechRoute,
} from '@/services/speech/GeneratedSpeechService';

function fakeAudio() {
  return {
    src: '',
    volume: 1,
    onended: null as null | (() => void),
    setSinkId: vi.fn(async (_id: string) => {}),
    play: vi.fn(async () => {}),
    pause: vi.fn(),
  };
}

function setup(route: Partial<SpeechRoute> = {}, ok = true) {
  const audios: ReturnType<typeof fakeAudio>[] = [];
  const deps = {
    synthesize: vi.fn(async (items: { text: string }[]) =>
      items.map(() => (ok ? { ok: true as const, wav: new ArrayBuffer(8) } : { ok: false as const, error: 'x' })),
    ),
    options: () => ({ volume: 0.4, rate: 1, voiceId: 'v1' }),
    route: () => ({ meeting: false, sinkId: '', blocked: false, ...route }),
    fallback: { speak: vi.fn(async () => {}), stop: vi.fn() },
    events: { onSpoken: vi.fn(), onPlaying: vi.fn(), onError: vi.fn() },
    createAudio: () => {
      const a = fakeAudio();
      audios.push(a);
      return a as unknown as HTMLAudioElement;
    },
    toUrl: () => 'blob:x',
  } satisfies GeneratedSpeechDeps;
  return { svc: new GeneratedSpeechService(deps), deps, audios };
}

describe('GeneratedSpeechService', () => {
  it('fuera de reunión reproduce el audio generado por la salida predeterminada', async () => {
    const { svc, deps, audios } = setup();
    await svc.speak({ code: 'yes', text: 'Sí' });
    expect(deps.synthesize).toHaveBeenCalledWith([{ text: 'Sí', voiceId: 'v1', rate: 1 }]);
    expect(audios[0].setSinkId).toHaveBeenCalledWith('');
    expect(audios[0].volume).toBe(0.4);
    expect(audios[0].play).toHaveBeenCalled();
    expect(deps.events.onSpoken).toHaveBeenCalledWith('Sí');
    expect(deps.events.onPlaying).toHaveBeenCalledWith(true);
  });

  it('en reunión envía el audio al dispositivo del cable', async () => {
    const { svc, audios } = setup({ meeting: true, sinkId: 'cable' });
    await svc.speak('Hola');
    expect(audios[0].setSinkId).toHaveBeenCalledWith('cable');
  });

  it('reutiliza el audio ya generado', async () => {
    const { svc, deps } = setup();
    await svc.speak('Hola');
    await svc.speak('Hola');
    expect(deps.synthesize).toHaveBeenCalledTimes(1);
  });

  it('en reunión, si falla la síntesis no usa speechSynthesis (altavoces) y avisa', async () => {
    const { svc, deps, audios } = setup({ meeting: true, sinkId: 'cable' }, false);
    await svc.speak('Hola');
    expect(deps.fallback.speak).not.toHaveBeenCalled();
    expect(audios).toHaveLength(0);
    expect(deps.events.onError).toHaveBeenCalledWith('synth');
  });

  it('fuera de reunión, si falla la síntesis usa la voz del sistema', async () => {
    const { svc, deps } = setup({}, false);
    await svc.speak('Hola');
    expect(deps.fallback.speak).toHaveBeenCalledWith('Hola');
    expect(deps.events.onSpoken).toHaveBeenCalledWith('Hola');
  });

  it('en reunión con la voz en pausa o sin dispositivo no suena nada', async () => {
    const { svc, deps, audios } = setup({ meeting: true, sinkId: 'cable', blocked: true });
    await svc.speak('Hola');
    expect(deps.synthesize).not.toHaveBeenCalled();
    expect(deps.fallback.speak).not.toHaveBeenCalled();
    expect(audios).toHaveLength(0);
  });

  it('si setSinkId falla en reunión, no reproduce y marca el dispositivo como perdido', async () => {
    const { svc, deps, audios } = setup({ meeting: true, sinkId: 'cable' });
    const original = deps.createAudio;
    deps.createAudio = () => {
      const a = original() as unknown as ReturnType<typeof fakeAudio>;
      a.setSinkId.mockRejectedValue(new Error('NotFoundError'));
      return a as unknown as HTMLAudioElement;
    };
    const svc2 = new GeneratedSpeechService(deps);
    await svc2.speak('Hola');
    expect(audios.at(-1)!.play).not.toHaveBeenCalled();
    expect(deps.events.onError).toHaveBeenCalledWith('device');
    void svc;
  });

  it('sinkOverride manda una prueba al cable aunque no haya reunión', async () => {
    const { svc, audios } = setup();
    await svc.speak('Prueba', 'cable');
    expect(audios[0].setSinkId).toHaveBeenCalledWith('cable');
  });

  it('warm genera en un lote solo lo que falta', async () => {
    const { svc, deps } = setup();
    await svc.speak('Sí');
    deps.synthesize.mockClear();
    await svc.warm(['Sí', 'No', 'No', 'Gracias']);
    expect(deps.synthesize).toHaveBeenCalledTimes(1);
    expect(deps.synthesize).toHaveBeenCalledWith([
      { text: 'No', voiceId: 'v1', rate: 1 },
      { text: 'Gracias', voiceId: 'v1', rate: 1 },
    ]);
  });

  it('al terminar el audio avisa de que ya no suena; stop corta y avisa', async () => {
    const { svc, deps, audios } = setup();
    await svc.speak('Hola');
    audios[0].onended!();
    expect(deps.events.onPlaying).toHaveBeenLastCalledWith(false);
    await svc.speak('Otra');
    svc.stop();
    expect(audios[1].pause).toHaveBeenCalled();
    expect(deps.fallback.stop).toHaveBeenCalled();
    expect(deps.events.onPlaying).toHaveBeenLastCalledWith(false);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/renderer/src/__tests__/generatedSpeech.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar el servicio**

`desktop/src/renderer/src/services/speech/GeneratedSpeechService.ts`:

```ts
import type { SynthItem, SynthResult } from '../../../../shared/ipc';
import type { SpeakablePhrase, SpeechService } from './SpeechService';

/** Adónde va la voz ahora mismo. */
export type SpeechRoute = {
  /** Modo reunión: la voz solo puede salir por `sinkId`, nunca por los altavoces. */
  meeting: boolean;
  sinkId: string;
  /** Voz en pausa o micrófono virtual ausente. */
  blocked: boolean;
};

export type GeneratedSpeechDeps = {
  synthesize: (items: SynthItem[]) => Promise<SynthResult[]>;
  options: () => { volume: number; rate: number; voiceId: string | null };
  route: () => SpeechRoute;
  /** Voz del sistema (Web Speech): solo fuera del Modo reunión. */
  fallback: SpeechService;
  events?: {
    onSpoken?: (text: string) => void;
    onPlaying?: (playing: boolean) => void;
    onError?: (kind: 'synth' | 'device') => void;
  };
  createAudio?: () => HTMLAudioElement;
  toUrl?: (wav: ArrayBuffer) => string;
};

/**
 * Reproduce audio generado con las voces de Windows (ver docs/ARCHITECTURE.md). A
 * diferencia de speechSynthesis, un HTMLAudioElement puede elegir el dispositivo de
 * salida con setSinkId: así la voz llega al micrófono virtual de la reunión.
 */
export class GeneratedSpeechService implements SpeechService {
  private audio: HTMLAudioElement | null = null;
  private readonly urls = new Map<string, string>();

  constructor(private readonly deps: GeneratedSpeechDeps) {}

  private combo(): { voiceId: string | null; rate: number; prefix: string } {
    const { voiceId, rate } = this.deps.options();
    return { voiceId, rate, prefix: `${voiceId ?? ''}|${rate}|` };
  }

  private toUrl(wav: ArrayBuffer): string {
    return this.deps.toUrl
      ? this.deps.toUrl(wav)
      : URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  }

  /** Genera en un lote los audios que falten y libera los de otras voces o velocidades. */
  async warm(texts: string[]): Promise<void> {
    const { voiceId, rate, prefix } = this.combo();
    for (const [key, url] of this.urls) {
      if (!key.startsWith(prefix)) {
        if (!this.deps.toUrl) URL.revokeObjectURL(url);
        this.urls.delete(key);
      }
    }
    const missing = [...new Set(texts)].filter((t) => !this.urls.has(prefix + t));
    if (missing.length === 0) return;
    const results = await this.deps.synthesize(missing.map((text) => ({ text, voiceId, rate })));
    results.forEach((r, i) => {
      if (r.ok) this.urls.set(prefix + missing[i], this.toUrl(r.wav));
    });
  }

  private async urlFor(text: string): Promise<string | null> {
    const { voiceId, rate, prefix } = this.combo();
    const cached = this.urls.get(prefix + text);
    if (cached) return cached;
    let result: SynthResult | undefined;
    try {
      [result] = await this.deps.synthesize([{ text, voiceId, rate }]);
    } catch {
      return null;
    }
    if (!result?.ok) return null;
    const url = this.toUrl(result.wav);
    this.urls.set(prefix + text, url);
    return url;
  }

  /** `sinkOverride`: manda una prueba a ese dispositivo aunque no haya reunión. */
  async speak(target: SpeakablePhrase | string, sinkOverride?: string): Promise<void> {
    const text = typeof target === 'string' ? target : target.text;
    const route: SpeechRoute =
      sinkOverride !== undefined
        ? { meeting: true, sinkId: sinkOverride, blocked: false }
        : this.deps.route();
    const events = this.deps.events ?? {};
    if (route.meeting && route.blocked) return;

    const url = await this.urlFor(text);
    if (!url) {
      if (route.meeting) {
        events.onError?.('synth');
        return;
      }
      events.onSpoken?.(text);
      return this.deps.fallback.speak(target);
    }

    this.stopAudio();
    this.deps.fallback.stop();
    const audio = this.deps.createAudio ? this.deps.createAudio() : new Audio();
    audio.src = url;
    audio.volume = this.deps.options().volume;
    audio.onended = () => {
      if (this.audio === audio) events.onPlaying?.(false);
    };
    this.audio = audio;
    try {
      await audio.setSinkId(route.meeting ? route.sinkId : '');
    } catch {
      if (route.meeting) {
        events.onError?.('device');
        return;
      }
    }
    events.onSpoken?.(text);
    events.onPlaying?.(true);
    await audio.play();
  }

  private stopAudio(): void {
    this.audio?.pause();
    this.audio = null;
  }

  stop(): void {
    this.stopAudio();
    this.deps.fallback.stop();
    this.deps.events?.onPlaying?.(false);
  }
}
```

- [ ] **Step 4: Cablear `speechService` y la lista de voces**

`desktop/src/renderer/src/services/speech/index.ts`:

```ts
import { useMeeting } from '@/store/meeting';
import { usePlayback } from '@/store/playback';
import { useSettings } from '@/store/settings';

import { GeneratedSpeechService } from './GeneratedSpeechService';
import { WebSpeechService } from './WebSpeechService';

export type { SpeakablePhrase, SpeechService } from './SpeechService';

// La voz del sistema solo se usa como respaldo fuera del Modo reunión, con su voz predeterminada.
const systemVoice = new WebSpeechService(() => {
  const { volume, rate } = useSettings.getState();
  return { volume, rate, voiceURI: null };
});

/** Punto único donde se elige la implementación. */
export const speechService = new GeneratedSpeechService({
  synthesize: (items) => window.senavoz.tts.synthesize(items),
  options: () => {
    const { volume, rate, voiceId } = useSettings.getState();
    return { volume, rate, voiceId };
  },
  route: () => {
    const m = useMeeting.getState();
    return { meeting: m.active, sinkId: m.sinkId, blocked: m.paused || m.deviceMissing };
  },
  fallback: systemVoice,
  events: {
    onSpoken: (text) => usePlayback.getState().spoke(text),
    onPlaying: (playing) => usePlayback.getState().setPlaying(playing),
    onError: (kind) =>
      kind === 'device'
        ? useMeeting.getState().setSink(null)
        : usePlayback.getState().setSynthError(true),
  },
});
```

`desktop/src/renderer/src/services/speech/useTtsVoices.ts`:

```ts
import { useEffect, useState } from 'react';

import type { TtsVoice } from '../../../../shared/ipc';

/** Voces de Windows en español: las mismas con las que se generan los audios. */
export function useTtsVoices(): { voices: TtsVoice[]; loaded: boolean } {
  const [state, setState] = useState<{ voices: TtsVoice[]; loaded: boolean }>({
    voices: [],
    loaded: false,
  });
  useEffect(() => {
    let cancelled = false;
    window.senavoz.tts.voices().then(
      (voices) => !cancelled && setState({ voices, loaded: true }),
      () => !cancelled && setState({ voices: [], loaded: true }),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
```

- [ ] **Step 5: Retirar lo sustituido**

```bash
git rm desktop/src/renderer/src/services/speech/CachedAudioSpeechService.ts desktop/src/renderer/src/services/speech/useSpanishVoices.ts desktop/src/renderer/src/__tests__/voices.test.tsx
```

En `desktop/src/renderer/src/__tests__/speech.test.ts`, borrar el `describe('CachedAudioSpeechService', …)` completo y su import (`CachedAudioSpeechService` y `vi`, si ya no se usa).

- [ ] **Step 6: Ejecutar los tests de voz**

Run: `npx vitest run src/renderer/src/__tests__/generatedSpeech.test.ts src/renderer/src/__tests__/speech.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A desktop/src/renderer/src/services/speech desktop/src/renderer/src/__tests__
git commit -m "feat(desktop): voz generada con setSinkId hacia el micrófono virtual"
```

---

### Task 6: Precarga de voces

**Files:**
- Create: `desktop/src/renderer/src/hooks/useVoicePreload.ts`
- Test: `desktop/src/renderer/src/__tests__/voicePreload.test.tsx`

**Interfaces:**
- Consumes: `speechService.warm` (Task 5), `usePhrases`, `useSettings`, `usePlayback`, `window.senavoz.tts.prune`.
- Produces: `useVoicePreload(delayMs = 400): void`.

- [ ] **Step 1: Test (incluye la ráfaga del control de velocidad)**

`desktop/src/renderer/src/__tests__/voicePreload.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useVoicePreload } from '@/hooks/useVoicePreload';
import { usePlayback } from '@/store/playback';
import { useSettings } from '@/store/settings';
import { installFakeSenavoz } from '@/test/fakeSenavoz';

const warm = vi.fn(async (_texts: string[]) => {});
vi.mock('@/services/speech', () => ({ speechService: { warm: (t: string[]) => warm(t) } }));
vi.mock('@/api/endpoints', () => ({
  phrasesApi: {
    list: async () => [
      { id: '1', code: 'yes', text_es: 'Sí', is_default: true },
      { id: '2', code: 'no', text_es: 'No', is_default: true },
    ],
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

let fake: ReturnType<typeof installFakeSenavoz>;
beforeEach(() => {
  warm.mockClear();
  fake = installFakeSenavoz();
  useSettings.setState({ voiceId: 'v1', rate: 1 });
});

describe('precarga de voces', () => {
  it('genera el catálogo, poda la caché y marca el progreso', async () => {
    renderHook(() => useVoicePreload(0), { wrapper });
    await waitFor(() => expect(warm).toHaveBeenCalledWith(['Sí', 'No']));
    await waitFor(() => expect(fake.api.tts.prune).toHaveBeenCalledWith({ voiceId: 'v1', rate: 1 }));
    await waitFor(() => expect(usePlayback.getState().preparing).toBe(false));
  });

  it('una ráfaga de cambios de velocidad genera una sola vez', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderHook(() => useVoicePreload(400), { wrapper });
    await waitFor(() => expect(usePlayback.getState().preparing).toBe(true));
    act(() => useSettings.setState({ rate: 1.25 }));
    act(() => useSettings.setState({ rate: 1.5 }));
    act(() => useSettings.setState({ rate: 1.75 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(warm).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/renderer/src/__tests__/voicePreload.test.tsx`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

`desktop/src/renderer/src/hooks/useVoicePreload.ts`:

```ts
import { useEffect } from 'react';

import { usePhrases } from '@/api/usePhrases';
import { speechService } from '@/services/speech';
import { usePlayback } from '@/store/playback';
import { useSettings } from '@/store/settings';

/**
 * Genera los audios del catálogo al iniciar sesión y al cambiar voz o velocidad, para
 * que durante la reunión cada frase suene al instante. Espera `delayMs` a que el
 * usuario deje de mover el control de velocidad.
 */
export function useVoicePreload(delayMs = 400): void {
  const { data: phrases } = usePhrases();
  const voiceId = useSettings((s) => s.voiceId);
  const rate = useSettings((s) => s.rate);

  useEffect(() => {
    if (!phrases?.length) return;
    let cancelled = false;
    usePlayback.getState().setPreparing(true);
    const timer = setTimeout(() => {
      speechService
        .warm(phrases.map((p) => p.text_es))
        .then(() => window.senavoz.tts.prune({ voiceId, rate }))
        // Si falla, cada frase se generará al pedirla.
        .catch(() => {})
        .finally(() => {
          if (!cancelled) usePlayback.getState().setPreparing(false);
        });
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phrases, voiceId, rate, delayMs]);
}
```

- [ ] **Step 4: Ejecutar**

Run: `npx vitest run src/renderer/src/__tests__/voicePreload.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/src/hooks/useVoicePreload.ts desktop/src/renderer/src/__tests__/voicePreload.test.tsx
git commit -m "feat(desktop): precarga de las voces del catálogo"
```

---

### Task 7: Reconocimiento compartido y mensaje de cámara en uso

**Files:**
- Create: `desktop/src/renderer/src/hooks/useSignRecognition.ts`
- Modify: `desktop/src/renderer/src/i18n/es.ts` (`camera.inUse`)
- Modify: `desktop/src/renderer/src/routes/Camera.tsx` (usar el hook; el marcado nuevo llega en la Task 10)
- Test: `desktop/src/renderer/src/__tests__/cameraScreen.test.tsx` (debe seguir pasando sin cambios de comportamiento)

**Interfaces:**
- Produces:
  ```ts
  export type CamState = { kind: 'starting' } | { kind: 'ready' } | { kind: 'error'; key: CameraErrorKey };
  export function useSignRecognition(
    videoRef: RefObject<HTMLVideoElement | null>,
    onSign: (code: string) => void,
  ): {
    cam: CamState;
    cameras: { id: string; label: string }[];
    recognition: RecognitionStatus | null;
    cameraId: string | null;
    retry(): void;
    selectCamera(id: string | null): void;
  };
  export function visionMessageKey(recognition: RecognitionStatus | null): TranslationKey;
  ```

- [ ] **Step 1: Mensaje de cámara compartida**

En `es.ts`, reemplazar `camera.inUse`:

```ts
  'camera.inUse':
    'La cámara está en uso por otra aplicación y no admite dos a la vez. Si tu versión de Windows lo ofrece, activa el uso compartido en Configuración › Bluetooth y dispositivos › Cámaras; si no, elige otra cámara.',
```

- [ ] **Step 2: Extraer el hook**

`desktop/src/renderer/src/hooks/useSignRecognition.ts`:

```ts
import { useEffect, useRef, useState, type RefObject } from 'react';

import type { TranslationKey } from '@/i18n';
import {
  cameraErrorKey,
  listCameras,
  openCamera,
  type CameraErrorKey,
} from '@/services/camera/camera';
import { MediaPipeSignRecognizer } from '@/services/recognition/MediaPipeSignRecognizer';
import type { RecognitionStatus } from '@/services/recognition/SignRecognizer';
import { useSettings } from '@/store/settings';

export type CamState = { kind: 'starting' } | { kind: 'ready' } | { kind: 'error'; key: CameraErrorKey };

/** Mensaje del estado de la visión (detector de manos y modelo de señas). */
export function visionMessageKey(recognition: RecognitionStatus | null): TranslationKey {
  if (recognition?.phase === 'error') return 'camera.visionError';
  if (recognition?.phase === 'initializing' || !recognition) return 'camera.visionStarting';
  if (!recognition.modelAvailable)
    return recognition.handsDetected ? 'camera.handsWithoutModel' : 'camera.modelUnavailable';
  return recognition.handsDetected ? 'camera.handsDetected' : 'camera.searchingHands';
}

/**
 * Webcam + reconocedor de señas sobre un <video>. Lo usan la pantalla Cámara y la de
 * reunión; solo una está montada a la vez, así que hay una sola cámara abierta.
 */
export function useSignRecognition(
  videoRef: RefObject<HTMLVideoElement | null>,
  onSign: (code: string) => void,
) {
  const cameraId = useSettings((s) => s.cameraId);
  const setCameraId = useSettings((s) => s.setCameraId);
  const [cam, setCam] = useState<CamState>({ kind: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [recognition, setRecognition] = useState<RecognitionStatus | null>(null);

  // Callback accesible sin re-suscribirse en cada render.
  const onSignRef = useRef(onSign);
  useEffect(() => {
    onSignRef.current = onSign;
  });

  useEffect(() => {
    const videoElement = videoRef.current;
    let stream: MediaStream | null = null;
    let recognizer: MediaPipeSignRecognizer | null = null;
    let unsubscribeSign: (() => void) | null = null;
    let unsubscribeStatus: (() => void) | null = null;
    let cancelled = false;
    openCamera(cameraId)
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream = s;
        if (videoElement) {
          videoElement.srcObject = s;
          try {
            await videoElement.play?.();
          } catch {
            // jsdom / autoplay: el vídeo arranca igualmente con autoPlay.
          }
          if (!cancelled) {
            recognizer = new MediaPipeSignRecognizer(videoElement);
            unsubscribeSign = recognizer.onSign(({ code }) => onSignRef.current(code));
            unsubscribeStatus = recognizer.onStatus((status) => setRecognition(status));
            void recognizer.start();
          }
        }
        setCam({ kind: 'ready' });
        // Con el permiso concedido, las etiquetas de los dispositivos ya son legibles.
        const devices = await listCameras();
        if (!cancelled) setCameras(devices);
      })
      .catch((e: unknown) => {
        if (!cancelled) setCam({ kind: 'error', key: cameraErrorKey(e) });
      });
    return () => {
      cancelled = true;
      unsubscribeSign?.();
      unsubscribeStatus?.();
      recognizer?.stop();
      if (videoElement?.srcObject === stream) videoElement.srcObject = null;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [cameraId, attempt, videoRef]);

  const restart = () => {
    setCam({ kind: 'starting' });
    setRecognition(null);
  };
  return {
    cam,
    cameras,
    recognition,
    cameraId,
    retry: () => {
      restart();
      setAttempt((a) => a + 1);
    },
    selectCamera: (id: string | null) => {
      restart();
      setCameraId(id);
    },
  };
}
```

- [ ] **Step 3: Usar el hook en `Camera.tsx`**

Sustituir en `Camera.tsx` todo el estado y el efecto de cámara por:

```tsx
  const videoRef = useRef<HTMLVideoElement>(null);
  const { data: phrases } = usePhrases();
  const [lastSign, setLastSign] = useState<string | null>(null);
  const { cam, cameras, recognition, cameraId, retry, selectCamera } = useSignRecognition(
    videoRef,
    (code) => {
      const phrase = phrases?.find((p) => p.code === code);
      if (!phrase) return;
      setLastSign(phrase.text_es);
      void speechService.speak({ code: phrase.code, text: phrase.text_es });
    },
  );
  const visionMessage = t(visionMessageKey(recognition));
```

y en el `<select>`: `onChange={(e) => selectCamera(e.target.value || null)}`. Quitar los imports que dejan de usarse (`openCamera`, `listCameras`, `cameraErrorKey`, `MediaPipeSignRecognizer`, `RecognitionStatus`, `useSettings`, `CameraErrorKey`).

- [ ] **Step 4: Verificar que la pantalla de cámara sigue igual**

Run: `npx vitest run src/renderer/src/__tests__/cameraScreen.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/src/hooks/useSignRecognition.ts desktop/src/renderer/src/routes/Camera.tsx desktop/src/renderer/src/i18n/es.ts
git commit -m "refactor(desktop): reconocimiento de señas reutilizable y aviso de cámara compartida"
```

---

### Task 8: Base visual (tokens, tipografías, iconos, marca, autenticación)

**Files:**
- Modify: `desktop/package.json` (deps `@fontsource/atkinson-hyperlegible`, `@fontsource-variable/bricolage-grotesque`)
- Modify: `desktop/src/renderer/src/main.tsx`, `desktop/src/renderer/src/styles.css`
- Create: `desktop/src/renderer/src/ui/icons.tsx`, `desktop/src/renderer/src/ui/Brand.tsx`
- Rewrite: `desktop/src/renderer/src/ui/ui.module.css`, `desktop/src/renderer/src/ui/AuthScreen.tsx`
- Modify: `desktop/src/renderer/src/i18n/es.ts` (`auth.claim`, `auth.claimSub`)
- Test: `desktop/src/renderer/src/__tests__/login.test.tsx` (existente, debe seguir pasando) y un caso nuevo

**Interfaces:**
- Produces: iconos `IconPhrases, IconCamera, IconSettings, IconMeeting, IconWave, IconCheck, IconPlay, IconExpand, IconSpeaker` (props `{ size?: number }`, `aria-hidden`); `Brand({ inverted?: boolean })`.

- [ ] **Step 1: Instalar las tipografías**

Run: `npm install --save-dev @fontsource/atkinson-hyperlegible @fontsource-variable/bricolage-grotesque`
Expected: ambas en `devDependencies` (como el resto de dependencias, que el bundle de Vite incluye).

- [ ] **Step 2: Cargar las fuentes**

En `main.tsx`, antes de `import './styles.css';`:

```ts
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource-variable/bricolage-grotesque';
```

- [ ] **Step 3: Tokens**

Reemplazar el bloque `:root` de `styles.css` por:

```css
:root {
  /* Grafito: no deslumbra junto a Zoom o Teams. Ámbar solo para lo que habla;
     azul solo para estados activo/detectado (se distinguen también por luminosidad). */
  --bg: #0f1114;
  --surface: #181b20;
  --surface-side: #14171b;
  --surface-raised: #22262d;
  --border: #262a31;
  --border-strong: #3a404b;
  --text: #f2f0ea;
  --text-muted: #a3a8b3;
  --text-nav: #b4b9c3;
  --accent: #ffb547;
  --accent-press: #f0a52f;
  --accent-text: #1a1206;
  --accent-soft: #2a2418;
  --live: #7ab8ff;
  --live-soft: #1c2a3d;
  --live-text: #a9d0ff;
  --warn-bg: #221d14;
  --warn-border: #4a3b1f;
  --warn-text: #d9cdb6;
  --danger: #ffa597;
  --danger-border: #6b3b36;
  --danger-bg: rgba(255, 165, 151, 0.12);

  --radius-s: 10px;
  --radius-m: 14px;
  --radius-l: 18px;

  --font-display: 'Bricolage Grotesque Variable', 'Segoe UI', system-ui, sans-serif;
  --font-text: 'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif;

  color-scheme: dark;
  font-family: var(--font-text);
  -webkit-font-smoothing: antialiased;
}
```

y en `:focus-visible` usar `outline: 3px solid var(--live);`; en `::selection`, `background: var(--accent); color: var(--accent-text);`.

- [ ] **Step 4: Iconos y marca**

`desktop/src/renderer/src/ui/icons.tsx`:

```tsx
import type { ReactNode } from 'react';

type Props = { size?: number };

function Svg({ size = 20, children }: Props & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconPhrases = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Svg>
);
export const IconCamera = (p: Props) => (
  <Svg {...p}>
    <path d="M15 10l5-3v10l-5-3" />
    <rect x="3" y="6" width="12" height="12" rx="2" />
  </Svg>
);
export const IconSettings = (p: Props) => (
  <Svg {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Svg>
);
export const IconMeeting = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </Svg>
);
/** Logotipo: barras de una onda de voz. */
export const IconWave = (p: Props) => (
  <Svg {...p}>
    <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
  </Svg>
);
export const IconCheck = (p: Props) => (
  <Svg {...p}>
    <path d="M5 12l5 5 9-10" />
  </Svg>
);
export const IconPlay = (p: Props) => (
  <Svg {...p}>
    <path d="M7 5v14l12-7z" />
  </Svg>
);
export const IconExpand = (p: Props) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
  </Svg>
);
export const IconSpeaker = (p: Props) => (
  <Svg {...p}>
    <path d="M11 5L6 9H3v6h3l5 4z" />
    <path d="M15.5 8.5a5 5 0 010 7" />
  </Svg>
);
```

`desktop/src/renderer/src/ui/Brand.tsx`:

```tsx
import { t } from '@/i18n';

import { IconWave } from './icons';
import styles from './ui.module.css';

/** Marca: placa ámbar con la onda de voz y el nombre. `inverted` para fondos ámbar. */
export function Brand({ inverted = false }: { inverted?: boolean }) {
  return (
    <p className={inverted ? `${styles.brand} ${styles.brandInverted}` : styles.brand}>
      <span className={styles.brandMark}>
        <IconWave size={22} />
      </span>
      {t('app.name')}
    </p>
  );
}
```

- [ ] **Step 5: Pantallas de acceso**

En `es.ts`, tras `'auth.loading'`:

```ts
  'auth.claim': 'Tus señas, con voz en cualquier reunión.',
  'auth.claimSub': 'Funciona con Zoom, Teams, Google Meet y cualquier app que use un micrófono.',
```

`desktop/src/renderer/src/ui/AuthScreen.tsx`:

```tsx
import type { ReactNode } from 'react';

import { t } from '@/i18n';

import { Brand } from './Brand';
import styles from './ui.module.css';

const BARS = [18, 40, 28, 56, 34, 22, 46, 14];

export function AuthScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.auth}>
      <section className={styles.authHero}>
        <Brand inverted />
        <div className={styles.authCopy}>
          <p className={styles.authClaim}>{t('auth.claim')}</p>
          <p className={styles.authSub}>{t('auth.claimSub')}</p>
        </div>
        <div className={styles.authBars} aria-hidden="true">
          {BARS.map((h, i) => (
            <span key={i} style={{ height: h }} />
          ))}
        </div>
      </section>
      <main className={styles.authMain}>
        <div className={styles.authBox}>
          <h1 className={styles.title}>{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 6: `ui.module.css` completo**

```css
/* ---------- Botones ---------- */
.button {
  min-height: 48px;
  padding: 0 20px;
  border: 0;
  border-radius: var(--radius-s);
  font: inherit;
  font-weight: 700;
  font-size: 16px;
  cursor: pointer;
  background: var(--accent);
  color: var(--accent-text);
  transition:
    background-color 0.15s,
    transform 0.1s;
}
.button:hover:not(:disabled) {
  background: var(--accent-press);
}
.button:active:not(:disabled) {
  transform: translateY(1px);
}
.secondary {
  background: transparent;
  color: var(--text);
  box-shadow: inset 0 0 0 1px var(--border-strong);
}
.secondary:hover:not(:disabled) {
  background: var(--surface-raised);
}
.danger {
  background: transparent;
  color: var(--danger);
  box-shadow: inset 0 0 0 1px var(--danger-border);
}
.danger:hover:not(:disabled) {
  background: var(--danger-bg);
}
.button:disabled {
  opacity: 0.55;
  cursor: default;
}
.button[aria-busy='true'] {
  cursor: progress;
}

/* ---------- Campos ---------- */
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.label {
  color: var(--text);
  font-weight: 700;
  font-size: 15px;
}
.input {
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border-radius: var(--radius-s);
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 17px;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.input:hover {
  border-color: var(--text-muted);
}
.input:focus-visible {
  outline: none;
  border-color: var(--live);
  box-shadow: 0 0 0 3px rgba(122, 184, 255, 0.3);
}
.input[aria-invalid='true'] {
  border-color: var(--danger);
}
.inputWrap {
  position: relative;
  display: flex;
  align-items: center;
}
.inputWrap .input {
  width: 100%;
  padding-right: 52px;
}
.eyeBtn {
  position: absolute;
  right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.eyeBtn:hover {
  color: var(--text);
}
.eyeBtn svg {
  width: 20px;
  height: 20px;
}
.fieldError {
  color: var(--danger);
  font-weight: 700;
  font-size: 14px;
}

/* ---------- Marca ---------- */
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 22px;
  letter-spacing: -0.01em;
}
.brandMark {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--accent-text);
}
.brandInverted .brandMark {
  background: var(--accent-text);
  color: var(--accent);
}

/* ---------- Pantallas de acceso: panel de marca + formulario ---------- */
.auth {
  min-height: 100%;
  display: flex;
  flex-wrap: wrap;
}
.authHero {
  flex: 1 1 380px;
  padding: 48px;
  background: var(--accent);
  color: var(--accent-text);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 40px;
}
.authCopy {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 460px;
}
.authClaim {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(36px, 4.4vw, 52px);
  line-height: 1.02;
  letter-spacing: -0.03em;
}
.authSub {
  margin: 0;
  font-size: 18px;
  max-width: 400px;
}
.authBars {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 56px;
}
.authBars span {
  width: 8px;
  border-radius: 4px;
  background: var(--accent-text);
}
.authMain {
  flex: 1 1 460px;
  padding: 48px 24px;
  display: grid;
  place-items: center;
}
.authBox {
  width: min(400px, 100%);
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.splash {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  font-size: 18px;
}

/* ---------- Tarjeta de frase ---------- */
.card {
  min-height: 132px;
  padding: 18px 20px;
  border-radius: 16px;
  border: 2px solid var(--border);
  background: var(--surface);
  color: var(--text);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background-color 0.15s,
    transform 0.08s;
}
.card:hover {
  border-color: var(--border-strong);
  background: var(--surface-raised);
}
.card:active {
  transform: translateY(2px);
}
.cardActive {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.cardActive:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.cardText {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 24px;
  line-height: 1.2;
}
/* Atajo de teclado dibujado como una tecla. */
.shortcut {
  min-width: 30px;
  height: 30px;
  padding: 0 8px;
  border-radius: 8px;
  display: inline-grid;
  place-items: center;
  background: var(--surface-raised);
  color: #d5d8de;
  box-shadow: inset 0 -2px 0 #1a1d22;
  font-weight: 700;
  font-size: 15px;
}
.cardActive .shortcut {
  background: var(--accent);
  color: var(--accent-text);
  box-shadow: none;
}
```

Los enlaces de los formularios (`.link`, `.linkSmall` en `routes.module.css`) pasan a `color: var(--accent)` en la Task 9.

- [ ] **Step 7: Test del nuevo panel de acceso**

Añadir a `desktop/src/renderer/src/__tests__/login.test.tsx`, dentro de su `describe` principal, un caso que use su función de render existente:

```tsx
  it('muestra el mensaje de marca junto al formulario', async () => {
    renderLogin();
    expect(await screen.findByText('Tus señas, con voz en cualquier reunión.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });
```

(Si la función de render del archivo tiene otro nombre, usar esa.)

- [ ] **Step 8: Ejecutar**

Run: `npx vitest run src/renderer/src/__tests__/login.test.tsx src/renderer/src/__tests__/guard.test.tsx && npm run typecheck:web`
Expected: PASS y sin errores de tipos.

- [ ] **Step 9: Commit**

```bash
git add desktop/package.json desktop/package-lock.json desktop/src/renderer/src
git commit -m "feat(desktop): base visual nueva (tokens, tipografías, iconos y acceso)"
```

---

### Task 9: Barra lateral y pantalla Frases

**Files:**
- Rewrite: `desktop/src/renderer/src/routes/routes.module.css`
- Rewrite: `desktop/src/renderer/src/routes/AppLayout.tsx`, `desktop/src/renderer/src/routes/Phrases.tsx`, `desktop/src/renderer/src/ui/PhraseCard.tsx`
- Create: `desktop/src/renderer/src/hooks/useMeetingMode.ts`
- Modify: `desktop/src/renderer/src/i18n/es.ts`
- Test: `desktop/src/renderer/src/__tests__/phrases.test.tsx`

**Interfaces:**
- Consumes: `usePlayback`, `useSettings`, `useOutputDevices`, `resolveMeetingOutput`, `useMeeting`, `useVoicePreload`, `speechService`.
- Produces: `useMeetingMode(): { enter(): Promise<void>; exit(): Promise<void> }`; `PhraseCard` con props `{ text, shortcut?, active?, onClick }`.

- [ ] **Step 1: Textos**

En `es.ts`, sustituir `home.hint` y añadir tras él:

```ts
  'home.hint': 'Haz clic en una frase o pulsa su número del 1 al 9.',
  'home.output': 'Suena en:',
  'home.outputSpeakers': 'Altavoces',
  'home.nowPlaying': 'Sonando ahora',
  'home.lastSaid': 'Lo último que dijiste',
  'home.stop': 'Detener',
```

y un bloque nuevo al final (antes de `} as const`):

```ts
  'meeting.enter': 'Modo reunión',
  'meeting.cableReady': 'Micrófono virtual listo',
  'meeting.cableMissing': 'Falta el micrófono virtual',
  'meeting.live': 'En reunión',
  'meeting.mic': 'Micrófono: CABLE Output',
  'meeting.expand': 'Volver a la ventana completa',
  'meeting.said': 'Dijiste',
  'meeting.nothingYet': 'Aún no has dicho nada',
  'meeting.pause': 'Pausar voz',
  'meeting.resume': 'Reanudar voz',
  'meeting.paused': 'Voz en pausa: no se envía nada.',
  'meeting.exit': 'Salir del modo',
  'meeting.preparing': 'Preparando voces…',
  'meeting.deviceMissing': 'Los demás no te oyen: no se encuentra el micrófono virtual.',
  'meeting.synthError': 'No se pudo generar la voz. Revisa la voz elegida en Ajustes.',
  'meeting.shortcutsFailed': 'Atajos no disponibles (los usa otra app): {list}',
  'meeting.shortcutHint': 'Ctrl+Alt+1…9 funcionan aunque estés en la reunión.',
  'meeting.say': 'Decir: {text}',
```

- [ ] **Step 2: Test de Frases actualizado**

En `phrases.test.tsx`, añadir import `import { usePlayback } from '@/store/playback';`, en `beforeEach` `usePlayback.setState({ lastText: null, playing: false });` y estos casos:

```tsx
  it('la franja "Sonando ahora" muestra la última frase y Detener la corta', async () => {
    list.mockResolvedValue([{ id: '1', code: 'hello', text_es: 'Hola', is_default: true }]);
    usePlayback.setState({ lastText: 'Hola', playing: true });
    renderScreen();
    expect(await screen.findByText('Sonando ahora')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Detener' }));
    expect(stop).toHaveBeenCalled();
  });

  it('indica que fuera del Modo reunión suena por los altavoces', async () => {
    list.mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('Altavoces')).toBeInTheDocument();
  });
```

y cambiar el mock para exponer `stop`:

```tsx
const speak = vi.fn();
const stop = vi.fn();
vi.mock('@/services/speech', () => ({
  speechService: { speak: (...a: unknown[]) => speak(...a), stop: () => stop() },
}));
```

(con `stop.mockReset()` en `beforeEach`).

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `npx vitest run src/renderer/src/__tests__/phrases.test.tsx`
Expected: FAIL (no existe "Sonando ahora").

- [ ] **Step 4: `useMeetingMode`**

`desktop/src/renderer/src/hooks/useMeetingMode.ts`:

```ts
import { useNavigate } from 'react-router';

import { listOutputDevices, resolveMeetingOutput } from '@/services/audio/outputDevice';
import { useMeeting } from '@/store/meeting';
import { useSettings } from '@/store/settings';

/** Entrar y salir del Modo reunión (ventana compacta + voz al micrófono virtual). */
export function useMeetingMode() {
  const navigate = useNavigate();
  return {
    async enter() {
      const devices = await listOutputDevices().catch(() => []);
      const device = resolveMeetingOutput(useSettings.getState().meetingOutput, devices);
      // Sin micrófono virtual nadie te oiría: se lleva a la guía de instalación.
      if (!device) {
        navigate('/ajustes', { state: { needCable: true } });
        return;
      }
      const { failedShortcuts } = await window.senavoz.meeting.enter();
      useMeeting.getState().start(device.id, failedShortcuts);
      navigate('/reunion');
    },
    async exit() {
      await window.senavoz.meeting.exit();
      useMeeting.getState().stop();
      navigate('/frases');
    },
  };
}
```

- [ ] **Step 5: `PhraseCard`**

```tsx
import { t } from '@/i18n';

import styles from './ui.module.css';

type Props = { text: string; shortcut?: number; active?: boolean; onClick: () => void };

export function PhraseCard({ text, shortcut, active = false, onClick }: Props) {
  return (
    <button
      type="button"
      className={active ? `${styles.card} ${styles.cardActive}` : styles.card}
      onClick={onClick}
      aria-label={t('home.speakA11y', { text })}
      aria-keyshortcuts={shortcut ? String(shortcut) : undefined}
    >
      {shortcut ? (
        <span className={styles.shortcut} aria-hidden>
          {shortcut}
        </span>
      ) : (
        <span aria-hidden />
      )}
      <span className={styles.cardText}>{text}</span>
    </button>
  );
}
```

- [ ] **Step 6: `AppLayout`**

```tsx
import { NavLink, Outlet } from 'react-router';

import { useMeetingMode } from '@/hooks/useMeetingMode';
import { useOutputDevices } from '@/hooks/useOutputDevices';
import { useVoicePreload } from '@/hooks/useVoicePreload';
import { t } from '@/i18n';
import { resolveMeetingOutput } from '@/services/audio/outputDevice';
import { useSettings } from '@/store/settings';
import { Brand } from '@/ui/Brand';
import { IconCamera, IconMeeting, IconPhrases, IconSettings } from '@/ui/icons';

import styles from './routes.module.css';

const links = [
  { to: '/frases', label: 'nav.home', Icon: IconPhrases },
  { to: '/camara', label: 'nav.camera', Icon: IconCamera },
  { to: '/ajustes', label: 'nav.settings', Icon: IconSettings },
] as const;

export function AppLayout() {
  useVoicePreload();
  const { enter } = useMeetingMode();
  const { devices } = useOutputDevices();
  const meetingOutput = useSettings((s) => s.meetingOutput);
  const ready = resolveMeetingOutput(meetingOutput, devices) !== null;

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar} aria-label={t('nav.label')}>
        <Brand />
        <div className={styles.navList}>
          {links.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={styles.navLink}>
              <Icon />
              {t(label)}
            </NavLink>
          ))}
        </div>
        <div className={styles.meetingCard}>
          <p className={styles.statusLine}>
            <span className={ready ? styles.dotLive : styles.dotWarn} aria-hidden />
            {t(ready ? 'meeting.cableReady' : 'meeting.cableMissing')}
          </p>
          <button type="button" className={styles.meetingBtn} onClick={() => void enter()}>
            <IconMeeting size={18} />
            {t('meeting.enter')}
          </button>
        </div>
      </nav>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 7: `Phrases`**

```tsx
import type { Phrase } from '@/api/types';
import { usePhrases } from '@/api/usePhrases';
import { usePhraseShortcuts } from '@/hooks/usePhraseShortcuts';
import { t } from '@/i18n';
import { speechService } from '@/services/speech';
import { usePlayback } from '@/store/playback';
import { Button } from '@/ui/Button';
import { IconSpeaker } from '@/ui/icons';
import { PhraseCard } from '@/ui/PhraseCard';

import styles from './routes.module.css';

const speak = (p: Phrase) => void speechService.speak({ code: p.code, text: p.text_es });

export default function Phrases() {
  const { data, isPending, isError, refetch, isRefetching } = usePhrases();
  const lastText = usePlayback((s) => s.lastText);
  const playing = usePlayback((s) => s.playing);
  usePhraseShortcuts(data, speak);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>{t('home.title')}</h1>
          <p className={styles.hint}>{t('home.hint')}</p>
        </div>
        <p className={styles.pill}>
          <IconSpeaker size={16} />
          {t('home.output')} <strong>{t('home.outputSpeakers')}</strong>
        </p>
      </header>

      {lastText ? (
        <section className={styles.nowPlaying} aria-live="polite">
          <span className={playing ? styles.barsLive : styles.bars} aria-hidden>
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
          <div className={styles.nowPlayingText}>
            <span className={styles.eyebrow}>{t(playing ? 'home.nowPlaying' : 'home.lastSaid')}</span>
            <span className={styles.nowPlayingPhrase}>{lastText}</span>
          </div>
          <button type="button" className={styles.stopBtn} onClick={() => speechService.stop()}>
            {t('home.stop')}
          </button>
        </section>
      ) : null}

      {isPending ? (
        <div className={styles.center} role="status">
          {t('home.loading')}
        </div>
      ) : isError ? (
        <div className={styles.center}>
          <p className={styles.errorText}>{t('home.error')}</p>
          <Button label={t('home.retry')} loading={isRefetching} onClick={() => void refetch()} />
        </div>
      ) : (
        <div className={styles.grid}>
          {data.map((p, i) => (
            <PhraseCard
              key={p.code}
              text={p.text_es}
              shortcut={i < 9 ? i + 1 : undefined}
              active={p.text_es === lastText}
              onClick={() => speak(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

Nota: el primer test pide "Sonando ahora" con `playing: true`; con `playing: false` se muestra "Lo último que dijiste".

- [ ] **Step 8: `routes.module.css` completo**

```css
/* ---------- Formularios de acceso ---------- */
.form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.error {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--radius-s);
  background: var(--danger-bg);
  color: var(--danger);
  font-weight: 700;
}
.link {
  color: var(--accent);
  text-align: center;
  padding: 12px;
  text-decoration: none;
}
.link:hover,
.linkSmall:hover {
  text-decoration: underline;
}
.linkSmall {
  align-self: flex-end;
  color: var(--accent);
  font-size: 14px;
  padding: 4px 0;
  text-decoration: none;
}
.forgotHint,
.sentText {
  color: var(--text-muted);
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
}
.sentText {
  text-align: center;
}
.sentBox {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px 0 16px;
}
.sentIcon {
  width: 48px;
  height: 48px;
  color: var(--live);
}
.sentEmail {
  font-weight: 700;
  text-align: center;
  margin: 0;
  word-break: break-all;
}

/* ---------- Estructura de la app ---------- */
.shell {
  display: flex;
  flex-wrap: wrap;
  min-height: 100%;
}
.sidebar {
  flex: 1 1 240px;
  max-width: 280px;
  padding: 24px 16px;
  background: var(--surface-side);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.sidebar > :first-child {
  padding: 0 8px;
}
.navList {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.navLink {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: var(--radius-s);
  color: var(--text-nav);
  text-decoration: none;
  transition:
    background-color 0.15s,
    color 0.15s;
}
.navLink:hover {
  color: var(--text);
  background: var(--surface-raised);
}
.navLink[aria-current='page'] {
  color: var(--text);
  background: var(--surface-raised);
  font-weight: 700;
}
.navLink[aria-current='page'] svg {
  color: var(--accent);
}
.meetingCard {
  margin-top: auto;
  padding: 16px;
  border-radius: var(--radius-m);
  background: #1b1f25;
  border: 1px solid var(--border-strong);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.statusLine {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  color: var(--text-nav);
}
.dotLive,
.dotWarn {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--live);
}
/* Advertencia: cuadrado ámbar (forma distinta, no solo color). */
.dotWarn {
  border-radius: 2px;
  background: var(--accent);
}
.meetingBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  border: 0;
  border-radius: var(--radius-s);
  background: var(--text);
  color: #111315;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.meetingBtn:hover {
  background: #ffffff;
}
.content {
  flex: 999 1 560px;
  min-width: 0;
  height: 100vh;
  overflow: auto;
}
.page {
  padding: 40px 48px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.pageHeader {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 40px;
  letter-spacing: -0.02em;
  line-height: 1.1;
}
.hint {
  margin: 8px 0 0;
  color: var(--text-muted);
  max-width: 60ch;
}
.pill {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  font-size: 14px;
  color: var(--text-nav);
}
.pill strong {
  color: var(--text);
}
.eyebrow {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* ---------- Frases ---------- */
.nowPlaying {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  padding: 20px 24px;
  border-radius: var(--radius-l);
  background: var(--accent);
  color: var(--accent-text);
}
.nowPlayingText {
  flex: 1 1 240px;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.nowPlayingPhrase {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 30px;
  line-height: 1.15;
}
.bars,
.barsLive {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 32px;
}
.bars span,
.barsLive span {
  width: 5px;
  border-radius: 3px;
  background: var(--accent-text);
  height: 12px;
}
.barsLive span {
  animation: bar 0.9s ease-in-out infinite alternate;
}
.barsLive span:nth-child(2) {
  animation-delay: -0.3s;
}
.barsLive span:nth-child(3) {
  animation-delay: -0.6s;
}
.barsLive span:nth-child(4) {
  animation-delay: -0.15s;
}
.barsLive span:nth-child(5) {
  animation-delay: -0.45s;
}
@keyframes bar {
  from {
    height: 8px;
  }
  to {
    height: 32px;
  }
}
.stopBtn {
  min-height: 44px;
  padding: 0 18px;
  border-radius: var(--radius-s);
  border: 2px solid var(--accent-text);
  background: transparent;
  color: var(--accent-text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.stopBtn:hover {
  background: rgba(26, 18, 6, 0.08);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 48px 24px;
  color: var(--text-muted);
}
.errorText {
  color: var(--danger);
  font-size: 18px;
  margin: 0;
}

/* ---------- Cámara ---------- */
.cameraLayout {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
}
.stage {
  flex: 3 1 480px;
  min-width: 0;
  position: relative;
  aspect-ratio: 16 / 10;
  border-radius: 20px;
  overflow: hidden;
  background: #000;
  border: 1px solid var(--border);
}
.video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scaleX(-1);
}
.chip {
  position: absolute;
  top: 16px;
  left: 16px;
  right: 16px;
  width: fit-content;
  max-width: calc(100% - 32px);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(15, 17, 20, 0.88);
  font-size: 14px;
  font-weight: 700;
}
.signBanner {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 16px;
  margin: 0;
  padding: 14px 18px;
  border-radius: var(--radius-m);
  background: var(--accent);
  color: var(--accent-text);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 24px;
}
.cameraError {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 32px;
  text-align: center;
  background: rgba(15, 17, 20, 0.92);
}
.cameraError p {
  margin: 0;
  max-width: 52ch;
}
.aside {
  flex: 1 1 260px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.panel {
  padding: 20px;
  border-radius: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.panelTitle {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}
.statusRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
}
.statusValue {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}
.statusWarn {
  color: var(--accent);
}
.warnPanel {
  padding: 20px;
  border-radius: 16px;
  background: var(--warn-bg);
  border: 1px solid var(--warn-border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.warnPanel h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 20px;
}
.warnPanel p {
  margin: 0;
  color: var(--warn-text);
}
.linkButton {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 16px;
  border-radius: var(--radius-s);
  background: var(--accent);
  color: var(--accent-text);
  text-decoration: none;
  font-weight: 700;
}
.recentList {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.recentList li:first-child {
  font-weight: 700;
}
.muted {
  color: var(--text-muted);
  margin: 0;
}

/* ---------- Ajustes ---------- */
.settingsPage {
  max-width: 920px;
}
.section {
  padding: 24px;
  border-radius: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.sectionHighlight {
  border-color: var(--accent);
}
.sectionHead {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.sectionTitle {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
}
.select {
  min-height: 44px;
  min-width: 280px;
  max-width: 100%;
  padding: 0 12px;
  border-radius: var(--radius-s);
  border: 1px solid var(--border-strong);
  background: var(--bg);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.slider {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 280px;
}
.slider input {
  flex: 1;
  accent-color: var(--accent);
  min-height: 44px;
}
.slider output {
  width: 52px;
  text-align: right;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.badgeLive,
.badgeWarn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 14px;
}
.badgeLive {
  background: var(--live-soft);
  color: var(--live-text);
}
.badgeWarn {
  background: #3a2c14;
  color: #ffcf85;
}
.callout {
  padding: 16px;
  border-radius: 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
}
.callout p {
  flex: 1 1 280px;
  margin: 0;
  color: #c9cdd4;
}
.steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  counter-reset: step;
}
.steps li {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  counter-increment: step;
}
.steps li::before {
  content: counter(step);
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--surface-raised);
  font-weight: 700;
}
.steps li:first-child::before {
  background: var(--accent);
  color: var(--accent-text);
}
.actionsRow {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.profile {
  display: flex;
  align-items: center;
  gap: 14px;
}
.avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--border-strong);
  font-weight: 700;
  font-size: 18px;
}
.name {
  margin: 0;
  font-weight: 700;
}
.notice {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--radius-s);
  background: var(--warn-bg);
  border: 1px solid var(--warn-border);
  color: var(--warn-text);
}

@media (prefers-reduced-motion: reduce) {
  .barsLive span {
    animation: none;
    height: 20px;
  }
}
```

- [ ] **Step 9: Ejecutar**

Run: `npx vitest run src/renderer/src/__tests__/phrases.test.tsx src/renderer/src/__tests__/guard.test.tsx`
Expected: PASS. Si `guard.test.tsx` monta `AppLayout`, debe instalar `installFakeSenavoz()` (ya lo hace para tokens) y no requiere más.

- [ ] **Step 10: Commit**

```bash
git add desktop/src/renderer/src
git commit -m "feat(desktop): barra lateral con Modo reunión y pantalla Frases rediseñada"
```

---

### Task 10: Pantalla Cámara rediseñada

**Files:**
- Rewrite: `desktop/src/renderer/src/routes/Camera.tsx`
- Modify: `desktop/src/renderer/src/i18n/es.ts`
- Test: `desktop/src/renderer/src/__tests__/cameraScreen.test.tsx`

**Interfaces:**
- Consumes: `useSignRecognition`, `visionMessageKey` (Task 7).

- [ ] **Step 1: Textos**

En `es.ts`, tras `'camera.signDetected'`:

```ts
  'camera.title': 'Cámara',
  'camera.subtitle': 'Haz las señas frente a la cámara. Todo se procesa en este equipo.',
  'camera.statusTitle': 'Estado',
  'camera.statusCamera': 'Cámara',
  'camera.statusHands': 'Detección de manos',
  'camera.statusModel': 'Modelo de señas',
  'camera.on': 'Activa',
  'camera.off': 'Inactiva',
  'camera.handsYes': 'Manos detectadas',
  'camera.handsNo': 'Sin manos',
  'camera.modelYes': 'Activo',
  'camera.modelNo': 'No instalado',
  'camera.noModelTitle': 'Falta un modelo entrenado',
  'camera.noModelBody':
    'La cámara ya ve tus manos, pero todavía no puede traducir señas. Mientras tanto usa las frases rápidas o sus atajos 1–9.',
  'camera.toPhrases': 'Ir a Frases',
  'camera.recentTitle': 'Últimas señas',
  'camera.recentEmpty': 'Aquí aparecerán las frases reconocidas.',
```

- [ ] **Step 2: Tests**

En `cameraScreen.test.tsx`, el mock del reconocedor ya informa `modelAvailable: false`. Añadir:

```tsx
  it('panel de estado: cámara activa y modelo no instalado, con enlace a Frases', async () => {
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    expect(await screen.findByText('Falta un modelo entrenado')).toBeInTheDocument();
    expect(screen.getByText('No instalado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Frases' })).toHaveAttribute('href', '#/frases');
  });

  it('las señas reconocidas aparecen en "Últimas señas"', async () => {
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    await screen.findByText(/Detector activo/);
    await act(async () => {
      recognizerMock.emitSign({ code: 'hello', confidence: 0.9 });
    });
    expect(screen.getByRole('list', { name: 'Últimas señas' })).toHaveTextContent('Hola');
  });
```

y envolver `renderScreen` en `HashRouter` (el enlace "Ir a Frases" usa `Link`):

```tsx
import { HashRouter } from 'react-router';
// ...
  return render(
    <QueryClientProvider client={client}>
      <HashRouter>
        <Camera />
      </HashRouter>
    </QueryClientProvider>,
  );
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `npx vitest run src/renderer/src/__tests__/cameraScreen.test.tsx`
Expected: FAIL en los dos casos nuevos.

- [ ] **Step 4: Implementar**

`desktop/src/renderer/src/routes/Camera.tsx`:

```tsx
import { useRef, useState } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router';

import { usePhrases } from '@/api/usePhrases';
import { useSignRecognition, visionMessageKey } from '@/hooks/useSignRecognition';
import { t } from '@/i18n';
import { speechService } from '@/services/speech';
import { Button } from '@/ui/Button';

import styles from './routes.module.css';

const RECENT = 5;

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={ok ? styles.statusValue : `${styles.statusValue} ${styles.statusWarn}`}>
      <span className={ok ? styles.dotLive : styles.dotWarn} aria-hidden />
      {label}
    </span>
  );
}

export default function Camera(): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { data: phrases } = usePhrases();
  const [recent, setRecent] = useState<string[]>([]);
  const { cam, cameras, recognition, cameraId, retry, selectCamera } = useSignRecognition(
    videoRef,
    (code) => {
      const phrase = phrases?.find((p) => p.code === code);
      if (!phrase) return;
      setRecent((r) => [phrase.text_es, ...r].slice(0, RECENT));
      void speechService.speak({ code: phrase.code, text: phrase.text_es });
    },
  );
  const ready = cam.kind === 'ready';
  const modelAvailable = recognition?.modelAvailable ?? false;
  const hands = recognition?.handsDetected ?? false;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>{t('camera.title')}</h1>
          <p className={styles.hint}>{t('camera.subtitle')}</p>
        </div>
        {cameras.length > 1 ? (
          <label className={styles.field}>
            <span className={styles.muted}>{t('camera.select')}</span>
            <select
              className={styles.select}
              value={cameraId ?? ''}
              onChange={(e) => selectCamera(e.target.value || null)}
            >
              <option value="">{t('settings.cameraDefault')}</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      <div className={styles.cameraLayout}>
        <div className={styles.stage}>
          <video ref={videoRef} className={styles.video} autoPlay muted playsInline />
          {cam.kind === 'error' ? (
            <div role="alert" className={styles.cameraError}>
              <p>{t(cam.key)}</p>
              <Button label={t('camera.retry')} onClick={retry} />
            </div>
          ) : (
            <span role="status" className={styles.chip}>
              <span className={hands ? styles.dotLive : styles.dotWarn} aria-hidden />
              {cam.kind === 'starting' ? t('camera.starting') : t(visionMessageKey(recognition))}
            </span>
          )}
          {recent[0] ? (
            <p className={styles.signBanner}>{t('camera.signDetected', { text: recent[0] })}</p>
          ) : null}
        </div>

        <aside className={styles.aside}>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>{t('camera.statusTitle')}</h2>
            <p className={styles.statusRow}>
              {t('camera.statusCamera')}
              <Status ok={ready} label={t(ready ? 'camera.on' : 'camera.off')} />
            </p>
            <p className={styles.statusRow}>
              {t('camera.statusHands')}
              <Status ok={hands} label={t(hands ? 'camera.handsYes' : 'camera.handsNo')} />
            </p>
            <p className={styles.statusRow}>
              {t('camera.statusModel')}
              <Status ok={modelAvailable} label={t(modelAvailable ? 'camera.modelYes' : 'camera.modelNo')} />
            </p>
          </section>

          {ready && !modelAvailable ? (
            <section className={styles.warnPanel}>
              <h2>{t('camera.noModelTitle')}</h2>
              <p>{t('camera.noModelBody')}</p>
              <Link to="/frases" className={styles.linkButton}>
                {t('camera.toPhrases')}
              </Link>
            </section>
          ) : null}

          <section className={styles.panel}>
            <h2 className={styles.panelTitle} id="recent-title">
              {t('camera.recentTitle')}
            </h2>
            {recent.length ? (
              <ul className={styles.recentList} aria-labelledby="recent-title">
                {recent.map((text, i) => (
                  <li key={`${text}-${i}`}>{text}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>{t('camera.recentEmpty')}</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
```

Y en `routes.module.css` añadir:

```css
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
}
```

- [ ] **Step 5: Ejecutar**

Run: `npx vitest run src/renderer/src/__tests__/cameraScreen.test.tsx`
Expected: PASS (6 tests). El texto "Seña detectada: Hola" del primer test sigue existiendo en el banner.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/renderer/src
git commit -m "feat(desktop): pantalla Cámara rediseñada con panel de estado"
```

---

### Task 11: Ajustes rediseñados con la sección Reunión

**Files:**
- Rewrite: `desktop/src/renderer/src/routes/Settings.tsx`
- Create: `desktop/src/renderer/src/routes/settings/MeetingSection.tsx`, `desktop/src/renderer/src/routes/settings/VoiceSection.tsx`
- Modify: `desktop/src/renderer/src/i18n/es.ts`
- Rewrite: `desktop/src/renderer/src/__tests__/settings.test.tsx`
- Create: `desktop/src/renderer/src/__tests__/settingsMeeting.test.tsx`

**Interfaces:**
- Consumes: `useTtsVoices`, `speechService.speak(target, sinkOverride?)`, `useOutputDevices`, `findCable`, `resolveMeetingOutput`, `useSettings.setMeetingOutput`, `useMeeting.failedShortcuts`.

- [ ] **Step 1: Textos**

En `es.ts`, reemplazar el bloque `settings.*` por:

```ts
  'settings.title': 'Ajustes',
  'settings.profile': 'Perfil',
  'settings.voice': 'Voz',
  'settings.voiceName': 'Voz',
  'settings.voiceDefault': 'Predeterminada del sistema',
  'settings.noSpanishVoice':
    'No hay voces en español instaladas. Añade una en Configuración › Hora e idioma › Voz.',
  'settings.voiceUnavailable': 'La voz elegida ya no está instalada; se usa la predeterminada.',
  'settings.volume': 'Volumen',
  'settings.rate': 'Velocidad',
  'settings.test': 'Probar voz',
  'settings.testPhrase': 'Hola, así sonará mi voz',
  'settings.camera': 'Cámara preferida',
  'settings.cameraTitle': 'Cámara',
  'settings.cameraDefault': 'Predeterminada',
  'settings.logout': 'Cerrar sesión',
  'settings.loggingOut': 'Cerrando sesión…',
  'settings.meeting': 'Reunión',
  'settings.meetingHint':
    'Para que te oigan en Zoom, Teams o Meet, SeñaVoz habla por un micrófono virtual.',
  'settings.cableDetected': 'VB-Cable detectado',
  'settings.cableMissing': 'Falta instalar VB-Cable',
  'settings.output': 'Salida de la voz en reunión',
  'settings.outputAuto': 'Automática (VB-Cable)',
  'settings.pickMic':
    'En la reunión, elige como micrófono «CABLE Output». Solo hay que hacerlo una vez por aplicación.',
  'settings.testMeeting': 'Probar en la reunión',
  'settings.cableStep1': 'Descarga VB-Cable desde la web de VB-Audio.',
  'settings.cableStep2': 'Ejecuta el instalador como administrador y reinicia el equipo.',
  'settings.cableStep3': 'Vuelve aquí: SeñaVoz lo detectará solo.',
  'settings.cableDownload': 'Descargar VB-Cable',
  'settings.cableRecheck': 'Comprobar de nuevo',
  'settings.needCable': 'Instala VB-Cable para usar el Modo reunión.',
```

- [ ] **Step 2: Tests de Ajustes (voz, cámara, perfil)**

`desktop/src/renderer/src/__tests__/settings.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Settings from '@/routes/Settings';
import { useSession } from '@/store/session';
import { useSettings } from '@/store/settings';
import { installFakeSenavoz } from '@/test/fakeSenavoz';

const speak = vi.fn();
vi.mock('@/services/speech', () => ({
  speechService: { speak: (...a: unknown[]) => speak(...a), stop: vi.fn() },
}));
vi.mock('@/services/camera/camera', () => ({ listCameras: async () => [] }));

const logout = vi.fn(async () => {});
const voices = [
  { id: 'id-helena', name: 'Microsoft Helena', lang: 'es-ES' },
  { id: 'id-pablo', name: 'Microsoft Pablo', lang: 'es-ES' },
];

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  installFakeSenavoz({ voices });
  logout.mockClear();
  speak.mockReset();
  useSettings.setState({ volume: 1, rate: 1, voiceId: null, cameraId: null, meetingOutput: null });
  useSession.setState({
    status: 'authenticated',
    user: { id: '1', email: 'ana@example.com', display_name: 'Ana', is_active: true, created_at: '' },
    logout,
  });
});

describe('ajustes', () => {
  it('muestra el perfil', () => {
    renderSettings();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
  });

  it('volumen y velocidad se ajustan con los controles deslizantes', () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText('Volumen'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Velocidad'), { target: { value: '125' } });
    expect(useSettings.getState()).toMatchObject({ volume: 0.9, rate: 1.25 });
  });

  it('lista las voces de Windows y guarda la elegida', async () => {
    renderSettings();
    await screen.findByRole('option', { name: 'Microsoft Pablo (es-ES)' });
    await userEvent.selectOptions(screen.getByLabelText('Voz'), 'id-pablo');
    expect(useSettings.getState().voiceId).toBe('id-pablo');
  });

  it('avisa si la voz guardada ya no está instalada', async () => {
    useSettings.setState({ voiceId: 'id-desinstalada' });
    renderSettings();
    expect(await screen.findByText(/ya no está instalada/)).toBeInTheDocument();
  });

  it('sin voces en español lo avisa', async () => {
    installFakeSenavoz({ voices: [] });
    renderSettings();
    expect(await screen.findByText(/No hay voces en español instaladas/)).toBeInTheDocument();
  });

  it('probar voz habla la frase de prueba', async () => {
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Probar voz' }));
    expect(speak).toHaveBeenCalledWith('Hola, así sonará mi voz');
  });

  it('cerrar sesión llama a logout', async () => {
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(logout).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Tests de la sección Reunión**

`desktop/src/renderer/src/__tests__/settingsMeeting.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Settings from '@/routes/Settings';
import { useMeeting } from '@/store/meeting';
import { useSession } from '@/store/session';
import { useSettings } from '@/store/settings';
import { installFakeSenavoz } from '@/test/fakeSenavoz';

const speak = vi.fn();
vi.mock('@/services/speech', () => ({
  speechService: { speak: (...a: unknown[]) => speak(...a), stop: vi.fn() },
}));
vi.mock('@/services/camera/camera', () => ({ listCameras: async () => [] }));

let outputs: { kind: string; deviceId: string; label: string }[] = [];
const changeListeners = new Set<() => void>();
Object.defineProperty(navigator, 'mediaDevices', {
  configurable: true,
  value: {
    enumerateDevices: async () => outputs,
    addEventListener: (_: string, cb: () => void) => changeListeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => changeListeners.delete(cb),
  },
});
const open = vi.fn();

const cable = { kind: 'audiooutput', deviceId: 'c1', label: 'CABLE Input (VB-Audio Virtual Cable)' };
const speakers = { kind: 'audiooutput', deviceId: 's1', label: 'Altavoces (Realtek(R) Audio)' };

function renderSettings(needCable = false) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/ajustes', state: needCable ? { needCable: true } : null }]}>
      <Settings />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  installFakeSenavoz();
  speak.mockReset();
  open.mockReset();
  vi.stubGlobal('open', open);
  outputs = [speakers];
  useMeeting.setState({ failedShortcuts: [] });
  useSettings.setState({ meetingOutput: null, voiceId: null });
  useSession.setState({
    status: 'authenticated',
    user: { id: '1', email: 'a@b.c', display_name: 'A', is_active: true, created_at: '' },
    logout: vi.fn(async () => {}),
  });
});

describe('ajustes › reunión', () => {
  it('sin VB-Cable muestra los pasos y el enlace de descarga', async () => {
    renderSettings();
    expect(await screen.findByText('Falta instalar VB-Cable')).toBeInTheDocument();
    expect(screen.getByText('Descarga VB-Cable desde la web de VB-Audio.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Descargar VB-Cable' })).toHaveAttribute(
      'href',
      'https://vb-audio.com/Cable/',
    );
  });

  it('al instalarlo y comprobar de nuevo, lo detecta', async () => {
    renderSettings();
    await screen.findByText('Falta instalar VB-Cable');
    outputs = [speakers, cable];
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar de nuevo' }));
    expect(await screen.findByText('VB-Cable detectado')).toBeInTheDocument();
  });

  it('con VB-Cable: recordatorio de CABLE Output y prueba por el cable', async () => {
    outputs = [speakers, cable];
    renderSettings();
    expect(await screen.findByText('VB-Cable detectado')).toBeInTheDocument();
    expect(screen.getByText(/CABLE Output/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Probar en la reunión' }));
    expect(speak).toHaveBeenCalledWith('Hola, así sonará mi voz', 'c1');
  });

  it('elegir otra salida la guarda con id y etiqueta', async () => {
    outputs = [speakers, cable];
    renderSettings();
    await screen.findByText('VB-Cable detectado');
    await userEvent.selectOptions(screen.getByLabelText('Salida de la voz en reunión'), 's1');
    expect(useSettings.getState().meetingOutput).toEqual({ id: 's1', label: speakers.label });
  });

  it('si llega desde "Modo reunión" sin cable, explica por qué', async () => {
    renderSettings(true);
    expect(await screen.findByText('Instala VB-Cable para usar el Modo reunión.')).toBeInTheDocument();
  });

  it('lista los atajos que no se pudieron registrar', async () => {
    outputs = [cable];
    useMeeting.setState({ failedShortcuts: ['Control+Alt+2'] });
    renderSettings();
    expect(await screen.findByText(/Control\+Alt\+2/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Ejecutar y ver que fallan**

Run: `npx vitest run src/renderer/src/__tests__/settings.test.tsx src/renderer/src/__tests__/settingsMeeting.test.tsx`
Expected: FAIL.

- [ ] **Step 5: `MeetingSection`**

`desktop/src/renderer/src/routes/settings/MeetingSection.tsx`:

```tsx
import { useId } from 'react';
import { useLocation } from 'react-router';

import { useOutputDevices } from '@/hooks/useOutputDevices';
import { t } from '@/i18n';
import { findCable, resolveMeetingOutput } from '@/services/audio/outputDevice';
import { speechService } from '@/services/speech';
import { useMeeting } from '@/store/meeting';
import { useSettings } from '@/store/settings';
import { Button } from '@/ui/Button';
import { IconCheck } from '@/ui/icons';

import styles from '../routes.module.css';

const VB_CABLE_URL = 'https://vb-audio.com/Cable/';

export function MeetingSection() {
  const { devices, refresh } = useOutputDevices();
  const meetingOutput = useSettings((s) => s.meetingOutput);
  const setMeetingOutput = useSettings((s) => s.setMeetingOutput);
  const failedShortcuts = useMeeting((s) => s.failedShortcuts);
  const needCable = (useLocation().state as { needCable?: boolean } | null)?.needCable === true;
  const outputId = useId();

  const cable = findCable(devices);
  const target = resolveMeetingOutput(meetingOutput, devices);

  return (
    <section className={needCable && !cable ? `${styles.section} ${styles.sectionHighlight}` : styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <h2 className={styles.sectionTitle}>{t('settings.meeting')}</h2>
          <p className={styles.muted}>{t('settings.meetingHint')}</p>
        </div>
        {cable ? (
          <span className={styles.badgeLive}>
            <IconCheck size={16} />
            {t('settings.cableDetected')}
          </span>
        ) : (
          <span className={styles.badgeWarn}>{t('settings.cableMissing')}</span>
        )}
      </div>

      {needCable && !cable ? (
        <p className={styles.notice} role="alert">
          {t('settings.needCable')}
        </p>
      ) : null}

      {cable ? (
        <>
          <div className={styles.row}>
            <label htmlFor={outputId}>{t('settings.output')}</label>
            <select
              id={outputId}
              className={styles.select}
              value={meetingOutput?.id ?? ''}
              onChange={(e) => {
                const device = devices.find((d) => d.id === e.target.value);
                setMeetingOutput(device ?? null);
              }}
            >
              <option value="">{t('settings.outputAuto')}</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.callout}>
            <p>{t('settings.pickMic')}</p>
            <Button
              variant="secondary"
              label={t('settings.testMeeting')}
              disabled={!target}
              onClick={() => target && void speechService.speak(t('settings.testPhrase'), target.id)}
            />
          </div>
        </>
      ) : (
        <>
          <ol className={styles.steps}>
            <li>{t('settings.cableStep1')}</li>
            <li>{t('settings.cableStep2')}</li>
            <li>{t('settings.cableStep3')}</li>
          </ol>
          <div className={styles.actionsRow}>
            {/* El main abre los enlaces https en el navegador del sistema. */}
            <a className={styles.linkButton} href={VB_CABLE_URL} target="_blank" rel="noreferrer">
              {t('settings.cableDownload')}
            </a>
            <Button variant="secondary" label={t('settings.cableRecheck')} onClick={refresh} />
          </div>
        </>
      )}

      {failedShortcuts.length ? (
        <p className={styles.notice}>
          {t('meeting.shortcutsFailed', { list: failedShortcuts.join(', ') })}
        </p>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 6: `VoiceSection`**

`desktop/src/renderer/src/routes/settings/VoiceSection.tsx`:

```tsx
import { useId } from 'react';

import { t } from '@/i18n';
import { speechService } from '@/services/speech';
import { useTtsVoices } from '@/services/speech/useTtsVoices';
import { useSettings } from '@/store/settings';
import { Button } from '@/ui/Button';
import { IconPlay } from '@/ui/icons';

import styles from '../routes.module.css';

export function VoiceSection() {
  const { volume, rate, voiceId, setVolume, setRate, setVoiceId } = useSettings();
  const { voices, loaded } = useTtsVoices();
  const voiceSelectId = useId();
  const volumeId = useId();
  const rateId = useId();
  const unavailable = loaded && voiceId !== null && !voices.some((v) => v.id === voiceId);

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t('settings.voice')}</h2>
      <div className={styles.row}>
        <label htmlFor={voiceSelectId}>{t('settings.voiceName')}</label>
        <select
          id={voiceSelectId}
          className={styles.select}
          value={unavailable ? '' : (voiceId ?? '')}
          onChange={(e) => setVoiceId(e.target.value || null)}
        >
          <option value="">{t('settings.voiceDefault')}</option>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {`${v.name} (${v.lang})`}
            </option>
          ))}
        </select>
      </div>
      {loaded && voices.length === 0 ? <p className={styles.muted}>{t('settings.noSpanishVoice')}</p> : null}
      {unavailable ? <p className={styles.notice}>{t('settings.voiceUnavailable')}</p> : null}

      <div className={styles.row}>
        <label htmlFor={volumeId}>{t('settings.volume')}</label>
        <div className={styles.slider}>
          <input
            id={volumeId}
            type="range"
            min={0}
            max={100}
            step={10}
            value={Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
          />
          <output htmlFor={volumeId}>{`${Math.round(volume * 100)}%`}</output>
        </div>
      </div>
      <div className={styles.row}>
        <label htmlFor={rateId}>{t('settings.rate')}</label>
        <div className={styles.slider}>
          <input
            id={rateId}
            type="range"
            min={50}
            max={200}
            step={25}
            value={Math.round(rate * 100)}
            onChange={(e) => setRate(Number(e.target.value) / 100)}
          />
          <output htmlFor={rateId}>{`${rate.toFixed(2).replace(/\.?0+$/, '')}×`}</output>
        </div>
      </div>
      <div>
        <button
          type="button"
          className={styles.secondaryInline}
          onClick={() => void speechService.speak(t('settings.testPhrase'))}
        >
          <IconPlay size={16} />
          {t('settings.test')}
        </button>
      </div>
    </section>
  );
}
```

Y en `routes.module.css`:

```css
.secondaryInline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 16px;
  border-radius: var(--radius-s);
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.secondaryInline:hover {
  background: var(--surface-raised);
}
```

(`Button` no se usa aquí porque no lleva icono.)

- [ ] **Step 7: `Settings`**

`desktop/src/renderer/src/routes/Settings.tsx`:

```tsx
import { useEffect, useId, useState } from 'react';

import { queryClient } from '@/api/queryClient';
import { t } from '@/i18n';
import { listCameras } from '@/services/camera/camera';
import { useSession } from '@/store/session';
import { useSettings } from '@/store/settings';
import { Button } from '@/ui/Button';

import styles from './routes.module.css';
import { MeetingSection } from './settings/MeetingSection';
import { VoiceSection } from './settings/VoiceSection';

export default function Settings() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const cameraId = useSettings((s) => s.cameraId);
  const setCameraId = useSettings((s) => s.setCameraId);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);
  const cameraSelectId = useId();

  useEffect(() => {
    listCameras().then(setCameras, () => setCameras([]));
  }, []);

  const onLogout = async () => {
    setLoggingOut(true);
    await logout();
    queryClient.clear();
  };

  return (
    <div className={`${styles.page} ${styles.settingsPage}`}>
      <h1 className={styles.title}>{t('settings.title')}</h1>

      <MeetingSection />
      <VoiceSection />

      {cameras.length > 0 ? (
        <section className={styles.section}>
          <div className={styles.row}>
            <h2 className={styles.sectionTitle}>{t('settings.cameraTitle')}</h2>
            <div className={styles.row}>
              <label htmlFor={cameraSelectId}>{t('settings.camera')}</label>
              <select
                id={cameraSelectId}
                className={styles.select}
                value={cameraId ?? ''}
                onChange={(e) => setCameraId(e.target.value || null)}
              >
                <option value="">{t('settings.cameraDefault')}</option>
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      ) : null}

      <section className={styles.section} aria-label={t('settings.profile')}>
        <div className={styles.row}>
          <div className={styles.profile}>
            <span className={styles.avatar} aria-hidden>
              {user?.display_name.charAt(0).toUpperCase()}
            </span>
            <div>
              <p className={styles.name}>{user?.display_name}</p>
              <p className={styles.muted}>{user?.email}</p>
            </div>
          </div>
          <Button
            variant="danger"
            label={loggingOut ? t('settings.loggingOut') : t('settings.logout')}
            ariaLabel={t('settings.logout')}
            loading={loggingOut}
            onClick={() => void onLogout()}
          />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 8: Ejecutar**

Run: `npx vitest run src/renderer/src/__tests__/settings.test.tsx src/renderer/src/__tests__/settingsMeeting.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add desktop/src/renderer/src
git commit -m "feat(desktop): Ajustes rediseñados con la sección Reunión y guía de VB-Cable"
```

---

### Task 12: Pantalla de Modo reunión

**Files:**
- Create: `desktop/src/renderer/src/routes/Meeting.tsx`, `desktop/src/renderer/src/routes/meeting.module.css`
- Modify: `desktop/src/renderer/src/App.tsx`
- Test: `desktop/src/renderer/src/__tests__/meetingScreen.test.tsx`

**Interfaces:**
- Consumes: `useSignRecognition`, `visionMessageKey`, `useMeetingMode`, `useMeeting`, `usePlayback`, `useOutputDevices`, `resolveMeetingOutput`, `useVoicePreload`, `usePhraseShortcuts`, `speechService`, `window.senavoz.meeting.onShortcut`.

- [ ] **Step 1: Tests**

`desktop/src/renderer/src/__tests__/meetingScreen.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Meeting from '@/routes/Meeting';
import { useMeeting } from '@/store/meeting';
import { usePlayback } from '@/store/playback';
import { useSettings } from '@/store/settings';
import { installFakeSenavoz } from '@/test/fakeSenavoz';

const speak = vi.fn();
const stop = vi.fn();
vi.mock('@/services/speech', () => ({
  speechService: {
    speak: (...a: unknown[]) => speak(...a),
    stop: () => stop(),
    warm: async () => {},
  },
}));
vi.mock('@/hooks/useSignRecognition', () => ({
  useSignRecognition: () => ({
    cam: { kind: 'ready' },
    cameras: [],
    recognition: { phase: 'ready', handsDetected: true, modelAvailable: false },
    cameraId: null,
    retry: vi.fn(),
    selectCamera: vi.fn(),
  }),
  visionMessageKey: () => 'camera.handsWithoutModel',
}));
vi.mock('@/api/endpoints', () => ({
  phrasesApi: {
    list: async () => [
      { id: '1', code: 'yes', text_es: 'Sí', is_default: true },
      { id: '2', code: 'no', text_es: 'No', is_default: true },
    ],
  },
}));

let outputs = [{ kind: 'audiooutput', deviceId: 'c1', label: 'CABLE Input (VB-Audio Virtual Cable)' }];
const changeListeners = new Set<() => void>();
Object.defineProperty(navigator, 'mediaDevices', {
  configurable: true,
  value: {
    enumerateDevices: async () => outputs,
    addEventListener: (_: string, cb: () => void) => changeListeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => changeListeners.delete(cb),
  },
});

let fake: ReturnType<typeof installFakeSenavoz>;

function renderMeeting() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/reunion']}>
        <Routes>
          <Route path="/reunion" element={<Meeting />} />
          <Route path="/frases" element={<p>pantalla frases</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  speak.mockReset();
  stop.mockReset();
  fake = installFakeSenavoz();
  outputs = [{ kind: 'audiooutput', deviceId: 'c1', label: 'CABLE Input (VB-Audio Virtual Cable)' }];
  useSettings.setState({ meetingOutput: null });
  useMeeting.getState().start('c1', []);
  usePlayback.setState({ lastText: null, playing: false, preparing: false, synthError: false });
});

describe('pantalla de Modo reunión', () => {
  it('Ctrl+Alt+N (atajo global) dice la frase N', async () => {
    renderMeeting();
    await screen.findByRole('button', { name: 'Decir: No' });
    act(() => fake.pressShortcut(1));
    expect(speak).toHaveBeenCalledWith({ code: 'no', text: 'No' });
  });

  it('clic en una frase la dice', async () => {
    renderMeeting();
    await userEvent.click(await screen.findByRole('button', { name: 'Decir: Sí' }));
    expect(speak).toHaveBeenCalledWith({ code: 'yes', text: 'Sí' });
  });

  it('muestra "Dijiste" con la última frase', async () => {
    usePlayback.setState({ lastText: 'Gracias', playing: true });
    renderMeeting();
    expect(await screen.findByText('Gracias')).toBeInTheDocument();
    expect(screen.getByText('Dijiste')).toBeInTheDocument();
  });

  it('pausar corta el audio y lo indica', async () => {
    renderMeeting();
    await userEvent.click(await screen.findByRole('button', { name: 'Pausar voz' }));
    expect(useMeeting.getState().paused).toBe(true);
    expect(stop).toHaveBeenCalled();
    expect(screen.getByText('Voz en pausa: no se envía nada.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reanudar voz' })).toBeInTheDocument();
  });

  it('si el micrófono virtual desaparece, avisa y marca el dispositivo como ausente', async () => {
    renderMeeting();
    await screen.findByRole('button', { name: 'Decir: Sí' });
    outputs = [];
    await act(async () => changeListeners.forEach((cb) => cb()));
    expect(await screen.findByText(/Los demás no te oyen/)).toBeInTheDocument();
    expect(useMeeting.getState().deviceMissing).toBe(true);
  });

  it('muestra los atajos ocupados', async () => {
    useMeeting.getState().start('c1', ['Control+Alt+2']);
    renderMeeting();
    expect(await screen.findByText(/Control\+Alt\+2/)).toBeInTheDocument();
  });

  it('salir del modo restaura la ventana y vuelve a Frases', async () => {
    renderMeeting();
    await userEvent.click(await screen.findByRole('button', { name: 'Salir del modo' }));
    expect(fake.api.meeting.exit).toHaveBeenCalled();
    expect(await screen.findByText('pantalla frases')).toBeInTheDocument();
    expect(useMeeting.getState().active).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/renderer/src/__tests__/meetingScreen.test.tsx`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar la pantalla**

`desktop/src/renderer/src/routes/Meeting.tsx`:

```tsx
import { useCallback, useEffect, useRef } from 'react';
import { Navigate } from 'react-router';

import type { Phrase } from '@/api/types';
import { usePhrases } from '@/api/usePhrases';
import { useMeetingMode } from '@/hooks/useMeetingMode';
import { useOutputDevices } from '@/hooks/useOutputDevices';
import { usePhraseShortcuts } from '@/hooks/usePhraseShortcuts';
import { useSignRecognition, visionMessageKey } from '@/hooks/useSignRecognition';
import { useVoicePreload } from '@/hooks/useVoicePreload';
import { t } from '@/i18n';
import { resolveMeetingOutput } from '@/services/audio/outputDevice';
import { speechService } from '@/services/speech';
import { useMeeting } from '@/store/meeting';
import { usePlayback } from '@/store/playback';
import { useSettings } from '@/store/settings';
import { IconExpand, IconWave } from '@/ui/icons';

import styles from './meeting.module.css';

const say = (p: Phrase) => void speechService.speak({ code: p.code, text: p.text_es });

export default function Meeting() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { data: phrases } = usePhrases();
  const { exit } = useMeetingMode();
  const active = useMeeting((s) => s.active);
  const paused = useMeeting((s) => s.paused);
  const deviceMissing = useMeeting((s) => s.deviceMissing);
  const failedShortcuts = useMeeting((s) => s.failedShortcuts);
  const togglePause = useMeeting((s) => s.togglePause);
  const setSink = useMeeting((s) => s.setSink);
  const { lastText, playing, preparing, synthError } = usePlayback();
  const meetingOutput = useSettings((s) => s.meetingOutput);
  const { devices, loaded } = useOutputDevices();
  useVoicePreload();

  const phrasesRef = useRef(phrases);
  useEffect(() => {
    phrasesRef.current = phrases;
  });

  const { recognition } = useSignRecognition(videoRef, (code) => {
    const phrase = phrasesRef.current?.find((p) => p.code === code);
    if (phrase) say(phrase);
  });

  // Atajos 1–9 con la ventana enfocada y Ctrl+Alt+1–9 globales con la reunión enfocada.
  usePhraseShortcuts(phrases, say);
  useEffect(
    () =>
      window.senavoz.meeting.onShortcut((index) => {
        const phrase = phrasesRef.current?.[index];
        if (phrase) say(phrase);
      }),
    [],
  );

  // Si el micrófono virtual desaparece (o vuelve), se refleja al momento.
  useEffect(() => {
    if (!loaded) return;
    setSink(resolveMeetingOutput(meetingOutput, devices)?.id ?? null);
  }, [loaded, devices, meetingOutput, setSink]);

  const onTogglePause = useCallback(() => {
    if (!useMeeting.getState().paused) speechService.stop();
    togglePause();
  }, [togglePause]);

  if (!active) return <Navigate to="/frases" replace />;

  return (
    <main className={styles.meeting}>
      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <span className={styles.mark} aria-hidden>
            <IconWave size={16} />
          </span>
          <div>
            <p className={styles.live}>
              <span className={styles.dot} aria-hidden />
              {t('meeting.live')}
            </p>
            <p className={styles.small}>{t('meeting.mic')}</p>
          </div>
        </div>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={t('meeting.expand')}
          onClick={() => void exit()}
        >
          <IconExpand size={18} />
        </button>
      </header>

      <div className={styles.cam}>
        <video ref={videoRef} className={styles.thumb} autoPlay muted playsInline />
        <p className={styles.small}>{t(visionMessageKey(recognition))}</p>
      </div>

      {deviceMissing ? (
        <p className={styles.alert} role="alert">
          {t('meeting.deviceMissing')}
        </p>
      ) : null}
      {synthError ? (
        <p className={styles.alert} role="alert">
          {t('meeting.synthError')}
        </p>
      ) : null}
      {paused ? <p className={styles.note}>{t('meeting.paused')}</p> : null}
      {preparing ? (
        <p className={styles.note} role="status">
          {t('meeting.preparing')}
        </p>
      ) : null}
      {failedShortcuts.length ? (
        <p className={styles.note}>{t('meeting.shortcutsFailed', { list: failedShortcuts.join(', ') })}</p>
      ) : null}

      <section className={playing ? `${styles.said} ${styles.saidPlaying}` : styles.said} aria-live="polite">
        <span className={styles.eyebrow}>{t('meeting.said')}</span>
        <span className={styles.saidText}>{lastText ?? t('meeting.nothingYet')}</span>
      </section>

      <div className={styles.grid}>
        {phrases?.slice(0, 9).map((p, i) => (
          <button
            key={p.code}
            type="button"
            className={p.text_es === lastText ? `${styles.key} ${styles.keyActive}` : styles.key}
            aria-label={t('meeting.say', { text: p.text_es })}
            aria-keyshortcuts={`Control+Alt+${i + 1}`}
            onClick={() => say(p)}
          >
            <span className={styles.keyNum} aria-hidden>
              {i + 1}
            </span>
            <span className={styles.keyText}>{p.text_es}</span>
          </button>
        ))}
      </div>

      <p className={styles.small}>{t('meeting.shortcutHint')}</p>

      <footer className={styles.footer}>
        <button type="button" className={styles.ghost} onClick={onTogglePause}>
          {t(paused ? 'meeting.resume' : 'meeting.pause')}
        </button>
        <button type="button" className={styles.solid} onClick={() => void exit()}>
          {t('meeting.exit')}
        </button>
      </footer>
    </main>
  );
}
```

`desktop/src/renderer/src/routes/meeting.module.css`:

```css
.meeting {
  min-height: 100vh;
  padding: 16px;
  background: var(--surface-side);
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 15px;
  line-height: 1.4;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.headerInfo {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mark {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--accent-text);
}
.live {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--live);
}
.small {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}
.iconBtn {
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: var(--radius-s);
  background: transparent;
  color: var(--text-nav);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.iconBtn:hover {
  background: var(--surface-raised);
  color: var(--text);
}
.cam {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: 12px;
  background: #1b1f25;
  border: 1px solid var(--border);
}
.thumb {
  width: 96px;
  height: 60px;
  flex: none;
  border-radius: 8px;
  background: #000;
  object-fit: cover;
  transform: scaleX(-1);
}
.alert,
.note {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius-s);
  font-size: 14px;
}
.alert {
  background: var(--danger-bg);
  color: var(--danger);
  font-weight: 700;
}
.note {
  background: var(--warn-bg);
  border: 1px solid var(--warn-border);
  color: var(--warn-text);
}
.said {
  padding: 16px;
  border-radius: var(--radius-m);
  background: var(--accent);
  color: var(--accent-text);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
/* El usuario no oye la voz: el pulso confirma que está sonando. */
.saidPlaying {
  animation: pulse 1s ease-in-out infinite alternate;
}
@keyframes pulse {
  from {
    box-shadow: 0 0 0 0 rgba(255, 181, 71, 0.55);
  }
  to {
    box-shadow: 0 0 0 8px rgba(255, 181, 71, 0);
  }
}
.eyebrow {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.saidText {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 26px;
  line-height: 1.12;
}
.grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.key {
  min-height: 56px;
  padding: 8px 10px;
  border-radius: var(--radius-s);
  border: 2px solid var(--border);
  background: #1b1f25;
  color: var(--text);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-start;
  gap: 4px;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.key:hover {
  border-color: var(--border-strong);
}
.keyActive {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.keyNum {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
}
.keyText {
  font-weight: 700;
  font-size: 13px;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.footer {
  display: flex;
  gap: 8px;
}
.ghost,
.solid {
  flex: 1;
  min-height: 44px;
  border-radius: var(--radius-s);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.ghost {
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text);
}
.solid {
  border: 0;
  background: var(--text);
  color: #111315;
}
@media (prefers-reduced-motion: reduce) {
  .saidPlaying {
    animation: none;
    box-shadow: 0 0 0 3px var(--accent-text) inset;
  }
}
```

- [ ] **Step 4: Ruta**

En `App.tsx`, importar `Meeting from '@/routes/Meeting'` y dentro de `<Route element={<RequireAuth />}>`, junto (fuera) de `AppLayout`:

```tsx
            <Route path="/reunion" element={<Meeting />} />
```

- [ ] **Step 5: Ejecutar todo**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: todos los tests PASS; sin errores de tipos ni de lint.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/renderer/src
git commit -m "feat(desktop): ventana compacta de Modo reunión con atajos globales y avisos"
```

---

### Task 13: Documentación, empaquetado y verificación manual

**Files:**
- Modify: `docs/ARCHITECTURE.md` (Decisiones › Audio hacia la reunión; Roadmap › Fase 4 → hecha)
- Modify: `README.md` (sección "Usar SeñaVoz en una reunión")

- [ ] **Step 1: Documentación**

En `docs/ARCHITECTURE.md`:
- Sustituir el párrafo **Audio hacia la reunión** por:
  > **Audio hacia la reunión (Modo reunión).** El main genera WAV con las voces OneCore de Windows (`resources/tts/synth.ps1`, WinRT vía PowerShell) y los guarda en `userData/tts-cache/` por voz + velocidad + texto. El renderer los reproduce con `HTMLAudioElement.setSinkId()` hacia VB-Cable ("CABLE Input"), que la reunión usa como micrófono ("CABLE Output"). En Modo reunión la voz nunca sale por los altavoces. La ventana se vuelve compacta y siempre visible, y Ctrl+Alt+1…9 funcionan con la reunión enfocada.
- En el diagrama, cambiar la etiqueta del `SpeechService` a `"SpeechService\n(voces de Windows + setSinkId)"` y la flecha `Speech -. "F4: setSinkId" .-> VCable` a `Speech -- "setSinkId" --> VCable`.
- En **Roadmap**, reemplazar la sección "Fase 4 — Voz hacia la reunión" por "**Modo reunión — hecho** (spec `docs/superpowers/specs/2026-10-07-meeting-mode-design.md`)".
- Sustituir la mención a `CachedAudioSpeechService` en "TTS pregenerado/cacheado" por `GeneratedSpeechService`.

En `README.md`, cambiar la frase inicial "la salida de voz hacia reuniones también está pendiente" por "la voz llega a cualquier app de reuniones a través del Modo reunión", y añadir tras "App de escritorio":

```markdown
### Usar SeñaVoz en una reunión

1. Instala [VB-Cable](https://vb-audio.com/Cable/) (como administrador) y reinicia. SeñaVoz lo detecta en Ajustes › Reunión.
2. En Zoom, Teams o Meet elige **CABLE Output** como micrófono (una sola vez por app).
3. En SeñaVoz pulsa **Modo reunión**: la ventana se vuelve compacta y queda encima. Con la reunión enfocada, **Ctrl+Alt+1…9** dicen las frases 1–9.
```

- [ ] **Step 2: Comprobaciones automáticas completas**

Run: `npm run lint && npm run typecheck && npx vitest run`
Expected: todo en verde.

- [ ] **Step 3: Empaquetado**

Run: `npm run build:win`
Expected: `release/SenaVoz-Setup-<versión>.exe` y `release/win-unpacked/resources/tts/synth.ps1` existen.

- [ ] **Step 4: Verificación manual (requiere VB-Cable instalado)**

1. `npm run dev`; con el backend levantado (`docker compose up`), iniciar sesión.
2. Ajustes › Reunión: sin VB-Cable aparecen los 3 pasos; tras instalarlo y "Comprobar de nuevo", "VB-Cable detectado".
3. Ajustes › Voz: aparecen las voces de Windows (Pablo, Laura, Helena, Sabina, Raúl en este equipo); "Probar voz" suena por los altavoces.
4. Abrir Zoom o Meet con micrófono "CABLE Output"; pulsar "Modo reunión" en SeñaVoz: la ventana pasa a 380×600 abajo a la derecha y queda encima.
5. Con la reunión enfocada, Ctrl+Alt+1: el medidor de micrófono de la reunión reacciona; por los altavoces no sale nada. (El usuario confirma que se oye en la prueba de micrófono.)
6. Desactivar "CABLE Input" en Configuración › Sonido: aparece "Los demás no te oyen…"; al reactivarlo desaparece.
7. "Salir del modo": la ventana recupera su tamaño; Ctrl+Alt+1 deja de responder.
8. Ejecutar `release/win-unpacked/SenaVoz.exe`: "Probar voz" funciona (encuentra `synth.ps1` empaquetado).

- [ ] **Step 5: Commit**

```bash
git add docs/ARCHITECTURE.md README.md
git commit -m "docs: Modo reunión en arquitectura y README"
```
