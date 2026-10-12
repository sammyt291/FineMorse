const {test}=require('node:test');
const assert=require('node:assert/strict');
const CW=require('../src/cw.js');
function pulses(text,dit){let start=0;return [...CW.encode(text,dit),{on:false,duration:dit*7}].map(p=>{const next={...p,start};start+=p.duration;return next;});}
test('encodes standard Morse timing and round-trips letters, words, digits and punctuation',()=>{
  assert.deepEqual(CW.encode('ET',60),[{on:true,duration:60},{on:false,duration:180},{on:true,duration:180}]);
  const text='CQ CQ DE FINEMORSE 73?';assert.equal(CW.decode(pulses(text,80),80).text.trim(),text);
});
test('learns dot lengths at different speeds and with timing jitter',()=>{
  for(const dit of [30,60,80,120,240]){
    const p=pulses('CQ TEST 73',dit).map((p,i)=>({...p,duration:p.duration*(i%2?1.03:0.97)}));
    const estimate=CW.estimateDit(p,80);assert.ok(Math.abs(estimate-dit)<dit*0.07,`${dit}: ${estimate}`);
    assert.equal(CW.decode(p,estimate).text.trim(),'CQ TEST 73');
  }
});
test('manual speed changes revise the same recent pulses',()=>{
  const p=[{on:true,duration:120},{on:false,duration:700}];
  assert.equal(CW.decode(p,80).text.trim(),'E');assert.equal(CW.decode(p,40).text.trim(),'T');
});
test('threshold changes revise the same retained envelope',()=>{
  const samples=[{time:0,level:-80},{time:100,level:-40},{time:220,level:-80},{time:1000,level:-80}];
  assert.equal(CW.decode(CW.segments(samples,-50),80).text.trim(),'E');
  assert.equal(CW.decode(CW.segments(samples,-30),80).text,'');
});
test('an ongoing pulse changes from dot to dash and unfinished output stays provisional',()=>{
  assert.equal(CW.decode([{on:true,duration:70,open:true}],80).preview,'E');
  const result=CW.decode([{on:true,duration:240,open:true}],80);assert.equal(result.preview,'T');assert.equal(result.text,'');
});
test('rejects unsupported text before transmitting',()=>{assert.throws(()=>CW.encode('HELLO 🚀',80),/Unsupported/);});
test('IC-7300 CI-V PTT frames match command 1C 00 and the default address',()=>{
  assert.equal(CW.civPTT(true).toString('hex'),'fefe94e01c0001fd');
  assert.equal(CW.civPTT(false).toString('hex'),'fefe94e01c0000fd');
  assert.equal(CW.civPTT(true,0x95)[2],0x95);
});
test('auto threshold stays above steady background after peak decays',()=>{
  assert.ok(CW.autoThreshold(-83,-83)>-83);
  assert.equal(CW.decode(CW.segments([{time:0,level:-83},{time:30000,level:-83}],CW.autoThreshold(-83,-83)),80).pending,'');
  assert.ok(CW.autoThreshold(-83,-26)<-26);
});
