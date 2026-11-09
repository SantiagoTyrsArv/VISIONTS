// Genera resources/icon.png (1024×1024) con el logo de la mano sobre una placa ámbar.
// Usa el propio Electron para rasterizar el SVG, sin dependencias nuevas:
//   npx electron scripts/make-icon.mjs
// Los trazados salen de src/renderer/src/ui/logoPaths.ts, así el icono no se desvía del logo.
import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SIZE = 1024;
const ACCENT = '#FFB547'; // --accent
const ACCENT_TEXT = '#1E1405'; // --accent-text

const source = readFileSync(
  join(import.meta.dirname, '../src/renderer/src/ui/logoPaths.ts'),
  'utf8',
);
const contorno = /CONTORNO_MANO\s*=\s*'([^']+)'/.exec(source)?.[1];
const interior = /INTERIOR_MANO\s*=\s*'([^']+)'/.exec(source)?.[1];
const ondasBlock = /ONDAS\s*=\s*\[([\s\S]*?)\]/.exec(source)?.[1] ?? '';
const ondas = [...ondasBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (!contorno || !interior || ondas.length !== 3) {
  throw new Error('No encuentro los trazados del logo en logoPaths.ts');
}

// El logo vive en un lienzo de 120; se escala ×7 y se centra en la placa.
const paths = [contorno, interior, ...ondas].map((d) => `<path d="${d}"/>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" rx="224" fill="${ACCENT}"/>
  <g transform="translate(60 120) scale(7)" fill="none" stroke="${ACCENT_TEXT}"
     stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
</svg>`;

app.commandLine.appendSwitch('force-device-scale-factor', '1');
// Sin `await` en el nivel superior: Electron no estaría listo hasta terminar de cargar el módulo.
void app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  const out = join(import.meta.dirname, '../resources/icon.png');
  writeFileSync(out, image.resize({ width: SIZE, height: SIZE }).toPNG());
  console.log(`icono escrito en ${out}`);
  app.quit();
});
