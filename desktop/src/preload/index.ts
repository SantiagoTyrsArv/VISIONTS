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
      return () => void ipcRenderer.removeListener(IPC.meetingShortcut, listener);
    },
  },
};

contextBridge.exposeInMainWorld('senavoz', api);
