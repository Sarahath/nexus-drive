"use strict";
/* ─── CAMERA ─────────────────────────────────────────────────── */
let camSmP=new THREE.Vector3(),camSmL=new THREE.Vector3(),camFreeA=0;
let camShakeT=0,camShakeMag=0,hitFlashEl=null,lastImpactAt=-99;
const IMPACT_FX_KIND={
  wall:{color:0xaaaaaa,count:14,spread:5,life:.55,size:.2},
  car:{color:0xffb020,count:22,spread:7.5,life:.7,size:.24},
  ped:{color:0xffffff,count:12,spread:4.5,life:.55,size:.16},
  pole:{color:0xffdd66,count:16,spread:3.2,life:.4,size:.15},
};
function triggerImpact(speedAtImpact,pos=null,kind='wall'){
  const intensity=Math.min(46,Math.abs(speedAtImpact));
  if(intensity<3)return; // ignore trivial nudges/grazes
  const now=performance.now();
  if(now-lastImpactAt<180)return; // avoid spamming while scraping along a wall
  lastImpactAt=now;
  if(intensity>8)W.collisionCount++; // meaningful hit — counted for mission scoring/penalties
  // screen flash
  if(!hitFlashEl)hitFlashEl=document.getElementById('hit-flash');
  hitFlashEl.style.opacity=Math.min(.85,.25+intensity*.018);
  hitFlashEl.classList.add('show');
  setTimeout(()=>hitFlashEl.classList.remove('show'),60);
  // camera shake — cars/peds hit harder-feeling than a plain wall scrape
  const kMag=kind==='car'?1.25:kind==='ped'?1.1:1;
  camShakeMag=Math.min(1.1,intensity*.045*kMag);
  camShakeT=Math.min(.55,.12+intensity*.011*kMag);
  // particle burst at the point of contact
  if(pos){const fx=IMPACT_FX_KIND[kind]||IMPACT_FX_KIND.wall;spawnImpactFX(pos,fx.color,fx.count,fx.spread*(.5+intensity/46),fx.life,fx.size);}
  // sound
  Aud.crash(intensity*(kind==='car'?1.15:1));
  // damage feedback — every real hit knocks some value off the vehicle
  if(intensity>8){
    Car.value=clamp(Car.value-intensity*0.6,0,100);
    if(kind==='ped')toast('🚸 Pedestrian knocked back!');
    else if(kind==='car')toast(intensity>22?'💥 Heavy Vehicle Collision!':'🚗💢 Vehicle Collision');
    else if(kind==='pole')toast('💡 Hit a pole!');
    else toast(intensity>22?'💥 Heavy Impact!':'💢 Collision');
    if(Car.value<=0&&appState==='driving')showGameOver();
  }
}
function mkDriveCam(){driveCam=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,300);}
function updateCam(dt){
  if(!driveCam)return;
  if(camShakeT>0){camShakeT=Math.max(0,camShakeT-dt);}
  const p=Car.pos;
  const h=Car.heading;
  const modeKey=camMode;
  if(modeKey==='third'){
    const back=new THREE.Vector3(Math.sin(h),0,Math.cos(h)).multiplyScalar(-7.2);
    const want=p.clone().add(back);want.y=2.1; // Low-slung sports car angle
    const posT=1-Math.pow(.0000015,dt);
    camSmP.lerp(want,posT);
    const look=p.clone().addScaledVector(new THREE.Vector3(Math.sin(h),0,Math.cos(h)),4.5);
    look.y=1.1; // Look forward along the highway road
    const lookT=1-Math.pow(.0002,dt);
    camSmL.lerp(look,lookT);
    
    const toCam=camSmP.clone().sub(p);toCam.y=0;
    const minDist=4.8,dLen=toCam.length();
    if(dLen<minDist){
      const dir=dLen>0.001?toCam.multiplyScalar(1/dLen):new THREE.Vector3(-Math.sin(h),0,-Math.cos(h));
      camSmP.x=p.x+dir.x*minDist;camSmP.z=p.z+dir.z*minDist;
    }
    driveCam.position.copy(camSmP);driveCam.lookAt(camSmL);
    driveCam.fov=lerp(driveCam.fov,54+clamp(Math.abs(Car.speed)*.42,0,18),dt*4);
    driveCam.updateProjectionMatrix();
  } else if(modeKey==='cockpit'){
    const fwd=new THREE.Vector3(Math.sin(h),0,Math.cos(h));
    const cp=p.clone().addScaledVector(fwd,.12);cp.y=1.08;
    driveCam.position.lerp(cp,1-Math.pow(.0001,dt));driveCam.lookAt(cp.clone().addScaledVector(fwd,5.5));
  } else if(modeKey==='hood'){
    const fwd=new THREE.Vector3(Math.sin(h),0,Math.cos(h));
    const hp=p.clone().addScaledVector(fwd,1.9);hp.y=.85;
    driveCam.position.lerp(hp,1-Math.pow(.0001,dt));driveCam.lookAt(hp.clone().addScaledVector(fwd,7).add(new THREE.Vector3(0,-.05,0)));
  } else if(modeKey==='free'){
    camFreeA+=dt*.13;
    const fp=new THREE.Vector3(p.x+Math.sin(camFreeA)*22,15,p.z+Math.cos(camFreeA)*22);
    driveCam.position.lerp(fp,1-Math.pow(.002,dt));driveCam.lookAt(p.x,.8,p.z);
  }
  // impact shake: decaying random jitter on top of whatever the mode set
  if(camShakeT>0){
    const k=camShakeMag*(camShakeT/.5);
    driveCam.position.x+=(Math.random()*2-1)*k;
    driveCam.position.y+=(Math.random()*2-1)*k*.6;
    driveCam.position.z+=(Math.random()*2-1)*k;
  }
}
const CAM_MODES=['third','cockpit','hood','free'];
const CAM_LABELS={third:'THIRD PERSON',cockpit:'COCKPIT',hood:'HOOD CAM',free:'FREE CAM'};
function cycleCam(){camMode=CAM_MODES[(CAM_MODES.indexOf(camMode)+1)%CAM_MODES.length];document.getElementById('cam-lbl').textContent=CAM_LABELS[camMode];syncPauseSeg('seg-cam','c',camMode);}

