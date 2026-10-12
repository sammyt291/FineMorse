const {app,BrowserWindow,ipcMain,session} = require('electron');
const {SerialPort} = require('serialport');
const {execFile} = require('node:child_process');
const path = require('node:path');
const {civPTT} = require('./cw.js');
let port, address=0x94, keyed=false, lastHeartbeat=0, window;
async function setPTT(on) {
  if(!port?.isOpen) {if(!on) return; throw new Error('Connect a serial port before keying PTT');}
  await new Promise((resolve,reject)=>port.write(civPTT(on,address),err=>err?reject(err):port.drain(err=>err?reject(err):resolve())));
  keyed=on;
  if(on) lastHeartbeat=Date.now();
}
async function disconnect() {
  await setPTT(false);
  if(port?.isOpen) await new Promise((resolve,reject)=>port.close(e=>e?reject(e):resolve()));
  port=null;
}
ipcMain.handle('ports',()=>SerialPort.list());
ipcMain.handle('settings',async(_,name)=>{
  if(process.platform !== 'win32') return null;
  if(!/^COM\d+$/i.test(name)) throw new Error('Invalid Windows COM port');
  return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',
    `Get-CimInstance Win32_SerialPortConfiguration | Where-Object { $_.Name -eq '${name}' } | Select-Object BaudRate,DataBits,Parity,StopBits | ConvertTo-Json -Compress`],
    {timeout:5000},(err,stdout)=>{if(err)return reject(err);try{resolve(stdout.trim()?JSON.parse(stdout):null);}catch(e){reject(e);}}));
});
ipcMain.handle('connect',async(_,config)=>{
  if(!config || typeof config.path!=='string' || !Number.isInteger(config.baudRate) || config.baudRate<300 || config.baudRate>115200) throw new Error('Invalid serial settings');
  if(!Number.isInteger(config.address) || config.address<1 || config.address>0xdf) throw new Error('Invalid CI-V address');
  if(![5,6,7,8].includes(config.dataBits) || !['none','even','odd','mark','space'].includes(config.parity) || ![1,1.5,2].includes(config.stopBits)) throw new Error('Invalid serial format');
  await disconnect(); address=config.address;
  port=new SerialPort({path:config.path,baudRate:config.baudRate,dataBits:config.dataBits,parity:config.parity,stopBits:config.stopBits,autoOpen:false,rtscts:false});
  port.on('error',()=>{keyed=false;});
  await new Promise((resolve,reject)=>port.open(err=>err?reject(err):resolve()));
  await new Promise((resolve,reject)=>port.set({rts:false,dtr:false},err=>err?reject(err):resolve()));
  await setPTT(false);
  return true;
});
ipcMain.handle('disconnect',disconnect);
ipcMain.handle('ptt',(_,on)=>{if(typeof on!=='boolean')throw new Error('Invalid PTT state');return setPTT(on);});
ipcMain.on('heartbeat',()=>{lastHeartbeat=Date.now();});
setInterval(()=>{if(keyed && Date.now()-lastHeartbeat>2000)setPTT(false).catch(()=>{});},500).unref();
app.whenReady().then(()=>{
  session.defaultSession.setPermissionRequestHandler((wc,permission,callback)=>callback(wc===window?.webContents && permission==='media'));
  window=new BrowserWindow({width:1320,height:960,minWidth:950,minHeight:750,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.loadFile(path.join(__dirname,'index.html'));
  window.on('close',event=>{if(port?.isOpen){event.preventDefault();disconnect().then(()=>window.destroy(),()=>window.destroy());}});
});
app.on('window-all-closed',()=>app.quit());
