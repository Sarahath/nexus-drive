"use strict";
/* ─── PLAY ON MOBILE (PC Mode only) ─────────────────────────────
   Shown only when this page is NOT running on a touch device. Encodes
   HOSTED_GAME_URL — the same public hosted URL the PC itself is
   running — so scanning it just re-opens this one game on the phone,
   which then detects itself as mobile and loads Mobile Mode. No
   separate page, no local server, no pairing required. */
function initPlayOnMobileQR(){
  if(IS_MOBILE)return; // phones don't need to see "scan to play on mobile"
  const box=document.getElementById('pmob-box');
  if(!box)return;
  const isLocal=/localhost|127\.0\.0\.1|^https?:\/\/192\.168\.|^https?:\/\/10\.|^https?:\/\/172\.(1[6-9]|2\d|3[01])\./i.test(HOSTED_GAME_URL);
  if(!HOSTED_GAME_URL||isLocal){
    document.getElementById('pmob-qr').innerHTML='';
    document.getElementById('pmob-sub').textContent='⚠ Set HOSTED_GAME_URL near the top of the script to your public deployed URL to enable this QR code.';
    box.style.display='block';
    return;
  }
  const qr=qrcode(0,'M');qr.addData(HOSTED_GAME_URL);qr.make();
  document.getElementById('pmob-qr').innerHTML=qr.createSvgTag({cellSize:4,margin:2});
  document.getElementById('pmob-sub').textContent='Scan with your phone to open this same game in Mobile Mode';
  box.style.display='block';
}

/* ─── MULTIPLAYER ────────────────────────────────────────────────
   Two phones pair over the same local server used by Phone Control
   (see phone-control/server.js). The kiosk hosts a room, generates
   one QR per player, and once both phones join it runs a 3-2-1-GO
   sprint down a straight, dedicated stretch of road — deliberately
   NOT the full open city — so nothing in the procedural world (a
   lamp post, a parked car, AI traffic) can ever block or crash the
   race mid-demo. Simple and predictable beats realistic here. */
let mpCamP1=null,mpCamP2=null,mpArchFinish=null;

function getDistantCityFinishPoint(){
  // Picks a far-off city intersection across the downtown grid ~240m-300m away
  const R=Math.max(1,NAV_HALF-1);
  const targetNode=navNodeToWorld(R,R);
  return { x:targetNode.x, z:targetNode.z };
}

function mkMPRacer(spawnOffsetX, spawnOffsetZ){
  return {
    mesh:null,
    spawnX:CFG.spawnX+spawnOffsetX,
    spawnZ:CFG.spawnZ+spawnOffsetZ,
    pos:new THREE.Vector3(CFG.spawnX+spawnOffsetX,0,CFG.spawnZ+spawnOffsetZ),
    heading:Math.PI/2,speed:0,
    input:{throttle:0,steer:0,brake:0,hand:false},
    finished:false,finishT:0,
    reset(){
      this.pos.set(this.spawnX,0,this.spawnZ);
      this.heading=Math.PI/2;this.speed=0;
      this.finished=false;this.finishT=0;
      this.input={throttle:0,steer:0,brake:0,hand:false};
    },
  };
}

function updateMPRacer(r,dt){
  const I=r.input;
  if(I.throttle>.01){ if(r.speed>=0)r.speed+=18*I.throttle*dt; else r.speed+=28*I.throttle*dt; }
  if(I.brake>.01){ if(r.speed>.18)r.speed-=34*I.brake*dt; else r.speed-=14*I.brake*dt; }
  if(I.throttle<.01&&I.brake<.01){const f=4.5*dt;if(Math.abs(r.speed)<f)r.speed=0;else r.speed-=Math.sign(r.speed)*f;}
  r.speed=clamp(r.speed,-12,52); // high performance sports car speed
  
  const turnScale=clamp(Math.abs(r.speed)/8.5,0,1);
  const driftMul=I.hand?2.7:1.0;
  const steerDir=(r.speed<0)?-1:1;
  r.heading+=I.steer*2.0*dt*(0.35+turnScale*0.65)*driftMul*steerDir;
  
  const dx=Math.sin(r.heading)*r.speed*dt,dz=Math.cos(r.heading)*r.speed*dt;
  const fwdX=Math.sin(r.heading),fwdZ=Math.cos(r.heading);
  const dirSign=r.speed>=0?1:-1;
  const noseLen=2.2,noseR=1.1;
  
  const halfSpan=CFG.span/2-8;
  const targetX=clamp(r.pos.x+dx,-halfSpan,halfSpan);
  const targetZ=clamp(r.pos.z+dz,-halfSpan,halfSpan);
  
  // Collision detection against city buildings, parked cars, boundaries
  const hitX=typeof hits==='function'?hits(targetX+fwdX*noseLen*dirSign,r.pos.z+fwdZ*noseLen*dirSign,noseR):false;
  if(!hitX){
    r.pos.x=targetX;
  } else {
    r.speed*=-0.25;
    if(typeof spawnImpactFX==='function')spawnImpactFX({x:r.pos.x+fwdX*1.5,y:0.75,z:r.pos.z+fwdZ*1.5},0xffaa33,22,6.5,0.7,0.28);
    if(typeof Aud!=='undefined'&&Aud.crash)Aud.crash();
  }
  
  const hitZ=typeof hits==='function'?hits(r.pos.x+fwdX*noseLen*dirSign,targetZ+fwdZ*noseLen*dirSign,noseR):false;
  if(!hitZ){
    r.pos.z=targetZ;
  } else {
    r.speed*=-0.25;
    if(typeof spawnImpactFX==='function')spawnImpactFX({x:r.pos.x+fwdX*1.5,y:0.75,z:r.pos.z+fwdZ*1.5},0xffaa33,22,6.5,0.7,0.28);
    if(typeof Aud!=='undefined'&&Aud.crash)Aud.crash();
  }
  
  if(r.mesh){
    r.mesh.position.copy(r.pos);
    r.mesh.rotation.y=r.heading;
  }
  
  if(!r.finished&&MP.dest){
    const distToFinish=Math.hypot(r.pos.x-MP.dest.x,r.pos.z-MP.dest.z);
    if(distToFinish<=9.5){
      r.finished=true;
      r.finishT=MP.raceClock;
    }
  }
}

function drawMPMinimap(){
  const cv=document.getElementById('mm-canvas');
  if(!cv)return;
  const ctx=cv.getContext('2d');
  const S=172;ctx.clearRect(0,0,S,S);ctx.fillStyle='#030508';ctx.fillRect(0,0,S,S);
  const sc=S/320;
  ctx.save();
  ctx.translate(S/2,S/2);
  
  // Draw city road grid
  ctx.strokeStyle='rgba(46,230,214,.22)';ctx.lineWidth=.8;
  const half=CFG.grid>>1,roff=CFG.roadW/2*sc;
  for(let i=-half;i<=half;i++){const c=i*CFG.cell*sc-roff;ctx.beginPath();ctx.moveTo(c,-600);ctx.lineTo(c,600);ctx.stroke();ctx.beginPath();ctx.moveTo(-600,c);ctx.lineTo(600,c);ctx.stroke();}
  
  // Draw Finish Destination Checkpoint with Glowing Badge
  if(MP.dest){
    const dx=MP.dest.x*sc,dz=MP.dest.z*sc;
    const pulse=6+Math.sin(performance.now()*.008)*2.5;
    ctx.strokeStyle='rgba(255,215,0,.8)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(dx,dz,pulse+4,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#ff3344';ctx.beginPath();ctx.arc(dx,dz,6,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ffd700';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText('🏁',dx,dz-10);
  }
  
  // Draw Player 1 (Red Supercar Blip)
  if(MP.racerP1){
    const p1x=MP.racerP1.pos.x*sc,p1z=MP.racerP1.pos.z*sc;
    ctx.save();ctx.translate(p1x,p1z);ctx.rotate(MP.racerP1.heading-Math.PI/2);
    ctx.fillStyle='#ff2233';ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(-4,5);ctx.lineTo(4,5);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.stroke();
    ctx.restore();
    ctx.fillStyle='#ff2233';ctx.font='bold 9px sans-serif';ctx.fillText('P1',p1x,p1z+12);
  }
  
  // Draw Player 2 (Blue Supercar Blip)
  if(MP.racerP2){
    const p2x=MP.racerP2.pos.x*sc,p2z=MP.racerP2.pos.z*sc;
    ctx.save();ctx.translate(p2x,p2z);ctx.rotate(MP.racerP2.heading-Math.PI/2);
    ctx.fillStyle='#1e69d2';ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(-4,5);ctx.lineTo(4,5);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.stroke();
    ctx.restore();
    ctx.fillStyle='#1e69d2';ctx.font='bold 9px sans-serif';ctx.fillText('P2',p2x,p2z+12);
  }
  
  ctx.restore();
}

function mkMPCam(){return new THREE.PerspectiveCamera(55,1,.1,350);}
function updateMPCam(cam,r){
  const back=7.8,height=2.4;
  cam.position.set(r.pos.x-Math.sin(r.heading)*back,height,r.pos.z-Math.cos(r.heading)*back);
  cam.lookAt(r.pos.x+Math.sin(r.heading)*5,1.2,r.pos.z+Math.cos(r.heading)*5);
}

function renderMPSplit(){
  const w=innerWidth,h=innerHeight,halfH=Math.floor(h/2);
  renderer.setScissorTest(true);
  
  // Top Half: Player 1 (Red Car)
  renderer.setViewport(0,h-halfH,w,halfH);renderer.setScissor(0,h-halfH,w,halfH);
  mpCamP1.aspect=w/halfH;mpCamP1.updateProjectionMatrix();
  renderer.render(scene,mpCamP1);
  
  // Bottom Half: Player 2 (Blue Car)
  renderer.setViewport(0,0,w,h-halfH);renderer.setScissor(0,0,w,h-halfH);
  mpCamP2.aspect=w/(h-halfH);mpCamP2.updateProjectionMatrix();
  renderer.render(scene,mpCamP2);
  
  renderer.setScissorTest(false);renderer.setViewport(0,0,w,h);
}

function resetMPRenderState(){
  if(!renderer)return;
  renderer.setScissorTest(false);
  renderer.setViewport(0,0,innerWidth,innerHeight);
}

let REAL_LAN_IP='10.227.214.119';

async function fetchLanIp(){
  try{
    const res=await fetch('/api/ip?t='+Date.now());
    if(res.ok){
      const d=await res.json();
      if(d&&d.ip&&d.ip!=='127.0.0.1')REAL_LAN_IP=d.ip;
    }
  }catch(e){}
}

function mpSetStatus(role, msg, cls){
  const el=document.getElementById('mp-status-'+role);
  if(el){
    el.textContent=msg;
    el.className='mp-status'+(cls?' '+cls:'');
  }
}

async function renderMPLobbyQR(){
  await fetchLanIp();
  const host=(location.hostname&&location.hostname!=='localhost'&&!location.hostname.startsWith('127.'))?location.hostname:REAL_LAN_IP;
  const httpUrl=`http://${host}:8080`;
  const wsUrl=`ws://${host}:8080/ws`;
  
  ['p1','p2'].forEach(role=>{
    try{
      const url=`${httpUrl}/m_race.html?room=${MP.room}&role=${role}&server=${encodeURIComponent(wsUrl)}`;
      const qr=qrcode(0,'M');
      qr.addData(url);
      qr.make();
      const qrEl=document.getElementById('mp-qr-'+role);
      if(qrEl)qrEl.innerHTML=qr.createSvgTag({cellSize:4,margin:2});
      mpSetStatus(role,`Connect to Wi-Fi & Scan QR (${host})`,'');
    }catch(e){
      console.error('Error rendering QR for', role, e);
    }
  });
}

const MP={
  ws:null,url:null,room:null,phase:'idle', // idle|lobby|countdown|racing|finished
  p1Connected:false,p2Connected:false,
  racerP1:null,racerP2:null,winner:null,raceClock:0,dest:null,
  countdownN:3,_cdTimer:null,reconnectTimer:null,

  genRoom(){return String(Math.floor(1000+Math.random()*9000));},
  async openLobby(serverUrl){
    await fetchLanIp();
    const proto=location.protocol==='https:'?'wss:':'ws:';
    const hostPort=location.host||'localhost:8080';
    this.url=`${proto}//${hostPort}/ws`;
    this.room=this.genRoom();
    this.p1Connected=false;this.p2Connected=false;this.phase='lobby';
    renderMPLobbyQR();
    this._connect();
  },
  _connect(){
    try{
      this.ws=new WebSocket(this.url);
      this.ws.onopen=()=>{
        this.ws.send(JSON.stringify({type:'mp-register',room:this.room}));
        mpSetStatus('p1',PUBLIC_TUNNEL_URL?'🌐 Public 4G/5G Ready — Scan QR':'Waiting for Player 1…','');
        mpSetStatus('p2',PUBLIC_TUNNEL_URL?'🌐 Public 4G/5G Ready — Scan QR':'Waiting for Player 2…','');
      };
      this.ws.onclose=()=>{
        if(this.phase==='idle')return;
        mpSetStatus('p1','Server connection lost — retrying…','err');
        mpSetStatus('p2','Server connection lost — retrying…','err');
        this.reconnectTimer=setTimeout(()=>this._connect(),2500);
      };
      this.ws.onerror=()=>{
        mpSetStatus('p1',HAS_PUBLIC_RELAY?'Could not reach the relay server — check your internet connection':'Could not reach server — check address & Wi-Fi','err');
        mpSetStatus('p2',HAS_PUBLIC_RELAY?'Could not reach the relay server — check your internet connection':'Could not reach server — check address & Wi-Fi','err');
      };
      this.ws.onmessage=ev=>{
        let d;try{d=JSON.parse(ev.data);}catch(e){return;}
        if(d.type==='mp-registered'){
          renderMPLobbyQR();
        } else if(d.type==='mp-player-joined'){
          if(d.role==='p1'){this.p1Connected=true;mpSetStatus('p1','Connected ✓','ok');}
          else{this.p2Connected=true;mpSetStatus('p2','Connected ✓','ok');}
          toast((d.role==='p1'?'🔴 Player 1 (Red Car)':'🔵 Player 2 (Blue Car)')+' connected!');
          if(this.p1Connected&&this.p2Connected)startMPCountdown();
        } else if(d.type==='mp-player-left'){
          if(d.role==='p1'){this.p1Connected=false;mpSetStatus('p1','Disconnected — waiting…','err');}
          else{this.p2Connected=false;mpSetStatus('p2','Disconnected — waiting…','err');}
          if(this.phase==='countdown'||this.phase==='racing')returnToMPLobbyScreen();
        } else if(d.type==='mp-input'){
          const t=d.role==='p1'?this.racerP1:this.racerP2;
          if(t){
            t.input.throttle=clamp(d.throttle||0,0,1);
            t.input.steer=clamp(d.steer||0,-1,1);
            t.input.brake=clamp(d.brake||0,0,1);
            t.input.hand=!!d.hand;
            if(d.action==='horn'&&typeof Aud!=='undefined')Aud.honk();
            else if(d.action==='recover')t.reset();
          }
        } else if(d.type==='mp-pos'){
          const t=d.role==='p1'?this.racerP1:this.racerP2;
          if(t){
            t.pos.x=d.x;t.pos.z=d.z;t.heading=d.heading;t.speed=d.speed;
          }
        } else if(d.type==='mp-finish'){
          onMPRacerFinish(d.role);
        }
      };
    }catch(e){ mpSetStatus('p1','Invalid server address','err'); }
  },
  send(obj){ if(this.ws&&this.ws.readyState===1)this.ws.send(JSON.stringify(obj)); },
  close(){
    this.phase='idle';
    if(this.reconnectTimer){clearTimeout(this.reconnectTimer);this.reconnectTimer=null;}
    if(this._cdTimer){clearInterval(this._cdTimer);this._cdTimer=null;}
    this.ws?.close();this.ws=null;
    if(typeof Aud!=='undefined'&&Aud.stopEngine)Aud.stopEngine();
  },
};

function setupMPRaceWorld(){
  MP.dest=getDistantCityFinishPoint();
  W.dest={x:MP.dest.x,z:MP.dest.z};

  if(!MP.racerP1){
    MP.racerP1=mkMPRacer(-3.5, 0);
    MP.racerP2=mkMPRacer(3.5, 0);
    MP.racerP1.mesh=mkCar(0xee2233);scene.add(MP.racerP1.mesh); // Red Sports Supercar
    MP.racerP2.mesh=mkCar(0x1e69d2);scene.add(MP.racerP2.mesh); // Blue Sports Supercar
    mpCamP1=mkMPCam();mpCamP2=mkMPCam();

    // 3D Finish Archway at the distant destination
    if(typeof mkFinishArch==='function'){
      mpArchFinish=mkFinishArch({x:MP.dest.x,z:MP.dest.z});
      scene.add(mpArchFinish);
    }
  }
  
  if(mpArchFinish)mpArchFinish.position.set(MP.dest.x,0,MP.dest.z);
  MP.racerP1.reset();MP.racerP2.reset();
  MP.racerP1.mesh.visible=true;MP.racerP2.mesh.visible=true;
  MP.racerP1.mesh.position.copy(MP.racerP1.pos);MP.racerP1.mesh.rotation.y=MP.racerP1.heading;
  MP.racerP2.mesh.position.copy(MP.racerP2.pos);MP.racerP2.mesh.rotation.y=MP.racerP2.heading;
  updateMPCam(mpCamP1,MP.racerP1);updateMPCam(mpCamP2,MP.racerP2);
}

function startMPCountdown(){
  MP.phase='countdown';
  document.getElementById('scr-mp-lobby').classList.remove('show');
  setupMPRaceWorld();
  appState='mp-race';
  document.getElementById('hud').classList.add('show');
  document.getElementById('mp-lbl-p1').style.display='block';
  document.getElementById('mp-lbl-p2').style.display='block';
  document.getElementById('mp-split-div').style.display='block';
  MP.countdownN=3;
  const ov=document.getElementById('mp-countdown-ov'),num=document.getElementById('mp-countdown-num');
  ov.classList.add('show');num.classList.remove('go');num.textContent=MP.countdownN;
  MP.send({type:'mp-state',state:'countdown',count:MP.countdownN});
  if(MP._cdTimer)clearInterval(MP._cdTimer);
  MP._cdTimer=setInterval(()=>{
    MP.countdownN--;
    if(MP.countdownN>0){
      num.textContent=MP.countdownN;
      MP.send({type:'mp-state',state:'countdown',count:MP.countdownN});
    } else {
      num.textContent='GO!';num.classList.add('go');
      MP.send({type:'mp-state',state:'countdown',count:0});
      clearInterval(MP._cdTimer);MP._cdTimer=null;
      setTimeout(()=>{
        ov.classList.remove('show');
        MP.phase='racing';MP.raceClock=0;
        MP.send({type:'mp-state',state:'go'});
      },650);
    }
  },900);
}

function updateMPRace(dt){
  if(MP.phase!=='racing')return;
  MP.raceClock+=dt;
  updateMPRacer(MP.racerP1,dt);updateMPRacer(MP.racerP2,dt);
  
  // Car-to-Car collision resolution between P1 and P2
  const carDist=Math.hypot(MP.racerP1.pos.x-MP.racerP2.pos.x,MP.racerP1.pos.z-MP.racerP2.pos.z);
  if(carDist<3.2&&carDist>0.01){
    const pushX=(MP.racerP1.pos.x-MP.racerP2.pos.x)/carDist;
    const pushZ=(MP.racerP1.pos.z-MP.racerP2.pos.z)/carDist;
    MP.racerP1.pos.x+=pushX*0.8;MP.racerP1.pos.z+=pushZ*0.8;
    MP.racerP2.pos.x-=pushX*0.8;MP.racerP2.pos.z-=pushZ*0.8;
    MP.racerP1.speed*=-0.3;MP.racerP2.speed*=-0.3;
    if(typeof spawnImpactFX==='function')spawnImpactFX({x:(MP.racerP1.pos.x+MP.racerP2.pos.x)/2,y:0.8,z:(MP.racerP1.pos.z+MP.racerP2.pos.z)/2},0xffcc44,28,8,0.8,0.32);
    if(typeof Aud!=='undefined'&&Aud.crash)Aud.crash();
  }

  updateMPCam(mpCamP1,MP.racerP1);updateMPCam(mpCamP2,MP.racerP2);
  
  // Redraw Multiplayer Minimap
  drawMPMinimap();
  
  // Dual-Car Racing Engine Sound
  if(typeof Aud!=='undefined'&&Aud.updateMP){
    Aud.updateMP(MP.racerP1.speed*3.6,MP.racerP1.input.throttle,MP.racerP2.speed*3.6,MP.racerP2.input.throttle);
  }

  // Broadcast live speed and telemetry to each player's mobile gamepad
  if(MP.ws&&MP.ws.readyState===1&&Math.random()<0.35){
    MP.send({type:'telemetry',role:'p1',speed:Math.abs(MP.racerP1.speed)*3.6});
    MP.send({type:'telemetry',role:'p2',speed:Math.abs(MP.racerP2.speed)*3.6});
  }

  // Update Split-screen HUD labels with Speed and Distance to Finish
  const d1=MP.dest?Math.round(Math.hypot(MP.racerP1.pos.x-MP.dest.x,MP.racerP1.pos.z-MP.dest.z)):0;
  const d2=MP.dest?Math.round(Math.hypot(MP.racerP2.pos.x-MP.dest.x,MP.racerP2.pos.z-MP.dest.z)):0;
  
  const l1=document.getElementById('mp-lbl-p1');
  const l2=document.getElementById('mp-lbl-p2');
  if(l1)l1.textContent=`🔴 P1 (RED CAR): ${Math.round(Math.abs(MP.racerP1.speed)*3.6)} KM/H · 🏁 Finish: ${d1}m`;
  if(l2)l2.textContent=`🔵 P2 (BLUE CAR): ${Math.round(Math.abs(MP.racerP2.speed)*3.6)} KM/H · 🏁 Finish: ${d2}m`;

  if(MP.racerP1.finished||MP.racerP2.finished){
    const winner=(MP.racerP1.finished&&(!MP.racerP2.finished||MP.racerP1.finishT<=MP.racerP2.finishT))?'p1':'p2';
    MP.phase='finished';MP.winner=winner;
    MP.send({type:'mp-state',state:'finished',winner});
    showMPResult(winner);
  }
}
function showMPResult(winner){
  if(typeof Aud!=='undefined'&&Aud.stopEngine)Aud.stopEngine();
  document.getElementById('mp-lbl-p1').style.display='none';
  document.getElementById('mp-lbl-p2').style.display='none';
  document.getElementById('mp-split-div').style.display='none';
  const ttl=document.getElementById('mp-result-ttl');
  const winnerName=winner==='p1'?'PLAYER 1 (RED CAR)':'PLAYER 2 (BLUE CAR)';
  ttl.textContent=`🏆 ${winnerName} WINS!`;
  ttl.className=winner;
  document.getElementById('scr-mp-result').classList.add('show');
  if(typeof spawnImpactFX==='function'){
    spawnImpactFX({x:Car.pos.x,y:2,z:Car.pos.z},0xffcc00,40,12,1.2,0.4);
  }
  toast(`🏆 ${winnerName} WINS THE RACE!`);
}
function returnToMPLobbyScreen(){
  document.getElementById('scr-mp-result').classList.remove('show');
  document.getElementById('mp-countdown-ov').classList.remove('show');
  document.getElementById('mp-lbl-p1').style.display='none';
  document.getElementById('mp-lbl-p2').style.display='none';
  document.getElementById('mp-split-div').style.display='none';
  if(MP._cdTimer){clearInterval(MP._cdTimer);MP._cdTimer=null;}
  resetMPRenderState();
  document.getElementById('mp-precheck').style.display='none';
  document.getElementById('mp-live').style.display='block';
  document.getElementById('scr-mp-lobby').classList.add('show');
  appState='mp-lobby';
  toast('⚠️ A player disconnected — waiting to reconnect…');
}
function exitMultiplayer(){
  MP.close();
  document.getElementById('scr-mp-lobby').classList.remove('show');
  document.getElementById('scr-mp-result').classList.remove('show');
  document.getElementById('mp-countdown-ov').classList.remove('show');
  document.getElementById('mp-lbl-p1').style.display='none';
  document.getElementById('mp-lbl-p2').style.display='none';
  document.getElementById('mp-split-div').style.display='none';
  if(MP.racerP1)MP.racerP1.mesh.visible=false;
  if(MP.racerP2)MP.racerP2.mesh.visible=false;
  resetMPRenderState();
  appState='modeselect';
  document.getElementById('scr-mode').classList.add('show');
}
function openMPLobby(){
  document.getElementById('scr-mode').classList.remove('show');
  document.getElementById('scr-mp-lobby').classList.add('show');
  appState='mp-lobby';
  document.getElementById('mp-precheck').style.display='none';
  document.getElementById('mp-live').style.display='block';
  MP.openLobby(guessLanAddr());
}

function wireMultiplayer(){
  const mpBtn=document.getElementById('mode-mp');
  if(mpBtn)mpBtn.onclick=()=>openMPLobby();
  const pbBack=document.getElementById('mp-precheck-back');
  if(pbBack)pbBack.onclick=()=>{
    MP.close();
    document.getElementById('scr-mp-lobby').classList.remove('show');
    appState='modeselect';document.getElementById('scr-mode').classList.add('show');
  };
  const cBtn=document.getElementById('mp-cancel');
  if(cBtn)cBtn.onclick=()=>exitMultiplayer();
  const aBtn=document.getElementById('mp-again');
  if(aBtn)aBtn.onclick=()=>restartMPRace();
  const mBtn=document.getElementById('mp-menu');
  if(mBtn)mBtn.onclick=()=>exitMultiplayer();
}

