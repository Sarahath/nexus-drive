"use strict";
/* ─── WORLD UPDATE (lighting / weather / AI / sensors) ──────── */
function updateWorld(dt){
  Car.driveT+=dt;
  updateDestMarker(dt);
  // refuel: stop near a pump (slow, within range) and fuel refills over time.
  // Previously there was no way to ever refill — fuel only ever decreased.
  let nearPump=false;
  for(let i=0;i<W.fuelPts.length;i++){
    const f=W.fuelPts[i],dx=f.x-Car.pos.x,dz=f.z-Car.pos.z;
    if(dx*dx+dz*dz<64){nearPump=true;break;}
  }
  if(nearPump&&Math.abs(Car.speed)<2.5&&Car.fuel<100){
    const was=Car.fuel;
    Car.fuel=Math.min(100,Car.fuel+dt*22);
    if(was<100&&Car.fuel>=100)toast('⛽ Tank full!');
  }
  W.nearFuelPump=nearPump;
  const t=W.tod,sa=((t-6)/12)*Math.PI,sh=Math.sin(sa);
  const day=clamp(sh*1.6+.15,0,1);
  // sun follows car
  const px=Car.pos.x,pz=Car.pos.z;
  sunLight.position.set(px+Math.cos(sa)*76,Math.max(sh,.04)*84,pz+40);
  sunLight.target.position.set(px,0,pz);sunLight.target.updateMatrixWorld();
  const wxFactor=W.wx==='cloudy'?.52:W.wx==='rain'?.38:W.wx==='fog'?.48:W.wx==='night'?.05:1;
  sunLight.intensity=lerp(.05,2.6,day)*wxFactor;
  sunLight.color.setHSL(.11-day*.03,.65,lerp(.33,.62,day));
  ambLight.intensity=lerp(.14,.54,day);hemiLight.intensity=lerp(.09,.46,day);
  const sky=W.skyMesh;
  if(sky){
    _skyTop.lerpColors(_skyTopNight,_skyTopDay,day);
    _skyBot.lerpColors(_skyBotNight,_skyBotDay,day);
    if(W.wx==='cloudy'||W.wx==='fog'||W.wx==='night'){_skyTop.lerp(_skyGrey,.75);_skyBot.lerp(_skyGreyLight,.75);}
    sky.material.uniforms.top.value=_skyTop;sky.material.uniforms.bot.value=_skyBot;
    scene.fog.color.copy(_skyBot);renderer.setClearColor(_skyBot);
  }
  if(W.starsMesh)W.starsMesh.material.opacity=clamp(1-day*3,0,.88)*(W.wx==='fog'||W.wx==='cloudy'?.15:1);
  let fogD=.0032;if(W.wx==='fog')fogD=.015;else if(W.wx==='rain')fogD=.009;else if(W.wx==='cloudy')fogD=.006;else if(W.wx==='night')fogD=.004;
  scene.fog.density=fogD;
  // headlights
  if(Car.mesh?.userData.hlM){
    const on=W.headlights;
    Car.mesh.userData.hlM.emissiveIntensity=on?2.4:.4;
    Car.mesh.userData.hlLights?.forEach(l=>l.intensity=on?9:0);
  }
  // windows/lamps
  const wi=lerp(1.8,.1,day);W.winMats.forEach(m=>m.emissiveIntensity=wi);
  W.lampMats.forEach(m=>m.emissiveIntensity=lerp(2.2,.4,day));W.lampPts.forEach(l=>l.intensity=lerp(1.8,0,day));
  // rain
  W.rain.visible=W.wx==='rain';
  if(W.rain.visible){
    W.rain.position.set(px,0,pz);
    const rp=W.rain.geometry.attributes.position,rv=W.rain.userData.vel;
    for(let i=0;i<rp.count;i++){let y=rp.getY(i)-rv[i]*dt;if(y<0)y=rand(30,44);rp.setY(i,y);}
    rp.needsUpdate=true;
  }
  // traffic lights
  W.tlights.forEach(tl=>{
    tl.userData.timer-=dt;
    if(tl.userData.timer<=0){tl.userData.state=(tl.userData.state+1)%3;tl.userData.timer=tl.userData.state===1?1.8:5.5;}
    tl.userData.mats.forEach((m,i)=>m.emissiveIntensity=i===tl.userData.state?2.5:.08);
  });
  // AI traffic (reuse one scratch Vector3 instead of allocating per car per frame)
  W.aiCars.forEach(ai=>{
    if(ai.waitT>0){ai.waitT-=dt;return;}
    const tgt=ai.path[ai.idx];
    _scratchV.subVectors(tgt,ai.mesh.position);const d=_scratchV.length();
    if(d<.65){ai.idx=(ai.idx+1)%ai.path.length;ai.waitT=Math.random()<.1?.5:0;return;}
    _scratchV.normalize();
    // obey red/yellow signals: hold if a lit-red (or amber, about to go red)
    // light sits ahead. Look-ahead scales with speed so fast cars actually
    // see the light in time to stop instead of detecting it a frame after
    // they've already rolled through the stop line.
    const lookDist=clamp(ai.spd*1.1,4,10);
    const lookX=ai.mesh.position.x+_scratchV.x*lookDist,lookZ=ai.mesh.position.z+_scratchV.z*lookDist;
    let redAhead=false;
    for(const tl of W.tlights){
      if(tl.userData.state===2)continue; // 2 = green, go
      const tdx=tl.position.x-lookX,tdz=tl.position.z-lookZ;
      if(tdx*tdx+tdz*tdz<26){redAhead=true;break;} // ~5.1 unit catch radius
    }
    if(redAhead)return; // hold at the line until it turns green
    // belt-and-braces road guard: even though the loop waypoints are now
    // correctly anchored on-road, this stops a car dead rather than
    // clipping through anything unexpected (a building, another AI car,
    // a pedestrian) instead of trusting geometry alone — same principle
    // followRoadPath already uses for the player's AI-driven car.
    const nx=ai.mesh.position.x+_scratchV.x*ai.spd*dt,nz=ai.mesh.position.z+_scratchV.z*ai.spd*dt;
    if(hits(nx,nz,1.15)){ai.waitT=.2;return;}
    let carAhead=false;
    for(const other of W.aiCars){
      if(other===ai)continue;
      const odx=other.mesh.position.x-nx,odz=other.mesh.position.z-nz;
      if(odx*odx+odz*odz<3.2){carAhead=true;break;}
    }
    if(carAhead)return; // close the gap instead of rear-ending the car ahead
    ai.mesh.position.set(nx,ai.mesh.position.y,nz);
    ai.mesh.rotation.y=lerp(ai.mesh.rotation.y,Math.atan2(_scratchV.x,_scratchV.z),dt*5);
    // rotate wheels
    ai.mesh.userData.wheels?.forEach(w=>w.children[0].rotation.x+=ai.spd*dt*1.5);
  });
  // pedestrians (reuse one scratch Vector3 instead of allocating per ped per frame)
  W.peds.forEach(p=>{
    if(p.hitT>0){
      // knocked back: tumble through the air under gravity, then land
      p.hitVel.y-=16*dt;
      p.mesh.position.addScaledVector(p.hitVel,dt);
      if(p.mesh.position.y<0){p.mesh.position.y=0;p.hitVel.set(0,0,0);}
      p.mesh.rotation.x+=(p.spin||8)*dt;
      p.hitT-=dt;
      if(p.hitT<=0){p.hitT=0;p.downT=1.1+Math.random()*.5;}
      return;
    }
    if(p.downT>0){
      p.downT-=dt; // lying down, dazed, for a moment
      if(p.downT<=0){
        p.downT=0;p.mesh.position.copy(p.a);p.mesh.position.y=0;p.mesh.rotation.set(0,0,0);
        p.t=0;p.dir=1;
      }
      return;
    }
    // respect the traffic: hold at the kerb instead of stepping out if a
    // nearby light is red/amber (cross traffic has right of way) or a car
    // is close enough that walking now would put them in its path — same
    // "look, then go" rule real pedestrians follow.
    let mayWalk=true;
    for(const tl of W.tlights){
      if(tl.userData.state===2)continue; // 2 = green — safe to cross
      const tdx=tl.position.x-p.mesh.position.x,tdz=tl.position.z-p.mesh.position.z;
      if(tdx*tdx+tdz*tdz<64){mayWalk=false;break;} // ~8 unit awareness radius
    }
    if(mayWalk){
      for(const ai of W.aiCars){
        const cdx=ai.mesh.position.x-p.mesh.position.x,cdz=ai.mesh.position.z-p.mesh.position.z;
        if(cdx*cdx+cdz*cdz<20){mayWalk=false;break;} // a car is right next to the crossing
      }
    }
    if(mayWalk){
      const pcdx=Car.pos.x-p.mesh.position.x,pcdz=Car.pos.z-p.mesh.position.z;
      if(pcdx*pcdx+pcdz*pcdz<16&&Math.abs(Car.speed)>1.5)mayWalk=false; // player car bearing down
    }
    if(!mayWalk){
      const sw=Math.sin(performance.now()*.006)*.12; // idle shuffle, not a dead stop
      p.lL.rotation.x=sw;p.lR.rotation.x=-sw;
      return;
    }
    p.t=clamp(p.t+p.dir*p.spd*dt*.14,0,1);if(p.t>=1||p.t<=0)p.dir*=-1;
    p.mesh.position.lerpVectors(p.a,p.b,p.t);
    _scratchV.subVectors(p.b,p.a).normalize();if(p.dir<0)_scratchV.negate();
    p.mesh.rotation.y=Math.atan2(_scratchV.x,_scratchV.z);
    const sw=Math.sin(performance.now()*.0075*p.spd*7)*.5;p.lL.rotation.x=sw;p.lR.rotation.x=-sw;
  });
  updateFX(dt);
  // dynamic GPS pathfinding & turn directions
  if(typeof updateDynamicGPS==='function')updateDynamicGPS(dt);
  updateNav();
  if(W.activeMission)updateMission(dt);
}
const _scratchV=new THREE.Vector3();
const _skyTop=new THREE.Color(),_skyBot=new THREE.Color();
const _skyTopNight=new THREE.Color(.02,.04,.09),_skyTopDay=new THREE.Color(.16,.42,.70);
const _skyBotNight=new THREE.Color(.04,.07,.14),_skyBotDay=new THREE.Color(.78,.89,1);
const _skyGrey=new THREE.Color(.35,.40,.44),_skyGreyLight=new THREE.Color(.58,.62,.66);

/* ─── NAVIGATION ─────────────────────────────────────────────── */
let navHudEl=null,navArrEl=null,navDistEl=null;
function updateNav(){
  if(!navHudEl){navHudEl=document.getElementById('nav-hud');navArrEl=document.getElementById('nav-arr');navDistEl=document.getElementById('nav-dist');}
  if(!W.dest){navHudEl.classList.remove('show');return;}
  const dx=W.dest.x-Car.pos.x,dz=W.dest.z-Car.pos.z;const dist=Math.sqrt(dx*dx+dz*dz);
  if(dist<4.0){W.dest=null;toast('✅ Destination Reached!');navHudEl.classList.remove('show');return;}
  
  // Point towards the next road waypoint rather than cutting through buildings
  const target=(W.currentRouteWps&&W.currentRouteWps.length>0)?W.currentRouteWps[0]:W.dest;
  const tdx=target.x-Car.pos.x,tdz=target.z-Car.pos.z;
  const want=Math.atan2(tdx,tdz);const diff=((want-Car.heading)+Math.PI*3)%(Math.PI*2)-Math.PI;
  const arrow=diff>0.35?'↱':diff<-0.35?'↰':'↑';
  
  navHudEl.classList.add('show');
  navArrEl.textContent=arrow;
  navDistEl.textContent=dist>1000?`${(dist/1000).toFixed(1)} km`:`${dist.toFixed(0)} m`;
}

/* ─── ADAS STATUS ────────────────────────────────────────────── */
let adasInit=false;
const ADAS_DEF={acc:'ACC',aeb:'AEB',lka:'LKA',bsm:'BSM',tsr:'TSR'};
function initADAS(){
  const row=document.getElementById('adas-row');row.innerHTML='';
  Object.entries(ADAS_DEF).forEach(([k,lbl])=>{
    const el=document.createElement('div');el.className='ac ok';el.id='ac-'+k;el.textContent=lbl;row.appendChild(el);
  });adasInit=true;
}
function setADASWarn(k){const el=document.getElementById('ac-'+k);if(el){el.classList.remove('ok','off');el.classList.add('warn');setTimeout(()=>{el.classList.remove('warn');el.classList.add('ok');},1800);}}

/* ─── SENSOR HUD ─────────────────────────────────────────────── */
function initSensorHUD(){
  const el=document.getElementById('sensor-hud');
  ['Camera','LiDAR','Ultrasonic','GPS/GNSS','IMU'].forEach(s=>{
    const d=document.createElement('div');d.className='sens';
    d.innerHTML=`<div class="sens-dot on" id="sd-${s}"></div>${s}`;el.appendChild(d);
  });el.classList.add('show');
}

