const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (process.platform==='linux'?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 const page=await browser.newPage({viewport:{width:1400,height:1150}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173');
 await page.click('#demo');
 await page.waitForFunction(()=>document.querySelector('#status').textContent==='Demo complete',null,{timeout:45000});
 assert.equal((await page.locator('#output').innerText()).trim(),'CQ CQ DE FINEMORSE 73');
 await page.locator('#envelope').click({position:{x:250,y:20}});assert.match(await page.locator('#thresholdLabel').innerText(),/MANUAL/);
 assert.equal(await page.locator('#output .provisional').count(),0);
 await page.locator('#envelope').click({button:'right'});assert.match(await page.locator('#thresholdLabel').innerText(),/AUTO/);
 assert.equal((await page.locator('#output').innerText()).trim(),'CQ CQ DE FINEMORSE 73');
 await page.locator('#dit').fill('40');await page.locator('#dit').dispatchEvent('input');
 assert.notEqual((await page.locator('#output').innerText()).trim(),'CQ CQ DE FINEMORSE 73');
 await page.locator('#dit').fill('80');await page.locator('#dit').dispatchEvent('input');
 assert.equal((await page.locator('#output').innerText()).trim(),'CQ CQ DE FINEMORSE 73');
 await page.screenshot({path:process.env.SCREENSHOT_PATH || require('node:path').join(require('node:os').tmpdir(),'finemorse.png'),fullPage:true});
 await page.locator('#message').fill('E');await page.locator('#message').press('Enter');
 await page.waitForFunction(()=>document.querySelector('#txStatus').textContent==='Message sent · PTT off');
 await page.locator('#message').fill('TTTTTTTT');await page.locator('#message').press('Enter');await page.click('#stop');
 await page.waitForFunction(()=>!document.querySelector('#send').disabled);
 assert.match(await page.locator('#txStatus').innerText(),/Stopped/);
 await page.evaluate(()=>{
   navigator.mediaDevices.getUserMedia=async()=>{
     const ctx=new AudioContext(),dest=ctx.createMediaStreamDestination(),osc=ctx.createOscillator(),amp=ctx.createGain();
     osc.frequency.value=700;osc.connect(amp);amp.connect(dest);amp.gain.value=0;
     let t=ctx.currentTime+0.6;osc.start();
     for(const event of CW.encode('SOS',80)){amp.gain.setValueAtTime(event.on?0.3:0,t);t+=event.duration/1000;}
     amp.gain.setValueAtTime(0,t);window.testAudio=ctx;return dest.stream;
   };
 });
 await page.click('#listen');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Receiving live audio');
 await page.waitForFunction(()=>document.querySelector('#output').textContent.trim()==='SOS',null,{timeout:10000});
 await page.click('#listen');await page.evaluate(()=>window.testAudio.close());assert.equal(await page.locator('#status').innerText(),'Receiver idle');
 assert.deepEqual(errors,[]);console.log('PASS: live demo decode, manual threshold, auto reset, timing revision, Enter TX, stop TX, synthetic audio SOS through receive FFT, microphone start/stop; no renderer errors');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
