const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const app=await electron.launch({executablePath:require('electron'),args:[...(process.platform==='linux'?['--no-sandbox','--disable-gpu']:[]),require('node:path').resolve(__dirname,'..')],env:process.env});
 const page=await app.firstWindow();await page.waitForLoadState();
 assert.equal(await page.title(),'FineMorse · CW station');
 const ports=await page.evaluate(()=>window.radio.ports());assert.ok(Array.isArray(ports));
 assert.equal(await page.evaluate(()=>typeof window.radio.ptt),'function');
 await page.evaluate(()=>window.radio.ptt(false));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.click('#demo');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Demo complete',null,{timeout:45000});
 assert.equal((await page.locator('#output').innerText()).trim(),'CQ CQ DE FINEMORSE 73');assert.deepEqual(errors,[]);
 console.log('PASS: Electron desktop startup, isolated IPC bridge, serial enumeration, unkeyed no-port operation and renderer CW demo');
 await app.close();
})().catch(e=>{console.error(e);process.exit(1);});
