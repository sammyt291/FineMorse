const $ = id => document.getElementById(id);
let ctx, analyser, stream, source, running=false, frame, samples=[], committed='', autoThreshold=true;
let currentDit=80, threshold=-45, demoTimer, connected=false, sending=false, cancelSend=false;
let clockOrigin=0, lastFrame=0, lastWaterfall=0, noise=-80, peak=-40, activeOsc, txContext;
const waterfall=$('waterfall'), wc=waterfall.getContext('2d'), envelope=$('envelope'), ec=envelope.getContext('2d');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function number(id,min,max) {const x=Number($(id).value);if(!Number.isFinite(x)||x<min||x>max)throw new Error(`${id} must be between ${min} and ${max}`);return x;}
function status(text){$('status').textContent=text;}
async function refreshDevices() {
  const devices=await navigator.mediaDevices.enumerateDevices();
  for(const [id,kind,label] of [['input','audioinput','Default microphone'],['sink','audiooutput','Default output']]) {
    const value=$(id).value; $(id).replaceChildren(new Option(label,''));
    devices.filter(d=>d.kind===kind).forEach((d,i)=>$(id).add(new Option(d.label||`${kind} ${i+1}`,d.deviceId)));
    $(id).value=value;
  }
  if(window.radio) {
    const value=$('port').value, ports=await window.radio.ports();
    $('port').replaceChildren(new Option('Select COM port',''));
    ports.forEach(p=>$('port').add(new Option(`${p.path}${p.manufacturer?' · '+p.manufacturer:''}`,p.path)));
    $('port').value=value;
  } else {$('connect').disabled=true;$('armed').disabled=true;$('serialHint').textContent='Browser preview: serial control requires the Electron desktop app. Audio receive and Morse preview are available here.';}
}
async function stopReceive() {
  running=false; cancelAnimationFrame(frame); clearInterval(demoTimer); demoTimer=null;
  stream?.getTracks().forEach(t=>t.stop()); source?.disconnect(); if(ctx)await ctx.close();ctx=null;
  $('listen').textContent='Start listening';status('Receiver idle');
}
function resetReception(){samples=[];committed='';noise=-80;peak=-40;clockOrigin=performance.now();lastFrame=0;lastWaterfall=0;wc.clearRect(0,0,waterfall.width,waterfall.height);updateDecode();drawEnvelope();}
function receiveSample(time,level) {
  samples.push({time,level});
  if(autoThreshold) {
    noise=Math.min(level,noise+0.025);peak=Math.max(level,peak-0.05);
    threshold=CW.autoThreshold(noise,peak);$('threshold').value=Math.round(threshold);
  }
  // Retain an in-flight character beyond the window, committing only at character gaps.
  const cutoff=time-clamp(Number($('window').value)||30,5,120)*1000;
  if(samples.length && samples[0].time<cutoff) {
    const seg=CW.segments(samples,threshold);let boundary;
    for(const p of seg)if(!p.on && p.duration>=2*currentDit && p.start+p.duration<=cutoff)boundary=p.start+p.duration;
    const tail=seg.at(-1);
    if(tail && !tail.on && tail.start+5*currentDit<=cutoff)boundary=cutoff;
    if(boundary!==undefined){
      committed+=CW.decode(seg.filter(p=>p.start<boundary).map(p=>({...p,duration:Math.min(p.duration,boundary-p.start),open:false})),currentDit).text;
      samples=samples.filter(s=>s.time>=boundary);
    }
    if(samples.length>60000)samples.splice(0,samples.length-60000);
  }
  updateDecode();drawEnvelope();
}
function updateDecode() {
  const seg=CW.segments(samples,threshold);
  if($('autoTiming').checked)currentDit=CW.estimateDit(seg,currentDit);
  else currentDit=Number($('dit').value);
  $('dit').value=currentDit;$('dotLabel').textContent=Math.round(currentDit);$('speedLabel').textContent=`${(1200/currentDit).toFixed(1)} WPM`;
  $('threshold').value=Math.round(threshold);
  $('thresholdLabel').textContent=`${autoThreshold?'AUTO':'MANUAL'} · ${Math.round(threshold)} dB`;
  const decoded=CW.decode(seg,currentDit);$('output').replaceChildren();
  if(!committed && !decoded.text && !decoded.pending){const span=document.createElement('span');span.className='placeholder';span.textContent='Listen to a CW signal or run the demo.';$('output').append(span);}
  else {$('output').append(document.createTextNode(committed));const span=document.createElement('span');span.className='provisional';span.textContent=decoded.text;$('output').append(span);const preview=document.createElement('span');preview.className='preview';preview.textContent=decoded.preview;$('output').append(preview);}
  $('pending').textContent=`Current symbol: ${decoded.pending||'—'}${decoded.pending?' · provisional':''}`;
  $('pulses').textContent=seg.filter(p=>p.on).slice(-8).map(p=>`${p.duration<2*currentDit?'·':'−'} ${Math.round(p.duration)} ms${p.open?'…':''}`).join('  ')||'Waiting for a signal…';
}
function drawEnvelope() {
  const w=envelope.width,h=envelope.height;ec.fillStyle='#080e16';ec.fillRect(0,0,w,h);
  const y=db=>h*(1-clamp((db+100)/100,0,1));
  ec.strokeStyle='#253446';ec.lineWidth=1;for(let db=-80;db<0;db+=20){ec.beginPath();ec.moveTo(0,y(db));ec.lineTo(w,y(db));ec.stroke();ec.fillStyle='#7b8da2';ec.font='10px monospace';ec.fillText(`${db} dB`,4,y(db)-3);}
  const end=samples.at(-1)?.time||0;ec.strokeStyle='#81ecc4';ec.beginPath();let started=false;
  for(const s of samples){if(s.time<end-8000)continue;const x=w*(1-(end-s.time)/8000);if(!started){ec.moveTo(x,y(s.level));started=true;}else ec.lineTo(x,y(s.level));}ec.stroke();
  ec.strokeStyle='#f3be73';ec.setLineDash([6,4]);ec.beginPath();ec.moveTo(0,y(threshold));ec.lineTo(w,y(threshold));ec.stroke();ec.setLineDash([]);
}
function drawWaterfall(bins,sampleRate,fftSize,time) {
  if(time-lastWaterfall<35)return;lastWaterfall=time;
  const w=waterfall.width,h=waterfall.height;wc.drawImage(waterfall,0,0,w,h-2,0,2,w,h-2);
  for(let x=0;x<w;x++) {
    const freq=200+x/w*1000,db=bins[Math.round(freq/(sampleRate/fftSize))],v=clamp((db+90)/65,0,1);
    wc.fillStyle=`rgb(${Math.round(25+v*65)},${Math.round(15+v*220)},${Math.round(30+v*140)})`;wc.fillRect(x,0,1,2);
  }
  const x=(Number($('frequency').value)-200)/1000*w;wc.fillStyle='#f3be73';wc.fillRect(x,0,1,h);
}
async function listen() {
  if(running){await stopReceive();return;}await stopReceive();
  stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:$('input').value?{exact:$('input').value}:undefined,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  ctx=new AudioContext();await ctx.resume();source=ctx.createMediaStreamSource(stream);analyser=ctx.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=0;source.connect(analyser);
  const bins=new Float32Array(analyser.frequencyBinCount);resetReception();running=true;$('listen').textContent='Stop listening';status('Receiving live audio');await refreshDevices();
  function tick(now){if(!running)return;analyser.getFloatFrequencyData(bins);const time=now-clockOrigin;drawWaterfall(bins,ctx.sampleRate,analyser.fftSize,time);
    if(now-lastFrame>=10){lastFrame=now;const center=Math.round(Number($('frequency').value)*analyser.fftSize/ctx.sampleRate);let level=-100;for(let i=Math.max(0,center-1);i<=Math.min(bins.length-1,center+1);i++)level=Math.max(level,bins[i]);receiveSample(time,level);}
    frame=requestAnimationFrame(tick);
  }frame=requestAnimationFrame(tick);
}
async function demo() {
  await stopReceive();resetReception();const origin=performance.now(),events=CW.encode('CQ CQ DE FINEMORSE 73',80);events.unshift({on:false,duration:600});events.push({on:false,duration:1000});
  status('Demo · CQ CQ DE FINEMORSE 73');let offset=0,index=0;
  demoTimer=setInterval(()=>{const time=performance.now()-origin;while(index<events.length && time>=offset+events[index].duration){offset+=events[index++].duration;}
    if(index>=events.length){clearInterval(demoTimer);demoTimer=null;status('Demo complete');return;}
    const level=events[index].on?-26:-83;receiveSample(time,level);const bins=new Float32Array(1024).fill(-90);if(events[index].on){const center=Math.round(Number($('frequency').value)*2048/48000);bins[center]=-26;}drawWaterfall(bins,48000,2048,time);
  },10);
}
function manualThreshold(value){autoThreshold=false;threshold=clamp(value,-100,0);$('threshold').value=Math.round(threshold);updateDecode();drawEnvelope();}
function restoreAuto(){autoThreshold=true;threshold=CW.autoThreshold(noise,peak);updateDecode();drawEnvelope();}
$('waterfall').onclick=e=>{const rect=waterfall.getBoundingClientRect();$('frequency').value=Math.round(200+(e.clientX-rect.left)/rect.width*1000);$('frequencyLabel').textContent=`${$('frequency').value} Hz`;};
$('envelope').onclick=e=>{const rect=envelope.getBoundingClientRect();manualThreshold(-100*(e.clientY-rect.top)/rect.height);};
$('envelope').oncontextmenu=e=>{e.preventDefault();restoreAuto();};$('autoThreshold').onclick=restoreAuto;
$('threshold').onchange=()=>manualThreshold(Number($('threshold').value));
$('frequency').onchange=()=>{$('frequency').value=clamp(Number($('frequency').value)||700,200,1200);$('frequencyLabel').textContent=`${$('frequency').value} Hz`;};
$('dit').oninput=()=>{$('autoTiming').checked=false;updateDecode();};$('autoTiming').onchange=updateDecode;$('window').onchange=()=>{$('window').value=clamp(Number($('window').value)||30,5,120);};
$('clear').onclick=resetReception;
function guard(fn){return async(...args)=>{try{await fn(...args);}catch(e){status(e.message);}};}
$('listen').onclick=guard(listen);$('demo').onclick=guard(demo);$('refresh').onclick=guard(refreshDevices);
$('port').onchange=guard(async()=>{
  if(!window.radio || !$('port').value)return;const config=await window.radio.settings($('port').value);
  if(!config){$('serialHint').textContent='Windows settings were unavailable. Enter the radio’s serial settings explicitly.';return;}
  if(config.BaudRate)$('baud').value=config.BaudRate;if(config.DataBits)$('dataBits').value=config.DataBits;
  const parity=['none','odd','even','mark','space'][config.Parity];if(parity)$('parity').value=parity;
  const bits=[1,1.5,2][config.StopBits];if(bits)$('stopBits').value=bits;
  $('serialHint').textContent='Imported Windows COM-port settings. Confirm they match the IC-7300 CI-V USB settings.';
});
$('connect').onclick=guard(async()=>{
  if(sending)throw new Error('Stop transmission before changing the radio connection');
  if(connected){await window.radio.disconnect();connected=false;$('connect').textContent='Connect radio';$('armed').checked=false;return;}
  const address=Number.parseInt($('address').value,16);if(!/^[0-9a-f]{2}$/i.test($('address').value))throw new Error('CI-V address must be two hexadecimal digits');
  await window.radio.connect({path:$('port').value,baudRate:number('baud',300,115200),dataBits:Number($('dataBits').value),parity:$('parity').value,stopBits:Number($('stopBits').value),address});connected=true;$('connect').textContent='Disconnect radio';status('Serial connected · PTT off');
});
async function transmit(text) {
  if(sending)throw new Error('A message is already sending');
  const events=CW.encode(text,1200/number('txWpm',5,60));if(!events.length)return;
  const tone=number('txTone',200,1200),gain=number('volume',0,100)/100,useRadio=$('armed').checked;
  if(useRadio && !connected)throw new Error('Connect the radio before enabling PTT');
  sending=true;cancelSend=false;$('send').disabled=true;$('connect').disabled=true;let heartbeat;
  try {
    txContext=new AudioContext();
    if($('sink').value){if(!txContext.setSinkId)throw new Error('This runtime cannot select an audio output');await txContext.setSinkId($('sink').value);}
    await txContext.resume();
    if(cancelSend)return;
    if(useRadio){await window.radio.ptt(true);heartbeat=setInterval(()=>window.radio.heartbeat(),500);await sleep(150);}
    $('txStatus').textContent=`${useRadio?'Transmitting':'Audio preview'}: ${text.toUpperCase()}`;
    // Schedule on the audio clock so UI stalls cannot distort dot/dash spacing.
    const osc=txContext.createOscillator(),amp=txContext.createGain();activeOsc=osc;
    osc.frequency.value=tone;osc.connect(amp);amp.connect(txContext.destination);
    const start=txContext.currentTime+0.02;let offset=0; amp.gain.setValueAtTime(0,txContext.currentTime);
    for(const event of events){
      const t=start+offset,d=event.duration/1000,ramp=Math.min(0.005,d/4);
      if(event.on){amp.gain.setValueAtTime(0,t);amp.gain.linearRampToValueAtTime(gain,t+ramp);amp.gain.setValueAtTime(gain,t+d-ramp);amp.gain.linearRampToValueAtTime(0,t+d);}
      offset+=d;
    }
    osc.start(start);osc.stop(start+offset);
    while(!cancelSend && txContext.currentTime<start+offset)await sleep(15);
    $('txStatus').textContent=cancelSend?'Stopped · PTT off':'Message sent · PTT off';
  } finally {
    clearInterval(heartbeat);
    try{if(useRadio)await window.radio.ptt(false);}catch(e){$('txStatus').textContent=`PTT off failed: ${e.message}. Release PTT on the radio.`;}
    if(txContext){await txContext.close();txContext=null;}activeOsc=null;sending=false;$('send').disabled=false;$('connect').disabled=!window.radio;
  }
}
$('sendForm').onsubmit=e=>{e.preventDefault();transmit($('message').value).catch(e=>{$('txStatus').textContent=e.message;});};
$('stop').onclick=guard(async()=>{cancelSend=true;try{activeOsc?.stop();}catch{}if(window.radio)await window.radio.ptt(false);$('txStatus').textContent='Stopped · PTT off';});
$('armed').onchange=()=>{$('txStatus').textContent=$('armed').checked?'Radio PTT enabled · Enter will transmit':'Preview mode · PTT disabled';};
window.addEventListener('beforeunload',()=>{cancelSend=true;stream?.getTracks().forEach(t=>t.stop());if(window.radio)window.radio.ptt(false).catch(()=>{});});
refreshDevices().catch(e=>status(e.message));drawEnvelope();
