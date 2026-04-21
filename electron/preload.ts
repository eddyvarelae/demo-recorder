import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  chooseDestination: () => ipcRenderer.invoke('settings:chooseDestination'),
  setAudioIdx: (idx: number) => ipcRenderer.invoke('settings:setAudioIdx', idx),
  setAirpods: (on: boolean) => ipcRenderer.invoke('settings:setAirpods', on),
  setAudioOffset: (ms: number) => ipcRenderer.invoke('settings:setAudioOffset', ms),
  setSaveScreen: (on: boolean) => ipcRenderer.invoke('settings:setSaveScreen', on),
  setSaveCamera: (on: boolean) => ipcRenderer.invoke('settings:setSaveCamera', on),
  setSaveLog: (on: boolean) => ipcRenderer.invoke('settings:setSaveLog', on),
  setCamShape: (shape: 'rectangle' | 'square' | 'circle') => ipcRenderer.invoke('settings:setCamShape', shape),
  setCamCorner: (corner: 'tl' | 'tr' | 'bl' | 'br') => ipcRenderer.invoke('settings:setCamCorner', corner),
  setCamSize: (mult: number) => ipcRenderer.invoke('settings:setCamSize', mult),
  listDevices: () => ipcRenderer.invoke('devices:list'),
  startRecording: () => ipcRenderer.invoke('record:start'),
  stopRecording: () => ipcRenderer.invoke('record:stop'),
  revealInFinder: (filePath: string) => ipcRenderer.invoke('reveal', filePath),
  onStatus: (cb: (s: any) => void) => {
    const listener = (_: unknown, s: any) => cb(s);
    ipcRenderer.on('status', listener);
    return () => ipcRenderer.removeListener('status', listener);
  },
});
