"use strict";
/* ─── HUD UPDATE ─────────────────────────────────────────────── */
let HEL=null;
function cacheHudEls(){
  HEL={};
  ['g-spd','spd-arc','g-unit','gearbox','g-rpm','b-lbl','b-pct','b-fill','rpm-fill','rpm-pct','cv-pct','cv-fill',
   'h-time','h-wx','h-dist','veh-ind',
   'tl-spd','tl-hdg','tl-fuel','tl-cv','tl-ai'].forEach(id=>HEL[id]=document.getElementById(id));
}
// memoized last-written values so we skip DOM writes (style/layout cost)
// whenever a HUD field hasn't actually changed since last frame — the
// gauges only visibly move a few times a second even though this runs
// every frame, so most frames were writing the exact same string/style
// right back over itself for no visual benefit, just wasted style recalc.
let HUDL=null;
function hset(key,el,prop,val){
  if(HUDL[key]===val)return;
  HUDL[key]=val;
  if(prop==='text')el.textContent=val;else el.style[prop]=val;
}
function updateHUD(){
  if(!adasInit){initADAS();initSensorHUD();}
  if(!HEL)cacheHudEls();
  if(!HUDL)HUDL={};
  const spd=Math.abs(Car.speed)*3.6;
  const maxS=220;
  hset('g-spd',HEL['g-spd'],'text',Math.round(spd));
  hset('spd-arc',HEL['spd-arc'],'strokeDashoffset',440-clamp(spd/maxS,0,1)*440);
  if(!HUDL.unitSet){HUDL.unitSet=1;HEL['g-unit'].textContent='KM/H';}
  // manual gear — set by the player with Digit1 (up) / Digit2 (down),
  // shown as 'R' whenever actually rolling backward regardless of gear
  const gear=Car.speed<-.1?'R':Car.gear;
  hset('gearbox',HEL['gearbox'],'text',gear);
  // RPM gauge — driven by the actual gearbox now: same road speed reads
  // very differently depending on which gear you're in, and it snaps to
  // the new reading the instant you shift (see gearRPMPct/GEAR_DATA).
  const rpm=gearRPMPct(Car.gear,Math.abs(Car.speed));
  const rpmLbl=rpm>92?'REDLINE':Math.abs(Car.speed)>.3?'DRIVE':'IDLE';
  hset('g-rpm',HEL['g-rpm'],'text',rpmLbl);
  // fuel bar
  const pct=Car.fuel;
  if(!HUDL.fuelLbl){HUDL.fuelLbl=1;HEL['b-lbl'].textContent='FUEL';}
  hset('b-pct',HEL['b-pct'],'text',Math.round(pct)+'%');
  hset('b-fillW',HEL['b-fill'],'width',pct+'%');
  hset('b-fillBg',HEL['b-fill'],'background',pct<18?'linear-gradient(90deg,#aa2020,#ff3344)':'linear-gradient(90deg,#a17c1a,#ff8a3d)');
  hset('rpm-fill',HEL['rpm-fill'],'width',rpm+'%');
  hset('rpm-pct',HEL['rpm-pct'],'text',rpmLbl);
  // car value — drops with every meaningful collision (see triggerImpact)
  hset('cv-pct',HEL['cv-pct'],'text',Math.round(Car.value)+'%');
  hset('cv-fillW',HEL['cv-fill'],'width',Car.value+'%');
  hset('cv-fillBg',HEL['cv-fill'],'background',Car.value<30?'linear-gradient(90deg,#aa2020,#ff3344)':Car.value<65?'linear-gradient(90deg,#a17c1a,#ff8a3d)':'linear-gradient(90deg,#17847a,#2ee6d6)');
  // secondary/telemetry info changes at most a few times a second (clock
  // ticks, weather, district crossing) — throttled alongside the minimap
  // instead of recomputed and rewritten to the DOM every single frame.
  minimapThrottle+=1;
  if(minimapThrottle>=4){
    minimapThrottle=0;
    hset('h-time',HEL['h-time'],'text',ftm(W.tod));
    const wxIcon={sunny:'☀',cloudy:'☁',rain:'🌧',fog:'🌫',night:'🌙'};
    hset('h-wx',HEL['h-wx'],'text',(wxIcon[W.wx]||'☀')+' '+W.wx[0].toUpperCase()+W.wx.slice(1));
    const di=((Car.pos.x+Car.pos.z)/62|0)%4;
    hset('h-dist',HEL['h-dist'],'text',['Central','Riverside','Uptown','Industrial'][((di%4)+4)%4]);
    if(!HUDL.vehInd){HUDL.vehInd=1;HEL['veh-ind'].textContent='🚗 CAR ACTIVE';}
    hset('tl-spd',HEL['tl-spd'],'text',Math.round(spd)+' kph');
    const hdgD=(Car.heading*180/Math.PI+360)%360;
    hset('tl-hdg',HEL['tl-hdg'],'text',['N','NE','E','SE','S','SW','W','NW'][Math.round(hdgD/45)%8]);
    hset('tl-fuel',HEL['tl-fuel'],'text',Math.round(Car.fuel)+'%');
    hset('tl-cv',HEL['tl-cv'],'text',Math.round(Car.value)+'%');
    hset('tl-ai',HEL['tl-ai'],'text',Car.aiDriving?'Car AI':'Manual');
    // minimap is a canvas redraw (many draw calls) — throttled to the
    // same ~15fps cadence, human eye can't tell the difference and it
    // meaningfully cuts per-frame cost
    drawMinimap();
  }
}

/* ─── MINIMAP ────────────────────────────────────────────────── */
let minimapThrottle=0,mmCv=null,mmCtx=null;
function drawMinimap(){
  if(!mmCv){mmCv=document.getElementById('mm-canvas');mmCtx=mmCv.getContext('2d');}
  const ctx=mmCtx,cv=mmCv;
  const S=172;ctx.clearRect(0,0,S,S);ctx.fillStyle='#030508';ctx.fillRect(0,0,S,S);
  const sc=S/260; // fixed ~260-unit field of view, independent of total city size
  ctx.save();ctx.translate(S/2,S/2);ctx.rotate(Car.heading-Math.PI);ctx.translate(-Car.pos.x*sc,-Car.pos.z*sc);
  // grid — matches the ACTUAL road count/positions (CFG.grid), not a fixed guess
  ctx.strokeStyle='rgba(46,230,214,.2)';ctx.lineWidth=.7;
  const half=CFG.grid>>1,roff=CFG.roadW/2*sc;
  for(let i=-half;i<=half;i++){const c=i*CFG.cell*sc-roff;ctx.beginPath();ctx.moveTo(c,-600);ctx.lineTo(c,600);ctx.stroke();ctx.beginPath();ctx.moveTo(-600,c);ctx.lineTo(600,c);ctx.stroke();}
  // fuel
  W.fuelPts.forEach(f=>{ctx.fillStyle='#ffcc00';ctx.beginPath();ctx.arc(f.x*sc,f.z*sc,3.5,0,7);ctx.fill();});
  // parking (avoid allocating a filtered array every frame — just skip occupied inline)
  ctx.fillStyle='#2ecc70';
  for(let i=0;i<W.parkSpots.length;i++){const s=W.parkSpots[i];if(!s.occupied)ctx.fillRect(s.x*sc-2,s.z*sc-2,4,4);}
  // destination road route on minimap
  if(W.dest){
    ctx.strokeStyle='rgba(0,229,255,.85)';ctx.lineWidth=2.2;
    ctx.beginPath();
    ctx.moveTo(Car.pos.x*sc,Car.pos.z*sc);
    if(W.currentRouteWps&&W.currentRouteWps.length>0){
      W.currentRouteWps.forEach(wp=>ctx.lineTo(wp.x*sc,wp.z*sc));
    } else {
      ctx.lineTo(W.dest.x*sc,W.dest.z*sc);
    }
    ctx.stroke();
    ctx.fillStyle='#ff3344';ctx.beginPath();ctx.arc(W.dest.x*sc,W.dest.z*sc,5,0,7);ctx.fill();
    ctx.strokeStyle='#fff';ctx.lineWidth=1.2;ctx.stroke();
  }
  // AI cars
  W.aiCars.forEach(ai=>{ctx.fillStyle='#ff8a3d';ctx.beginPath();ctx.arc(ai.mesh.position.x*sc,ai.mesh.position.z*sc,2.2,0,7);ctx.fill();});
  ctx.restore();
  // player triangle (fixed centre)
  ctx.fillStyle='#2ee6d6';ctx.beginPath();ctx.moveTo(S/2,S/2-8);ctx.lineTo(S/2-5,S/2+6);ctx.lineTo(S/2+5,S/2+6);ctx.closePath();ctx.fill();
  ctx.strokeStyle='rgba(46,230,214,.4)';ctx.lineWidth=1;ctx.stroke();
}

/* ─── FULL MAP ───────────────────────────────────────────────── */
let mapOpen=false,mapScale=.65,mapTrack='car';
function toggleMap(){mapOpen=!mapOpen;document.getElementById('map-modal').classList.toggle('show',mapOpen);if(mapOpen)drawFullMap();}
let mapCenterX=0,mapCenterZ=0;
function drawFullMap(){
  const cv=document.getElementById('map-canvas');const ctx=cv.getContext('2d');
  const W2=cv.width,H2=cv.height;ctx.clearRect(0,0,W2,H2);ctx.fillStyle='#04080e';ctx.fillRect(0,0,W2,H2);
  mapCenterX=Car.pos.x;
  mapCenterZ=Car.pos.z;
  const sc=(W2/(CFG.span+24))*mapScale,ox=W2/2,oz=H2/2;
  const tx=x=>ox+(x-mapCenterX)*sc,tz=z=>oz+(z-mapCenterZ)*sc;
  const h=CFG.grid>>1;
  // road fill + grid lines — c must match the ACTUAL road-center formula
  // used everywhere else (navNodeToWorld / lane markings): i*cell - roadW/2.
  // Previously this was just i*cell, which shifted every road on the map
  // by roadW/2 relative to where the road really is in the 3D world.
  ctx.fillStyle='rgba(34,36,42,.9)';
  for(let i=-h;i<=h;i++){
    const c=i*CFG.cell-CFG.roadW/2;
    ctx.fillRect(tx(-CFG.span/2),tz(c)-CFG.roadW/2*sc,CFG.span*sc,CFG.roadW*sc);
    ctx.fillRect(tx(c)-CFG.roadW/2*sc,tz(-CFG.span/2),CFG.roadW*sc,CFG.span*sc);
  }
  ctx.strokeStyle='rgba(46,230,214,.18)';ctx.lineWidth=.7;
  for(let i=-h;i<=h;i++){
    const c=i*CFG.cell-CFG.roadW/2;
    ctx.beginPath();ctx.moveTo(tx(-CFG.span/2),tz(c));ctx.lineTo(tx(CFG.span/2),tz(c));ctx.stroke();
    ctx.beginPath();ctx.moveTo(tx(c),tz(-CFG.span/2));ctx.lineTo(tx(c),tz(CFG.span/2));ctx.stroke();
  }
  // parking
  W.parkSpots.forEach(s=>{ctx.fillStyle=s.occupied?'rgba(46,204,112,.25)':'#2ecc70';ctx.fillRect(tx(s.x)-3,tz(s.z)-3,6,6);});
  // fuel
  W.fuelPts.forEach(f=>{ctx.fillStyle='#ffcc00';ctx.beginPath();ctx.arc(tx(f.x),tz(f.z),5.5,0,7);ctx.fill();ctx.fillStyle='#050a10';ctx.font='bold 9px sans-serif';ctx.textAlign='center';ctx.fillText('⛽',tx(f.x),tz(f.z)+3.5);});
  // destination + road route
  if(W.dest){
    ctx.strokeStyle='rgba(0,229,255,.9)';ctx.lineWidth=3;
    ctx.beginPath();
    ctx.moveTo(tx(Car.pos.x),tz(Car.pos.z));
    if(W.currentRouteWps&&W.currentRouteWps.length>0){
      W.currentRouteWps.forEach(wp=>ctx.lineTo(tx(wp.x),tz(wp.z)));
    } else {
      ctx.lineTo(tx(W.dest.x),tz(W.dest.z));
    }
    ctx.stroke();
    ctx.fillStyle='#ff3344';ctx.beginPath();ctx.arc(tx(W.dest.x),tz(W.dest.z),7,0,7);ctx.fill();
    ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();
    ctx.fillStyle='#fff';ctx.font='10px Rajdhani,sans-serif';ctx.textAlign='center';ctx.fillText('DEST',tx(W.dest.x),tz(W.dest.z)-10);
  }
  // AI
  W.aiCars.forEach(ai=>{ctx.fillStyle='rgba(255,138,61,.7)';ctx.beginPath();ctx.arc(tx(ai.mesh.position.x),tz(ai.mesh.position.z),3,0,7);ctx.fill();});
  // car
  ctx.save();ctx.translate(tx(Car.pos.x),tz(Car.pos.z));ctx.rotate(Math.PI-Car.heading);
  ctx.fillStyle='#2ee6d6';ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(-5.5,7);ctx.lineTo(5.5,7);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#fff';ctx.lineWidth=1.2;ctx.stroke();ctx.restore();
  // compass rose
  ctx.fillStyle='rgba(46,230,214,.6)';ctx.font='bold 11px Rajdhani,sans-serif';ctx.textAlign='center';
  ctx.fillText('N',ox,18);ctx.fillText('S',ox,H2-6);ctx.fillStyle='rgba(46,230,214,.3)';
  ctx.fillText('W',12,oz+4);ctx.fillText('E',W2-10,oz+4);
}
function initMapEvents(){
  const cv=document.getElementById('map-canvas');
  cv.addEventListener('click',e=>{
    const r=cv.getBoundingClientRect();
    const sx=(e.clientX-r.left)/r.width*cv.width,sz=(e.clientY-r.top)/r.height*cv.height;
    const sc=(cv.width/(CFG.span+24))*mapScale;
    const wx=(sx-cv.width/2)/sc+mapCenterX,wz=(sz-cv.height/2)/sc+mapCenterZ;
    W.dest={x:wx,z:wz};toast('📍 Destination set — tap map again to change');drawFullMap();
  });
  document.getElementById('map-x').onclick=()=>toggleMap();
  document.getElementById('mb-clr').onclick=()=>{W.dest=null;toast('Route cleared');drawFullMap();};
  document.getElementById('mb-park').onclick=()=>{toggleMap();Car.startAP();};
  document.getElementById('mb-fuel').onclick=()=>{toggleMap();Car.navToFuel();};
  document.getElementById('mz-in').onclick=()=>{mapScale=Math.min(mapScale+.2,3.2);drawFullMap();};
  document.getElementById('mz-out').onclick=()=>{mapScale=Math.max(mapScale-.22,.28);drawFullMap();};
  document.getElementById('mb-car').onclick=()=>{mapTrack='car';document.getElementById('mb-car').classList.add('on');drawFullMap();};
  document.getElementById('mm-wrap').addEventListener('click',()=>{if(appState==='driving')toggleMap();});
}

