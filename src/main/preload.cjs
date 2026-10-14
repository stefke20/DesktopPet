'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel, cb) => ipcRenderer.on(channel, (_e, payload) => cb(payload));

contextBridge.exposeInMainWorld('pet', {
  getDisplay: () => ipcRenderer.invoke('get-display'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  onState: (cb) => { on('state', cb); ipcRenderer.send('state-request'); },
  onCursor: (cb) => on('cursor', cb),
  onCommand: (cb) => on('command', cb),
  setInteractive: (b) => ipcRenderer.send('set-interactive', !!b),
  iconImage: (name) => ipcRenderer.invoke('icon-image', name),
  parkIcon: (name) => ipcRenderer.send('park-icon', name),
  moveIcon: (name, cx, cy) => ipcRenderer.send('move-icon', name, cx, cy),
  restoreIcon: (name) => ipcRenderer.send('restore-icon', name),
  resetIcons: () => ipcRenderer.send('reset-icons'),
  log: (msg) => ipcRenderer.send('log', String(msg)),
});
