import { contextBridge, ipcRenderer } from 'electron';

import { IPC, type SenavozApi, type Tokens } from '../shared/ipc';

const api: SenavozApi = {
  tokens: {
    get: () => ipcRenderer.invoke(IPC.tokensGet),
    save: (tokens: Tokens) => ipcRenderer.invoke(IPC.tokensSave, tokens),
    clear: () => ipcRenderer.invoke(IPC.tokensClear),
  },
};

contextBridge.exposeInMainWorld('senavoz', api);
