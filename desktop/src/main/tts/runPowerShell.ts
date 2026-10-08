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
