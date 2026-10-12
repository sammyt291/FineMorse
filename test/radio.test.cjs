const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function harness(){
  const handlers={},messages=[],events={};let interval,now=1000,instance;
  class Port {
    constructor(config){this.config=config;this.isOpen=false;instance=this;}
    on(name,fn){events[name]=fn;}
    open(callback){this.isOpen=true;callback();}
    set(config,callback){this.lineSettings=config;callback();}
    write(data,callback){messages.push(data.toString('hex'));callback();}
    drain(callback){callback();}
    close(callback){this.isOpen=false;callback();}
    static list(){return Promise.resolve([{path:'COM3'}]);}
  }
  const electron={app:{whenReady:()=>({then:()=>{}}),on:()=>{}},ipcMain:{handle:(name,fn)=>handlers[name]=fn,on:(name,fn)=>handlers[name]=fn}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/main.cjs'),'utf8'),{
    require:name=>name==='electron'?electron:name==='serialport'?{SerialPort:Port}:name==='./cw.js'?require('../src/cw.js'):require(name),
    __dirname:path.join(__dirname,'../src'),process:{platform:'linux'},Date:{now:()=>now},
    setInterval:fn=>{interval=fn;return {unref(){}};}
  });
  return {invoke:(name,...args)=>handlers[name]({},...args),messages,get port(){return instance;},tick:async()=>{now+=3000;interval();await new Promise(resolve=>setImmediate(resolve));}};
}
const config={path:'COM3',baudRate:19200,dataBits:8,parity:'none',stopBits:1,address:0x94};
test('radio connects, clears RTS/DTR, sends RX/TX commands and unkeys before closing',async()=>{
  const h=harness();await h.invoke('connect',config);assert.equal(h.port.lineSettings.rts,false);assert.equal(h.port.lineSettings.dtr,false);
  await h.invoke('ptt',true);await h.invoke('disconnect');
  assert.deepEqual(h.messages,['fefe94e01c0000fd','fefe94e01c0001fd','fefe94e01c0000fd']);assert.equal(h.port.isOpen,false);
});
test('watchdog releases PTT when renderer heartbeat stops',async()=>{
  const h=harness();await h.invoke('connect',config);await h.invoke('ptt',true);await h.tick();
  assert.equal(h.messages.at(-1),'fefe94e01c0000fd');
});
test('invalid configuration and unconnected TX are rejected',async()=>{
  const h=harness();await assert.rejects(h.invoke('ptt',true),/Connect/);
  await assert.rejects(h.invoke('connect',{...config,parity:'invalid'}),/Invalid serial format/);
  await assert.rejects(h.invoke('connect',{...config,address:0xff}),/CI-V address/);
});
