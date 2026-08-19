"use strict";
/* ─── AUDIO ──────────────────────────────────────────────────── */
const Aud={
  ctx:null,mast:null,comp:null,vol:.7,
  eng1:null,eng2:null,eng3:null,ePulse:null,ePulseGain:null,eTurbo:null,eTurboGain:null,
  eNoise:null,eNoiseGain:null,eFilt:null,eGain:null,_eNoiseFilt:null,
  roadFilt:null,roadGain:null,roadSrc:null,
  init(){
    try{
      this.ctx=new(window.AudioContext||window.webkitAudioContext)();
      this.mast=this.ctx.createGain();this.mast.gain.value=this.vol;
      // a light compressor on the master bus so overlapping layers (engine +
      // road noise + brake/drift screech + impact thumps) glue together
      // cleanly instead of stacking into harsh, clipped peaks.
      this.comp=this.ctx.createDynamicsCompressor();
      this.comp.threshold.value=-18;this.comp.knee.value=18;this.comp.ratio.value=3.2;
      this.comp.attack.value=.006;this.comp.release.value=.2;
      this.mast.connect(this.comp);this.comp.connect(this.ctx.destination);
      // engine — modeled as a small 4-cylinder 4-stroke rather than a
      // couple of arbitrarily-tuned oscillators. The pitch you actually
      // hear is the CYLINDER FIRING RATE (RPM/30 for a 4-cyl 4-stroke —
      // each cylinder fires once every 2 revolutions), which is what
      // real engine pitch tracks, not raw RPM. Layers:
      //  - fundamental + detuned unison sawtooth → body/beating
      //  - sub-octave square → low-end growl/weight
      //  - a sine at the SAME firing rate patched straight into the
      //    voice's own gain param → an audible pulse/"putter" in time
      //    with each simulated cylinder firing, instead of one smooth tone
      //  - filtered noise → mechanical/exhaust texture
      //  - a quiet high-passed sine that only cuts through near redline
      //    → turbo/induction whine
      // all through one shared lowpass "throttle" filter so opening it
      // with RPM brightens the whole voice at once.
      this.eFilt=this.ctx.createBiquadFilter();this.eFilt.type='lowpass';this.eFilt.frequency.value=300;this.eFilt.Q.value=.8;
      this.eGain=this.ctx.createGain();this.eGain.gain.value=0;
      this.eFilt.connect(this.eGain);this.eGain.connect(this.mast);

      this.eng1=this.ctx.createOscillator();this.eng1.type='sawtooth';this.eng1.frequency.value=30;
      const g1=this.ctx.createGain();g1.gain.value=.5;
      this.eng1.connect(g1);g1.connect(this.eFilt);

      // detune removed (was 8 cents) — two oscillators at the same base
      // frequency but slightly detuned interfere and produce an audible
      // slow beating/warble in the pitch, which is what was reported as
      // the engine sound "wobbling". Same unison layer, no detune now.
      this.eng2=this.ctx.createOscillator();this.eng2.type='sawtooth';this.eng2.frequency.value=30;
      const g2=this.ctx.createGain();g2.gain.value=.32;
      this.eng2.connect(g2);g2.connect(this.eFilt);

      this.eng3=this.ctx.createOscillator();this.eng3.type='square';this.eng3.frequency.value=15; // sub-octave rumble
      const g3=this.ctx.createGain();g3.gain.value=.3;
      this.eng3.connect(g3);g3.connect(this.eFilt);

      this.ePulse=this.ctx.createOscillator();this.ePulse.type='sine';this.ePulse.frequency.value=30;
      this.ePulseGain=this.ctx.createGain();this.ePulseGain.gain.value=0;
      this.ePulse.connect(this.ePulseGain);this.ePulseGain.connect(this.eGain.gain);

      this.eTurbo=this.ctx.createOscillator();this.eTurbo.type='sine';this.eTurbo.frequency.value=900;
      this.eTurboGain=this.ctx.createGain();this.eTurboGain.gain.value=0;
      const turboHP=this.ctx.createBiquadFilter();turboHP.type='highpass';turboHP.frequency.value=700;
      this.eTurbo.connect(turboHP);turboHP.connect(this.eTurboGain);this.eTurboGain.connect(this.mast);

      const nbufLen=this.ctx.sampleRate*2;
      const nbuf=this.ctx.createBuffer(1,nbufLen,this.ctx.sampleRate);
      const ndata=nbuf.getChannelData(0);
      for(let i=0;i<nbufLen;i++)ndata[i]=Math.random()*2-1;
      this.eNoise=this.ctx.createBufferSource();this.eNoise.buffer=nbuf;this.eNoise.loop=true;
      const nFilt=this.ctx.createBiquadFilter();nFilt.type='bandpass';nFilt.frequency.value=1400;nFilt.Q.value=.9;
      this.eNoiseGain=this.ctx.createGain();this.eNoiseGain.gain.value=0;
      this.eNoise.connect(nFilt);nFilt.connect(this.eNoiseGain);this.eNoiseGain.connect(this.mast);
      this._eNoiseFilt=nFilt;

      this.eng1.start();this.eng2.start();this.eng3.start();this.ePulse.start();this.eTurbo.start();this.eNoise.start();
      // continuous road/tire roll — a soft filtered-noise bed that rises
      // with speed, giving the "road surface" its own quiet audio presence
      // instead of the engine being the only thing you ever hear
      const rbufLen=this.ctx.sampleRate*2;
      const rbuf=this.ctx.createBuffer(1,rbufLen,this.ctx.sampleRate);
      const rdata=rbuf.getChannelData(0);
      for(let i=0;i<rbufLen;i++)rdata[i]=Math.random()*2-1;
      const rsrc=this.ctx.createBufferSource();rsrc.buffer=rbuf;rsrc.loop=true;
      this.roadFilt=this.ctx.createBiquadFilter();this.roadFilt.type='lowpass';this.roadFilt.frequency.value=500;
      this.roadGain=this.ctx.createGain();this.roadGain.gain.value=0;
      rsrc.connect(this.roadFilt);this.roadFilt.connect(this.roadGain);this.roadGain.connect(this.mast);
      rsrc.start();this.roadSrc=rsrc;
    }catch(e){}
  },
  resume(){this.ctx?.state==='suspended'&&this.ctx.resume();},
  setVol(v){this.vol=v;if(this.mast)this.mast.gain.value=v;},
  // brief cut in the engine-load sound right as a gear change happens —
  // the throttle/filter automation in update() reads Car._shiftT every
  // frame and dips through this window, so it always lands in sync with
  // the actual gear change instead of on a delay.
  shiftCut(){/* timing is driven by Car._shiftT, set alongside Car.gear */},
  // a short filtered noise burst — a soft exhaust "pop" right on a gear
  // change, the way a real car's exhaust burbles on a quick shift.
  exhaustPop(){
    if(!this.ctx||!this.eNoise?.buffer)return;
    const t=this.ctx.currentTime;
    const src=this.ctx.createBufferSource();src.buffer=this.eNoise.buffer;
    const f=this.ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=210;f.Q.value=1.15;
    const g=this.ctx.createGain();g.gain.value=0;
    src.connect(f);f.connect(g);g.connect(this.mast);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.16,t+.012);g.gain.exponentialRampToValueAtTime(.001,t+.22);
    src.start(t);src.stop(t+.25);
  },
  update(sr,thr){
    if(!this.ctx)return;
    const speedAbs=Math.abs(sr)*46;
    const t=this.ctx.currentTime;
    if(this.eng1){
      // RPM is read straight off the gearbox: same road speed reads
      // very differently depending on gear, and shifting instantly
      // re-reads it against the new gear (see GEAR_DATA/gearRPMPct) —
      // this is what makes 1st→2nd drop the pitch and a downshift raise it.
      let rpmPct=gearRPMPct(Car.gear||1,speedAbs);
      if(speedAbs<.5)rpmPct=Math.max(rpmPct,IDLE_RPM_PCT+thr*22); // idle blip when stationary
      rpmPct=clamp(rpmPct,0,122);
      const rpmN=clamp(rpmPct/100,0,1.22);
      // brief dip in the engine "load" sound right on a gear change,
      // like a clutch cutting drive for a beat, then it picks back up
      // at the new gear's RPM — envelope driven by Car._shiftT so it
      // always lines up exactly with the shift, never early/late.
      let shiftMul=1;
      if(Car._shiftT>0){
        const p=1-(Car._shiftT/SHIFT_CUT_DUR); // 0 at the shift → 1 as the window ends
        shiftMul=p<.3?1-(p/.3)*.92:.08+((p-.3)/.7)*.92;
      }
      // real idle→redline RPM (900→7000) so the firing-rate math below
      // behaves like an actual 4-cylinder 4-stroke engine, not a made-up
      // pitch curve — low RPM sits deep and quiet, and it climbs
      // smoothly toward a sharp, bright high-rev note near redline.
      const rpmReal=lerp(900,7000,clamp(rpmN,0,1));
      const firingHz=rpmReal/30; // (cylinders/2) firings per revolution × rev/s
      const curve=Math.pow(clamp(rpmN,0,1),1.15);
      this.eng1.frequency.setTargetAtTime(firingHz,t,.04);
      this.eng2.frequency.setTargetAtTime(firingHz,t,.04);
      this.eng3.frequency.setTargetAtTime(firingHz/2,t,.04);
      this.ePulse.frequency.setTargetAtTime(firingHz,t,.04);
      this.eFilt.frequency.setTargetAtTime((240+curve*2200)*(.55+.45*shiftMul)+speedAbs*18,t,.07);
      const vol=(.045+curve*.14+thr*.02)*shiftMul;
      this.eGain.gain.setTargetAtTime(vol,t,.06);
      this.ePulseGain.gain.setTargetAtTime(vol*(.12+curve*.1),t,.05); // pulse/"chug" depth grows a bit with RPM
      // turbo/induction whine — inaudible at low RPM, cuts through near redline
      const turboN=Math.pow(curve,3);
      this.eTurbo.frequency.setTargetAtTime(900+curve*2600,t,.08);
      this.eTurboGain.gain.setTargetAtTime(turboN*.05*shiftMul,t,.1);
      // exhaust/mechanical noise texture rises with RPM too, quietly
      this.eNoiseGain.gain.setTargetAtTime(Math.min(.045,vol*.26),t,.08);
      if(this._eNoiseFilt)this._eNoiseFilt.frequency.setTargetAtTime(900+curve*2600,t,.1);
    }
    if(this.roadGain){
      // quadratic rather than linear against speed — road noise stays
      // essentially silent at low speed and builds in gradually, rather
      // than being audible right from a crawl
      const n=clamp(speedAbs/46,0,1);
      this.roadGain.gain.setTargetAtTime(n*n*.1,t,.18);
      this.roadFilt.frequency.setTargetAtTime(450+n*3200,t,.2);
    }
  },
  updateMP(p1Spd, p1Thr, p2Spd, p2Thr){
    const maxSpd = Math.max(Math.abs(p1Spd), Math.abs(p2Spd));
    const maxThr = Math.max(p1Thr, p2Thr, 0.2);
    this.update(maxSpd / 46, maxThr);
  },
  stopEngine(){
    if(!this.ctx)return;
    const t=this.ctx.currentTime;
    if(this.eGain)this.eGain.gain.setTargetAtTime(0,t,.03);
    if(this.ePulseGain)this.ePulseGain.gain.setTargetAtTime(0,t,.03);
    if(this.eTurboGain)this.eTurboGain.gain.setTargetAtTime(0,t,.03);
    if(this.eNoiseGain)this.eNoiseGain.gain.setTargetAtTime(0,t,.03);
    if(this.roadGain)this.roadGain.gain.setTargetAtTime(0,t,.03);
    this.screechStop();
    this.brakeStop();
    this.reverseStop();
  },
  honk(){
    if(!this.ctx)return;
    const o=this.ctx.createOscillator();o.type='square';o.frequency.value=345;
    const g=this.ctx.createGain();g.gain.value=.0001;o.connect(g);g.connect(this.mast);
    const t=this.ctx.currentTime;g.gain.exponentialRampToValueAtTime(.2,t+.035);g.gain.exponentialRampToValueAtTime(.0001,t+.46);o.start(t);o.stop(t+.5);
  },
  crash(intensity){
    if(!this.ctx)return;
    const t=this.ctx.currentTime;
    // short noise burst for the impact "crunch"
    const bufLen=Math.floor(this.ctx.sampleRate*.25);
    const buf=this.ctx.createBuffer(1,bufLen,this.ctx.sampleRate);
    const data=buf.getChannelData(0);
    for(let i=0;i<bufLen;i++)data[i]=(Math.random()*2-1)*(1-i/bufLen);
    const noise=this.ctx.createBufferSource();noise.buffer=buf;
    const filt=this.ctx.createBiquadFilter();filt.type='lowpass';filt.frequency.value=1200+intensity*40;
    const g=this.ctx.createGain();g.gain.value=Math.min(.55,.15+intensity*.02);
    noise.connect(filt);filt.connect(g);g.connect(this.mast);
    noise.start(t);noise.stop(t+.25);
    // low thump for weight
    const o=this.ctx.createOscillator();o.type='sine';o.frequency.value=70;
    const og=this.ctx.createGain();og.gain.value=Math.min(.4,.1+intensity*.015);
    o.connect(og);og.connect(this.mast);
    og.gain.exponentialRampToValueAtTime(.0001,t+.3);o.start(t);o.stop(t+.3);
  },
  // continuous tire-screech loop — started while drifting, stopped when not
  _screechNoise:null,_screechGain:null,_screechFilt:null,
  screechStart(){
    if(!this.ctx||this._screechNoise)return;
    const bufLen=this.ctx.sampleRate*2;
    const buf=this.ctx.createBuffer(1,bufLen,this.ctx.sampleRate);
    const data=buf.getChannelData(0);
    for(let i=0;i<bufLen;i++)data[i]=Math.random()*2-1;
    const noise=this.ctx.createBufferSource();noise.buffer=buf;noise.loop=true;
    const filt=this.ctx.createBiquadFilter();filt.type='bandpass';filt.frequency.value=1800;filt.Q.value=1.6;
    const g=this.ctx.createGain();g.gain.value=0;
    noise.connect(filt);filt.connect(g);g.connect(this.mast);
    noise.start();
    this._screechNoise=noise;this._screechGain=g;this._screechFilt=filt;
  },
  screechSet(amount){ // 0..1 — call with a blend of speed + actual drift/slide intensity
    if(!this._screechGain)return;
    const t=this.ctx.currentTime;
    this._screechGain.gain.setTargetAtTime(Math.min(.18,amount*.18),t,.05);
    // pitch/tone climbs a little with intensity too, not just volume —
    // reads as the tires working harder, not just "louder"
    this._screechFilt.frequency.setTargetAtTime(1500+amount*900,t,.08);
  },
  screechStop(){
    if(!this._screechNoise)return;
    this._screechGain.gain.setTargetAtTime(0,this.ctx.currentTime,.12);
    const n=this._screechNoise,g=this._screechGain;
    setTimeout(()=>{try{n.stop();}catch(e){}},250);
    this._screechNoise=null;this._screechGain=null;this._screechFilt=null;
  },
  // separate brake squeal — brighter/tighter than the drift screech, only
  // for a firm, non-drifting brake at real speed (light taps stay silent,
  // matching real cars and avoiding a constant background hiss)
  _brakeNoise:null,_brakeGain:null,_brakeFilt:null,
  brakeStart(){
    if(!this.ctx||this._brakeNoise)return;
    const bufLen=this.ctx.sampleRate*2;
    const buf=this.ctx.createBuffer(1,bufLen,this.ctx.sampleRate);
    const data=buf.getChannelData(0);
    for(let i=0;i<bufLen;i++)data[i]=Math.random()*2-1;
    const noise=this.ctx.createBufferSource();noise.buffer=buf;noise.loop=true;
    const filt=this.ctx.createBiquadFilter();filt.type='bandpass';filt.frequency.value=2600;filt.Q.value=2.4;
    const g=this.ctx.createGain();g.gain.value=0;
    noise.connect(filt);filt.connect(g);g.connect(this.mast);
    noise.start();
    this._brakeNoise=noise;this._brakeGain=g;this._brakeFilt=filt;
  },
  brakeSet(amount){ // 0..1, proportional to brake pressure × speed
    if(!this._brakeGain)return;
    this._brakeGain.gain.setTargetAtTime(Math.min(.22,amount*.22),this.ctx.currentTime,.04);
  },
  brakeStop(){
    if(!this._brakeNoise)return;
    this._brakeGain.gain.setTargetAtTime(0,this.ctx.currentTime,.1);
    const n=this._brakeNoise,g=this._brakeGain;
    setTimeout(()=>{try{n.stop();}catch(e){}},220);
    this._brakeNoise=null;this._brakeGain=null;this._brakeFilt=null;
  },
  // reverse: a tonal backup beep (like a real vehicle's reverse alarm),
  // deliberately built from clean oscillator pulses rather than filtered
  // noise — that keeps it unmistakably different from the drift screech
  // and brake squeal, which are both noise-based, so the ear never
  // confuses "reversing" with "sliding".
  _revGain:null,_revTimer:null,_revAmt:0,
  reverseStart(){
    if(!this.ctx||this._revTimer)return;
    this._revGain=this.ctx.createGain();this._revGain.gain.value=0;
    this._revGain.connect(this.mast);
    const beep=()=>{
      if(!this._revGain)return;
      const t=this.ctx.currentTime;
      const o=this.ctx.createOscillator();o.type='sine';o.frequency.value=880;
      const g=this.ctx.createGain();g.gain.value=0;
      o.connect(g);g.connect(this._revGain);
      const peak=.16+this._revAmt*.1;
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(peak,t+.02);
      g.gain.linearRampToValueAtTime(0,t+.16);
      o.start(t);o.stop(t+.18);
    };
    beep();
    this._revTimer=setInterval(beep,420);
  },
  reverseSet(amount){ this._revAmt=amount; },
  reverseStop(){
    if(!this._revTimer)return;
    clearInterval(this._revTimer);this._revTimer=null;
    const g=this._revGain;this._revGain=null;
    if(g)setTimeout(()=>{try{g.disconnect();}catch(e){}},200);
  },
};

