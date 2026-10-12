(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else root.CW = api;
})(globalThis, function () {
  const alphabet = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
    I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
    Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
    Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
    5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-',
    ',': '--..--', '?': '..--..', '/': '-..-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '@': '.--.-.'
  };
  const reverse = Object.fromEntries(Object.entries(alphabet).map(([a,b]) => [b,a]));
  function encode(text, dit) {
    if (!(dit > 0)) throw new Error('Invalid dot duration');
    const words = text.toUpperCase().trim().split(/\s+/).filter(Boolean);
    const unsupported = [...new Set(words.join('').split('').filter(c => !alphabet[c]))];
    if (unsupported.length) throw new Error('Unsupported characters: ' + unsupported.join(' '));
    const events = [];
    words.forEach((word, wi) => {
      if (wi) events.push({on:false, duration:7*dit});
      [...word].forEach((c, ci) => {
        if (ci) events.push({on:false,duration:3*dit});
        [...alphabet[c]].forEach((mark, mi) => {
          if (mi) events.push({on:false,duration:dit});
          events.push({on:true,duration:(mark === '.' ? 1 : 3)*dit});
        });
      });
    });
    return events;
  }
  function segments(samples, threshold) {
    if (!samples.length) return [];
    const out = [];
    let on = samples[0].level >= threshold, start = samples[0].time;
    for (let i=1;i<samples.length;i++) {
      const next = samples[i].level >= threshold;
      if (next !== on) { out.push({on,start,duration:samples[i].time-start}); start=samples[i].time; on=next; }
    }
    out.push({on,start,duration:samples.at(-1).time-start,open:true});
    return out;
  }
  function estimateDit(pulses, fallback=80) {
    const lengths = pulses.filter(p=>p.on && !p.open && p.duration>=15).map(p=>p.duration);
    if (lengths.length < 2) return fallback;
    // Fit dots (1 unit) and dashes (3 units), with gaps as additional evidence.
    const gaps = pulses.filter(p=>!p.on && !p.open && p.duration>=15).map(p=>p.duration);
    let best = {score:Infinity,dit:fallback};
    for (let dit=20;dit<=300;dit+=1) {
      const error = (x, units) => Math.min(...units.map(u=>Math.pow((x/dit-u)/u,2)));
      const score = lengths.reduce((sum,x)=>sum+error(x,[1,3]),0)/lengths.length
        + (gaps.length ? 0.6*gaps.reduce((sum,x)=>sum+error(x,[1,3,7]),0)/gaps.length : 0)
        + 0.002*Math.abs(Math.log(dit/fallback));
      if (score<best.score) best={score,dit};
    }
    return best.dit;
  }
  function decode(pulses, dit) {
    let text='', code='';
    const finish = () => { if(code) {text += reverse[code] || '�'; code='';} };
    for (const p of pulses) {
      if(p.duration < Math.min(15,dit*0.2)) continue;
      if(p.on) code += p.duration < 2*dit ? '.' : '-';
      else if(p.duration>=2*dit) {finish(); if(p.duration>=5*dit && text && !text.endsWith(' ')) text+=' ';}
    }
    return {text, pending:code, preview:code ? reverse[code] || '�' : ''};
  }
  function autoThreshold(noise, peak) { return Math.max(-90, Math.min(-1, noise + Math.max(6, (peak-noise)*0.5))); }
  function civPTT(on, address=0x94) {return Buffer.from([0xfe,0xfe,address,0xe0,0x1c,0x00,on?1:0,0xfd]);}
  return {alphabet,encode,segments,estimateDit,decode,autoThreshold,civPTT};
});
