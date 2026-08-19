"use strict";
/* ─── RENDERER INIT ──────────────────────────────────────────── */
function initRenderer(){
  renderer=new THREE.WebGLRenderer({canvas:document.getElementById('c'),antialias:true,powerPreference:'high-performance'});
  basePixelRatio=Math.min(window.devicePixelRatio||1, 2.0);
  curPixelRatio=basePixelRatio;
  renderer.setPixelRatio(curPixelRatio);
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  let resizeRAF=null;
  const doResize=()=>{
    const w=(window.visualViewport?window.visualViewport.width:innerWidth);
    const h=(window.visualViewport?window.visualViewport.height:innerHeight);
    renderer.setSize(w,h);
    if(driveCam){driveCam.aspect=w/h;driveCam.updateProjectionMatrix();}
    resizeCu();
  };
  const queueResize=()=>{
    if(resizeRAF)cancelAnimationFrame(resizeRAF);
    resizeRAF=requestAnimationFrame(doResize);
  };
  window.addEventListener('resize',queueResize);
  window.addEventListener('orientationchange',()=>{
    // mobile browsers can take a moment to finish resizing chrome
    // (address bar) after rotation, so re-check shortly after too.
    queueResize();setTimeout(queueResize,120);setTimeout(queueResize,400);
  });
  if(window.visualViewport)window.visualViewport.addEventListener('resize',queueResize);

  // Pause the render loop entirely while the tab/app isn't visible —
  // saves battery and avoids wasted GPU work on a backgrounded phone.
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){
      loopPaused=true;
    }else{
      loopPaused=false;
      clock.getDelta(); // discard the elapsed-while-hidden delta so Car/AI don't jump
      requestAnimationFrame(loop);
    }
  });
}
/* adaptive resolution: if FPS stays low for a few seconds on a touch
   device, step the render resolution down once (not oscillating back
   up, to keep things simple and stable). */
let basePixelRatio=1,curPixelRatio=1,lowFpsStreak=0,adaptiveStage=0;
function adaptivePR(fps){
  // Runs the render-resolution step-down on ANY device (not just touch
  // devices) — a laptop/desktop with an underpowered GPU can drop frames
  // here too, and previously it never got any relief. Also reacts faster
  // (2s instead of 3s of sustained low FPS) and can now step down twice
  // instead of only once, so persistent stutter actually keeps improving
  // instead of plateauing after a single small cut.
  if(adaptiveStage>=3||!renderer)return;
  // Target is a steady 60fps, not just "not stuttering badly" — react to
  // dropping below 55 (was 40) so a persistent 45-58fps case, which used
  // to never trigger a step-down at all, now actually gets relief. Also
  // reacts a bit faster (1.5s vs 2s) and now has a 3rd, more aggressive
  // step for stubborn cases instead of plateauing after two mild cuts.
  if(fps>0&&fps<55)lowFpsStreak++;else lowFpsStreak=0;
  if(lowFpsStreak>=3){ // ~1.5s of sustained sub-60 FPS (tickFPS samples every ~500ms)
    lowFpsStreak=0;
    adaptiveStage++;
    const mul=adaptiveStage===1?0.75:adaptiveStage===2?0.58:0.42;
    curPixelRatio=Math.max(0.4,basePixelRatio*mul);
    renderer.setPixelRatio(curPixelRatio);
  }
}

/* ─── FPS ────────────────────────────────────────────────────── */
let fc=0,fl=0;
function tickFPS(now){
  fc++;if(now-fl>500){
    const f=Math.round(fc*1000/(now-fl));
    document.getElementById('fv').textContent=f;
    document.getElementById('fm').textContent=(1000/Math.max(f,1)).toFixed(1);
    adaptivePR(f);
    fc=0;fl=now;
  }
}

/* ─── LOAD SEQUENCE ──────────────────────────────────────────── */
const STAGES=['Initializing renderer…','Generating city grid…','Placing buildings & roads…','Populating traffic & pedestrians…','Loading vehicle models…','Calibrating AI & sensors…','Wiring HUD & navigation…','Launching simulation…'];
const TIPS=['Tip: A = Turn Left, D = Turn Right','Tip: Press M to open the GPS navigation map','Tip: Press P to engage Auto-Parking','Tip: Press Z to enable AI Autopilot','Tip: Customize your vehicle before driving in the Studio'];
function runLoad(){
  const lf=document.getElementById('lf'),lst=document.getElementById('lst'),lp=document.getElementById('lpct'),lt=document.getElementById('ltip');
  if(lt)lt.textContent=pick(TIPS);let s=0;
  const step=()=>{
    const pct=Math.round(s/STAGES.length*100);
    if(lp)lp.textContent=pct+'%';
    if(lf)lf.style.width=pct+'%';
    if(lst)lst.textContent=STAGES[Math.min(s,STAGES.length-1)];
    requestAnimationFrame(()=>{
      try{
        if(s===1){initRenderer();buildCity();mkDriveCam();}
        if(s===4){Car.mesh=mkCar(cuState.carCol);scene.add(Car.mesh);}
      }catch(e){
        console.error('Loading step error at stage', s, e);
      }
      s++;
      if(s>=STAGES.length){
        try{Aud.init();}catch(e){}
        setTimeout(()=>{
          const loadEl=document.getElementById('scr-load');
          if(loadEl)loadEl.classList.add('out');
          appState='modeselect';
          const modeEl=document.getElementById('scr-mode');
          if(modeEl)modeEl.classList.add('show');
        },40);
        return;
      }
      setTimeout(step,15+Math.random()*15);
    });
  };
  setTimeout(step,15);
}

