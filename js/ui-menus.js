"use strict";
/* ─── TOAST ──────────────────────────────────────────────────── */
let toastT;
function toast(msg){
  const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');
  clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),3200);
}

/* ─── PAUSE / MENU ───────────────────────────────────────────── */
function togglePause(){
  if(appState==='driving'){appState='paused';document.getElementById('pause').classList.add('show');syncPauseUI();}
  else if(appState==='paused'){appState='driving';document.getElementById('pause').classList.remove('show');document.getElementById('c').focus();}
}
function syncPauseUI(){
  const b=document.getElementById('pm-mis');
  b.textContent=gameMode==='mission'?'🎯 Mission Select':'🎯 Switch to Mission Mode';
}
function syncPauseSeg(segId,attr,val){
  document.querySelectorAll(`#${segId} .sb`).forEach(b=>b.classList.toggle('on',b.dataset[attr]===val));
}
function syncPauseSeg(segId,attr,val){
  document.querySelectorAll(`#${segId} .sb`).forEach(b=>b.classList.toggle('on',b.dataset[attr]===val));
}

function wirePause(){
  document.getElementById('pm-res').onclick=()=>togglePause();
  document.getElementById('pm-rst').onclick=()=>{
    Car.reset();W.tod=7;W.dest=null;clearMissionProps();W.activeMission=null;
    document.getElementById('mis-hud').classList.remove('show');document.getElementById('ap-hud').classList.remove('show');
    document.getElementById('tod-r').value=7;
    document.getElementById('pause').classList.remove('show');
    if(gameMode==='mission'&&missionState.current>=0){openBriefing(missionState.current);}
    else{appState='driving';document.getElementById('c').focus();toast('↺ Restarted');}
  };
  document.getElementById('pm-exit').onclick=()=>{
    Car.reset();W.dest=null;clearMissionProps();W.activeMission=null;RC.stop();
    document.getElementById('mis-hud').classList.remove('show');document.getElementById('ap-hud').classList.remove('show');
    document.getElementById('pause').classList.remove('show');document.getElementById('hud').classList.remove('show');
    appState='custom';document.getElementById('scr-cu').classList.add('show');
  };
  document.getElementById('pm-mis').onclick=()=>{
    document.getElementById('pause').classList.remove('show');
    if(gameMode==='mission')showMissionSelect();
    else startMissionMode(missionState.current===-1);
  };
  document.querySelectorAll('#seg-wx .sb').forEach(b=>b.onclick=()=>{W.wx=b.dataset.w;syncPauseSeg('seg-wx','w',W.wx);toast('Weather: '+b.textContent);});
  document.querySelectorAll('#seg-cam .sb').forEach(b=>b.onclick=()=>{camMode=b.dataset.c;document.getElementById('cam-lbl').textContent=CAM_LABELS[camMode];syncPauseSeg('seg-cam','c',camMode);});
  document.querySelectorAll('#seg-adas .sb').forEach(b=>b.onclick=()=>{
    const k=b.dataset.a;W.adas[k]=!W.adas[k];b.classList.toggle('on',W.adas[k]);
    const chip=document.getElementById('ac-'+k);
    if(chip){chip.classList.remove('warn');chip.classList.toggle('off',!W.adas[k]);chip.classList.toggle('ok',W.adas[k]);}
    toast(`ADAS ${k.toUpperCase()}: ${W.adas[k]?'ON':'OFF'}`);
  });
  document.querySelectorAll('#seg-ai .sb').forEach(b=>b.onclick=()=>{
    if(b.dataset.ai==='car'){W.ai.car=!W.ai.car;Car.aiDriving=W.ai.car;toast(`Car Autopilot: ${W.ai.car?'ON':'OFF'}`);}
    else{Car.aiDriving=false;toast('Manual Control');}
    syncPauseSeg('seg-ai','ai',b.dataset.ai);
  });
  document.querySelectorAll('#seg-tel .sb').forEach(b=>b.onclick=()=>{document.getElementById('telem').classList.toggle('show',b.dataset.t==='on');syncPauseSeg('seg-tel','t',b.dataset.t);});
  document.getElementById('tod-r').oninput=e=>{W.tod=parseFloat(e.target.value);document.getElementById('tod-v').textContent=ftm(W.tod);};
  document.getElementById('vol-r').oninput=e=>{Aud.setVol(parseInt(e.target.value)/100);document.getElementById('vol-v').textContent=e.target.value+'%';};

}

/* ─── GAME MODE (Free / Mission) ─────────────────────────────── */
let gameMode=null; // 'free' | 'mission' — chosen on the Mode Select screen
const missionState={current:-1,unlocked:0,results:[],bestTimes:{}}; // results[i]={score,time,collisions,perf}; bestTimes[i]=seconds (Time Trial only, resets on page reload)
// Any 3D objects a mission spawns (parking box outline, cones/barrels) get
// tracked here so they can be reliably torn down no matter how the
// mission ends — success, failure, or the player bailing out to the menu.
W.missionProps=[];
function clearMissionProps(){
  W.missionProps.forEach(o=>{try{scene.remove(o);}catch(e){}});
  W.missionProps=[];
}

/* ─── MISSION DEFINITIONS ────────────────────────────────────── */
// Seven structured missions, always in this order. Each has a clear
// objective + instructions (shown in the briefing) and a concrete,
// always-completable success condition (checked in updateMission).
const MISSIONS=[
  {key:'timetrial',name:'Downtown Speed Sprint',icon:'⚡',
    objective:'Race from the start to the marked finish line before the clock runs out.',
    instructions:['Follow the GPS route to the finish marker','The timer is tight — take the fastest safe line','Beat your best time on repeat attempts'],
    timeLimit:0},
  {key:'parkchallenge',name:'Precision Parallel Parking',icon:'🅿️',
    objective:'Pull into the marked bay and come to a stop fully inside the lines.',
    instructions:['Follow the marker to the parking bay','Ease in slowly — the box is tight','Stop fully inside, lined up straight, for a Perfect Park bonus'],
    timeLimit:0},
  {key:'obstacledodge',name:'Cone Slalom Hazard Run',icon:'🚧',
    objective:'Run the course to the finish, weaving around the cones without clipping them.',
    instructions:['Follow the route markers to the finish','Each cone you clip costs you time (+4s penalty)','Complete the course before the clock runs out'],
    timeLimit:0},
  {key:'checkpointrally',name:'City Grand Prix Rally',icon:'🚩',
    objective:'Hit every checkpoint in order across the city before time runs out.',
    instructions:['Head to each checkpoint marker in order','Checkpoints must be reached in sequence','Clear every checkpoint before the timer expires'],
    timeLimit:0},
  {key:'nightdrift',name:'Midnight Storm Drift King',icon:'🌙',
    objective:'Score 1500+ Drift Points around wet night corners and reach the finish line!',
    instructions:['Night rain makes roads slick — tap DRIFT on corners','Rack up 1500 drift points with high speed angle','Cross the neon finish line before the timer expires'],
    timeLimit:65},
  {key:'viprescue',name:'Emergency VIP Escort',icon:'🚨',
    objective:'Rush the VIP to 3 Emergency Drop-offs with minimal collisions and high VIP Health!',
    instructions:['Navigate dense rush hour traffic carefully','Each collision deals 25% damage to VIP Health','Reach all 3 medical drop-off points before health hits 0%'],
    timeLimit:85},
  {key:'ecofuel',name:'Empty Tank Eco-Glider',icon:'⚡',
    objective:'Fuel is critically low (20%)! Shift gears smartly and reach the Safe Eco-Haven Plaza!',
    instructions:['Your fuel gauge starts at critical 20%','Shift to 4th & 5th gear and coast to minimize consumption','Reach the glowing green Eco-Haven Plaza before the tank hits 0%'],
    timeLimit:75},
  {key:'sensorcalib',name:'AI LiDAR Sensor Calibration',icon:'🤖',
    objective:'Drive through 4 LiDAR/Radar Sensor Scanning Arches at steady target speed (40–65 KM/H)!',
    instructions:['Drive smoothly through all 4 Sensor Calibration Arches','Maintain steady speed between 40 KM/H and 65 KM/H inside each gate','Calibrate all 4 sensors to 100% to pass the test'],
    timeLimit:80},
  {key:'trafficweave',name:'Rush Hour Traffic Weave',icon:'⚡',
    objective:'Perform 8 Near-Miss overtakes past moving traffic cars without crashing!',
    instructions:['Drive in dense traffic at speeds above 45 KM/H','Weave closely past moving traffic cars for "Near-Miss" points','Score 8 clean near-misses and reach the sprint marker'],
    timeLimit:75},
  {key:'apexfinale',name:'King of Nexus City (Grand Finale)',icon:'👑',
    objective:'Conquer the ultimate 8-checkpoint championship circuit across the entire 3D city!',
    instructions:['The ultimate supreme championship test!','Pass all 8 major district checkpoints at top speed','Cross the Grand Golden Arch to become the Apex Champion!'],
    timeLimit:140},
];

// Fixed reference points derived from the procedural city — strictly excludes fuel stations
function missionLandmarks(){
  const pts=[];
  const seen=new Set();
  const isNearFuel=(x,z)=>{
    if(!W.fuelPts||!W.fuelPts.length)return false;
    for(const f of W.fuelPts){
      if(Math.hypot(x-f.x,z-f.z)<45)return true;
    }
    return false;
  };
  for(const s of W.parkSpots){
    const k=Math.round(s.x)+','+Math.round(s.z);
    if(!seen.has(k)&&!isNearFuel(s.x,s.z)&&pts.length<10){
      pts.push({x:s.x,z:s.z});
      seen.add(k);
    }
  }
  const R=Math.max(1,NAV_HALF-1);
  const nodeIdx=[...new Set([-R,-Math.round(R/2),0,Math.round(R/2),R])];
  nodeIdx.forEach(i=>nodeIdx.forEach(j=>{
    if(i===0&&j===0)return; // skip the very center (spawn area)
    const w=navNodeToWorld(i,j);
    const k=Math.round(w.x)+','+Math.round(w.z);
    if(!seen.has(k)&&!isNearFuel(w.x,w.z)){
      pts.push(w);
      seen.add(k);
    }
  }));
  return pts;
}
// A shuffled sample of n distinct landmarks — used to pick mission targets
// / checkpoints so repeat playthroughs don't always send players the same way.
function pickPoints(n){
  const arr=missionLandmarks();
  for(let i=arr.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[arr[i],arr[j]]=[arr[j],arr[i]];}
  return arr.slice(0,Math.min(n,arr.length));
}
// Guarantees at least one open parking spot exists — Missions 3 & 4 need a
// real target to drive to, and this keeps either mission from ever getting
// stuck waiting on a spot that never opens up.
function ensureFreeSpot(){
  let free=W.parkSpots.filter(s=>!s.occupied);
  if(!free.length&&W.parkSpots.length){
    const s=W.parkSpots[Math.floor(Math.random()*W.parkSpots.length)];
    s.occupied=false;free=[s];
  }
  return free;
}

/* ─── MISSION GRID RENDERING & LOCK PROGRESSION ────────────────── */
function renderMissionGrid(){
  const gridEl = document.querySelector('.mis-grid-4');
  if(!gridEl)return;
  
  const btnClasses = ['btn-green', 'btn-blue', 'btn-orange', 'btn-purple', 'btn-orange', 'btn-blue', 'btn-green', 'btn-purple', 'btn-orange', 'btn-purple'];
  
  gridEl.innerHTML = MISSIONS.map((m, i) => {
    const isUnlocked = i <= missionState.unlocked;
    const r = missionState.results[i];
    const btnCls = isUnlocked ? btnClasses[i % btnClasses.length] : 'btn-grey';
    const btnTxt = isUnlocked ? (r ? '★ REPLAY' : '▶ START') : '🔒 LOCKED';
    return `
      <div class="mis-card${isUnlocked ? '' : ' locked'}" id="mcard-${i+1}" data-mi="${i}">
        <div class="mcard-num">${i+1}</div>
        <div class="mcard-ttl">${m.name.toUpperCase()}</div>
        <div class="mcard-ico">${m.icon}</div>
        <div class="mcard-desc">${m.objective}</div>
        ${r ? `<div class="mcard-score">Score: <b>${r.score}</b> · ${r.perf}</div>` : ''}
        <div class="mcard-btn ${btnCls}">${btnTxt}</div>
      </div>
    `;
  }).join('');
  
  gridEl.querySelectorAll('.mis-card').forEach((card, i) => {
    const isUnlocked = i <= missionState.unlocked;
    card.onclick = () => {
      if(isUnlocked){
        document.getElementById('scr-mis-select').classList.remove('show');
        missionState.current = i;
        openBriefing(i);
      } else {
        toast(`🔒 Complete Mission ${i} first to unlock Mission ${i+1}!`);
      }
    };
  });
}

async function renderPlayOnMobileQR(){
  const pmobBox=document.getElementById('pmob-box');
  const pmobQr=document.getElementById('pmob-qr');
  if(!pmobBox||!pmobQr)return;
  pmobBox.style.display='flex';
  
  if(!RC.room){
    const addr=guessLanAddr();
    RC.start(addr);
  }
  
  let host=(location.hostname&&location.hostname!=='localhost'&&!location.hostname.startsWith('127.'))?location.hostname:(typeof REAL_LAN_IP!=='undefined'?REAL_LAN_IP:'10.227.214.119');
  try{
    const res=await fetch('/api/ip?t='+Date.now());
    if(res.ok){
      const d=await res.json();
      if(d&&d.ip&&d.ip!=='127.0.0.1')host=d.ip;
    }
  }catch(e){}
  
  const httpUrl=`http://${host}:8080`;
  const wsUrl=`ws://${host}:8080/ws`;
  const controllerUrl=`${httpUrl}/controller.html?room=${RC.room}&server=${encodeURIComponent(wsUrl)}`;
  
  const qr=qrcode(0,'M');
  qr.addData(controllerUrl);
  qr.make();
  pmobQr.innerHTML=qr.createSvgTag({cellSize:4,margin:2});
}

// Pulled out of the "mode-free" click handler so the exact same start-up
// logic can be triggered programmatically right after loading finishes
// (auto-start into Free Roam with zero taps), not just from a real click
// on the mode-select card. The mode-select screen itself is untouched and
// still reachable normally (e.g. "Back to Menu" from missions/game-over),
// this just skips waiting on it the very first time the page opens.
function startFreeRoam(){
  gameMode='free';
  // Free Mode must always start from a fully stationary, fully manual
  // car — reset speed/steer/gear/autopilot state and clear any input
  // that might still be "held" from before this screen (e.g. a
  // keyboard key or touch button pressed while on the menu), so the
  // car never inherits leftover motion or AI control from elsewhere.
  Car.reset();W.dest=null;W.ai.car=false;clearMissionProps();W.activeMission=null;
  Inp.keys={};Inp.throttle=0;Inp.brake=0;Inp.steer=0;Inp.hand=false;
  TouchCtl.throttle=0;TouchCtl.brake=0;TouchCtl.steer=0;TouchCtl.hand=false;
  document.getElementById('scr-mode').classList.remove('show');
  appState='driving';
  document.getElementById('hud').classList.add('show');
  document.getElementById('c').focus();
  toast('🏎️ Free Roam Mode Started!');
}

function wireModeSelect(){
  document.getElementById('mode-free').onclick=()=>startFreeRoam();
  
  document.getElementById('mode-mission').onclick=()=>{
    gameMode='mission';
    renderMissionGrid();
    document.getElementById('scr-mode').classList.remove('show');
    document.getElementById('scr-mis-select').classList.add('show');
  };
  
  const mpBtn=document.getElementById('mode-mp');
  if(mpBtn){
    mpBtn.onclick=()=>{
      document.getElementById('scr-mode').classList.remove('show');
      if(typeof openMPLobby==='function')openMPLobby();
    };
  }

  renderMissionGrid();
  renderPlayOnMobileQR();

  const backBtn=document.getElementById('mis-select-back');
  if(backBtn){
    backBtn.onclick=()=>{
      document.getElementById('scr-mis-select').classList.remove('show');
      document.getElementById('scr-mode').classList.add('show');
      renderPlayOnMobileQR();
    };
  }
}
// Full reset back to the very first screen — used by "Back to Menu" so an
// expo attendant can hand the wheel to the next visitor in one click.
function returnToModeSelect(){
  document.getElementById('scr-brief').classList.remove('show');
  document.getElementById('scr-mis-select').classList.remove('show');
  document.getElementById('scr-misend').classList.remove('show');
  document.getElementById('scr-campaign').classList.remove('show');
  document.getElementById('scr-gameover').classList.remove('show');
  document.getElementById('scr-mp-lobby').classList.remove('show');
  document.getElementById('scr-mp-result').classList.remove('show');
  document.getElementById('hud').classList.remove('show');
  document.getElementById('telem').classList.remove('show');
  document.getElementById('mis-hud').classList.remove('show');
  document.getElementById('ap-hud').classList.remove('show');
  renderPlayOnMobileQR();
  W.dest=null;clearMissionProps();W.activeMission=null;gameMode=null;
  Car.reset();
  if(typeof Aud!=='undefined'&&Aud.stopEngine)Aud.stopEngine();
  if(typeof resetMPRenderState==='function')resetMPRenderState();
  appState='modeselect';document.getElementById('scr-mode').classList.add('show');
}
// Car Value hit 0 — the vehicle is totaled and the run ends here.
// Freezes gameplay behind a dedicated Game Over screen with a clean
// restart (new vehicle, same mode) or a full reset to the menu.
function showGameOver(){
  appState='gameover';
  if(typeof Aud!=='undefined'&&Aud.stopEngine)Aud.stopEngine();
  clearMissionProps();W.activeMission=null;W.dest=null;Car.aiDriving=false;W.ai.car=false;Car.autoPark=null;
  document.getElementById('mis-hud').classList.remove('show');
  document.getElementById('ap-hud').classList.remove('show');
  document.getElementById('go-col').textContent=W.collisionCount-Car.collisionsAtReset;
  document.getElementById('go-time').textContent=Car.driveT.toFixed(0)+'s';
  document.getElementById('scr-gameover').classList.add('show');
}

