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

// Antes de crear cualquier ventana: el User-Agent debe ser ASCII (ver userAgent.ts).
app.userAgentFallback = asciiUserAgent(app.userAgentFallback);

const devUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined;
const rendererRoot = join(__dirname, '../renderer');

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

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

function applySecurity() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(allowPermission(permission, details.requestingUrl, devUrl));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
    allowPermission(permission, requestingOrigin, devUrl),
  );
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isTrustedOrigin(url, devUrl)) event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url }) => {
      // Enlaces externos (si los hubiera) se abren en el navegador, nunca en la app.
      if (url.startsWith('https://')) void shell.openExternal(url);
      return { action: 'deny' };
    });
  });
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0F1114',
    title: 'SeñaVoz',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  void win.loadURL(devUrl ?? `${APP_ORIGIN}/index.html`);
  return win;
}

app.whenReady().then(() => {
  protocol.handle(APP_SCHEME, (request) => {
    const resolved = resolveAppPath(rendererRoot, request.url);
    if (resolved.kind === 'notFound') return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(resolved.path).toString());
  });
  applySecurity();
  registerIpc(createWindow());
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
