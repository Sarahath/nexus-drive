"use strict";
/* ─── IMPACT PARTICLE FX ─────────────────────────────────────── */
// Lightweight point-sprite bursts used for collisions (debris/sparks for
// walls & cars, dust for pedestrians). Kept simple: one THREE.Points per
// burst, animated with plain gravity + drag, removed once faded out.
const FX=[];
function spawnImpactFX(pos,color=0xffcc55,count=16,spread=6,life=.65,size=.22){
  if(IS_MOBILE)count=Math.ceil(count*0.5); // fewer particles per burst on mobile GPUs
  if(!scene||!pos)return;
  const geo=new THREE.BufferGeometry();
  const positions=new Float32Array(count*3);
  const vel=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    positions[i*3]=pos.x;positions[i*3+1]=pos.y;positions[i*3+2]=pos.z;
    const a=Math.random()*Math.PI*2,el=Math.random()*Math.PI*.5;
    const sp=spread*(.35+Math.random()*.75);
    vel[i*3]=Math.cos(a)*Math.cos(el)*sp;
    vel[i*3+1]=Math.sin(el)*sp+2.5;
    vel[i*3+2]=Math.sin(a)*Math.cos(el)*sp;
  }
  geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const mat=new THREE.PointsMaterial({color,size,transparent:true,opacity:1,depthWrite:false,sizeAttenuation:true});
  const pts=new THREE.Points(geo,mat);
  scene.add(pts);
  FX.push({pts,vel,life,age:0,n:count});
}
function updateFX(dt){
  for(let i=FX.length-1;i>=0;i--){
    const f=FX[i];f.age+=dt;
    const arr=f.pts.geometry.attributes.position.array;
    for(let j=0;j<f.n;j++){
      f.vel[j*3+1]-=9*dt; // gravity
      arr[j*3]+=f.vel[j*3]*dt;
      arr[j*3+1]+=f.vel[j*3+1]*dt;
      arr[j*3+2]+=f.vel[j*3+2]*dt;
      if(arr[j*3+1]<0){arr[j*3+1]=0;f.vel[j*3]*=.55;f.vel[j*3+1]*=-.3;f.vel[j*3+2]*=.55;}
    }
    f.pts.geometry.attributes.position.needsUpdate=true;
    f.pts.material.opacity=Math.max(0,1-f.age/f.life);
    if(f.age>=f.life){scene.remove(f.pts);f.pts.geometry.dispose();f.pts.material.dispose();FX.splice(i,1);}
  }
}

/* ─── SKID MARKS ─────────────────────────────────────────────── */
// Flat semi-transparent decals dropped under the rear wheels while
// drifting. Capped at a max count (oldest removed first) to keep the
// scene from growing unbounded over a long play session.
const SKID_MARKS=[];
const skidGeo=new THREE.PlaneGeometry(.3,.62);
function layDownSkid(x,z,heading){
  if(!scene)return;
  const mat=new THREE.MeshBasicMaterial({color:0x0a0a0a,transparent:true,opacity:.4,depthWrite:false});
  const m=new THREE.Mesh(skidGeo,mat);
  m.rotation.x=-Math.PI/2;m.rotation.z=heading;
  m.position.set(x,.02,z);
  scene.add(m);
  SKID_MARKS.push(m);
  if(SKID_MARKS.length>(IS_MOBILE?120:260)){const old=SKID_MARKS.shift();scene.remove(old);old.material.dispose();}
}

/* ─── TRIGGER IMPACT COLLISION HANDLER ───────────────────────── */
function triggerImpact(speed, pos, kind){
  const spd = Math.abs(speed || 5);
  if (spd < 1.0) return;
  
  // Audio crash / hit
  if (typeof Aud !== 'undefined') {
    if (kind === 'ped' && Aud.pedHit) Aud.pedHit();
    else if (Aud.crash) Aud.crash(Math.min(1.0, spd / 18));
  }
  
  // Screen shake
  if (typeof shakeCam === 'function') {
    shakeCam(Math.min(1.2, spd / 14));
  }
  
  // Visual Particles & Sparks
  if (typeof spawnImpactFX === 'function' && pos) {
    if (kind === 'tree') {
      spawnImpactFX(pos, 0x4a8505, Math.floor(10 + spd * 1.5), 5.5, 0.7, 0.25); // Leafy bits
      spawnImpactFX(pos, 0x5a3d28, 8, 4.0, 0.6, 0.2); // Bark bits
    } else if (kind === 'ped') {
      spawnImpactFX(pos, 0xddccaa, 8, 3.5, 0.5, 0.2);
    } else if (kind === 'car') {
      spawnImpactFX(pos, 0xffaa22, Math.floor(14 + spd * 1.8), 7.0, 0.75, 0.24); // Metal sparks
      spawnImpactFX(pos, 0xffffff, 6, 8.0, 0.4, 0.2); // Bright sparks
    } else { // Wall / building / pole
      spawnImpactFX(pos, 0xffcc44, Math.floor(12 + spd * 1.5), 6.5, 0.7, 0.22);
    }
  }
}

