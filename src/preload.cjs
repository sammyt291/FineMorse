const {contextBridge,ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('radio', {
  ports:()=>ipcRenderer.invoke('ports'),
  settings:path=>ipcRenderer.invoke('settings',path),
  connect:config=>ipcRenderer.invoke('connect',config),
  disconnect:()=>ipcRenderer.invoke('disconnect'),
  ptt:on=>ipcRenderer.invoke('ptt',on),
  heartbeat:()=>ipcRenderer.send('heartbeat')
});
