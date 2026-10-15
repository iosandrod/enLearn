import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopPrint', {
  api: (path: string, options?: { method?: string; body?: unknown }) => ipcRenderer.invoke('desktop-print:api', path, options),
  platform: process.platform
});
