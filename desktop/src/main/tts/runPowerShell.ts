import { spawn } from 'node:child_process';
import { win32 } from 'node:path';

import type { ScriptRunner } from './ttsService';

// Ruta absoluta: buscar "powershell.exe" en PATH permitiría ejecutar otro binario con ese nombre.
const POWERSHELL = win32.join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
);

/** Lanza synth.ps1; la petición va por stdin (nunca como argumento) y la respuesta llega por stdout. */
export function createPowerShellRunner(scriptPath: string, timeoutMs = 30_000): ScriptRunner {
  return (request) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        POWERSHELL,
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
