import { app, BrowserWindow, ipcMain, net, protocol, safeStorage, session, shell } from 'electron';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { IPC, type Tokens } from '../shared/ipc';
import { APP_ORIGIN, APP_SCHEME, resolveAppPath } from './appProtocol';
import { allowPermission, isTrustedOrigin } from './security';
import { createTokenStore } from './tokenStore';
import { asciiUserAgent } from './userAgent';

// Antes de crear cualquier ventana: el User-Agent debe ser ASCII (ver userAgent.ts).
app.userAgentFallback = asciiUserAgent(app.userAgentFallback);

const devUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined;
const rendererRoot = join(__dirname, '../renderer');

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function registerIpc() {
  const store = createTokenStore({
    filePath: join(app.getPath('userData'), 'session.bin'),
    safeStorage,
    fs: { readFile, writeFile, rm: (p) => rm(p, { force: true }) },
  });
  ipcMain.handle(IPC.tokensGet, () => store.get());
  ipcMain.handle(IPC.tokensSave, (_e, tokens: Tokens) => store.save(tokens));
  ipcMain.handle(IPC.tokensClear, () => store.clear());
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0B1220',
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
}

app.whenReady().then(() => {
  protocol.handle(APP_SCHEME, (request) => {
    const resolved = resolveAppPath(rendererRoot, request.url);
    if (resolved.kind === 'notFound') return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(resolved.path).toString());
  });
  registerIpc();
  applySecurity();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
