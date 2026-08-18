"use strict";
/* ─── CITY BUILDER ──────────────────────────────────────────── */
function addCol(x,z,sx,sz,pad=.65,kind='wall'){W.colliders.push({x1:x-sx/2-pad,x2:x+sx/2+pad,z1:z-sz/2-pad,z2:z+sz/2+pad,kind});}
function hits(x,z,r=1.05){
  if(W.activeMission&&W.activeMission.box){
    if(Math.hypot(x-W.activeMission.box.x,z-W.activeMission.box.z)<7.5)return null;
  }
  if(W.parkSpots){
    for(const s of W.parkSpots){
      if(!s.occupied&&Math.hypot(x-s.x,z-s.z)<3.4)return null;
    }
  }
  for(const c of W.colliders)if(x+r>c.x1&&x-r<c.x2&&z+r>c.z1&&z-r<c.z2)return c;
  return null;
}

function mkBuilding(x,z,fp){
  const w=fp*rand(.72,1),d=fp*rand(.72,1),h=rand(7,55)*(Math.random()<.1?1.8:1);
  const g=new THREE.Group();
  const bM=new THREE.MeshLambertMaterial({color:new THREE.Color().setHSL(rand(.55,.65),.08,rand(.23,.44)),roughness:.86,metalness:.04});
  const wM=new THREE.MeshLambertMaterial({map:T.win,color:0xffffff,metalness:.28,roughness:.6,emissive:0xffcc88,emissiveMap:T.win,emissiveIntensity:.16});
  W.winMats.push(wM);
  const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),bM);b.position.y=h/2;b.castShadow=true;b.receiveShadow=true;
  const gl=new THREE.Mesh(new THREE.BoxGeometry(w*1.001,h*.97,d*1.001),wM);gl.position.y=h/2;
  g.add(b,gl);g.position.set(x,0,z);addCol(x,z,w,d);
  return g;
}
function mkTree(x,z){
  const g=new THREE.Group();
  const trM=new THREE.MeshLambertMaterial({color:0x4a3627,roughness:1});
  const lM=new THREE.MeshLambertMaterial({color:new THREE.Color().setHSL(.32,.45,rand(.27,.4)),roughness:.9});
  const tr=new THREE.Mesh(new THREE.CylinderGeometry(.14,.19,1.6,7),trM);tr.position.y=.8;tr.castShadow=false;
  const lv=new THREE.Mesh(new THREE.SphereGeometry(1.1,8,7),lM);lv.position.y=2;lv.scale.y=1.2;lv.castShadow=true;
  g.add(tr,lv);g.position.set(x,0,z);
  addCol(x,z,.7,.7,.3,'tree');
  return g;
}
function mkLamp(x,z,ry=0,realPt=false){
  const g=new THREE.Group();
  const pM=new THREE.MeshLambertMaterial({color:0x282c30,metalness:.6,roughness:.4});
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.055,.075,4.2,6),pM);pole.position.y=2.1;pole.castShadow=false;
  const arm=new THREE.Mesh(new THREE.BoxGeometry(1.05,.06,.06),pM);arm.position.set(.5,4.2,0);
  const bM=new THREE.MeshLambertMaterial({color:0xfff5cc,emissive:0xfff5cc,emissiveIntensity:1.5});W.lampMats.push(bM);
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(.13,6,6),bM);bulb.position.set(.98,4.07,0);
  g.add(pole,arm,bulb);
  if(realPt){const pt=new THREE.PointLight(0xffdea0,1.6,14,2);pt.position.set(.98,4,0);g.add(pt);W.lampPts.push(pt);}
  g.position.set(x,0,z);g.rotation.y=ry;
  addCol(x,z,.32,.32,.32,'pole');
  return g;
}
function mkTLight(x,z,ry){
  const g=new THREE.Group();
  const p=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,3.4,7),new THREE.MeshLambertMaterial({color:0x1a1a1a,metalness:.5}));
  p.position.y=1.7;g.add(p);
  const bx=new THREE.Mesh(new THREE.BoxGeometry(.3,.86,.26),new THREE.MeshLambertMaterial({color:0x111}));bx.position.set(0,3.25,.14);g.add(bx);
  const mats=[0xff3b30,0xffcc00,0x2ecc40].map(c=>new THREE.MeshLambertMaterial({color:c,emissive:c,emissiveIntensity:.1}));
  mats.forEach((m,i)=>{const l=new THREE.Mesh(new THREE.CircleGeometry(.072,10),m);l.position.set(0,3.56-i*.24,.3);g.add(l);});
  g.position.set(x,0,z);g.rotation.y=ry;
  addCol(x,z,.32,.32,.32,'pole');
  g.userData={mats,state:0,timer:rand(2,8)};W.tlights.push(g);return g;
}
function mkParkLot(cx,cz,blockI,blockJ){
  const g=new THREE.Group();
  const lM=new THREE.MeshLambertMaterial({color:0x303438,roughness:.92});
  const lot=new THREE.Mesh(new THREE.PlaneGeometry(CFG.blockSz-3,CFG.blockSz-3),lM);lot.rotation.x=-Math.PI/2;lot.receiveShadow=true;g.add(lot);
  // parking stripes
  const sM=new THREE.MeshBasicMaterial({color:0xffffff,opacity:.35,transparent:true});
  for(let r=-2;r<=2;r++){const s=new THREE.Mesh(new THREE.PlaneGeometry(CFG.blockSz-4,.14),sM);s.rotation.x=-Math.PI/2;s.position.set(0,.002,r*8.5);g.add(s);}
  for(let r=-1;r<=1;r++)for(let c=-2;c<=2;c++){
    const lx=c*5.0,lz=r*8.5;
    const wx=cx+lx,wz=cz+lz;
    const occ=Math.random()>.68;
    if(occ){
      const car=mkCar(pick(CAR_PAL),undefined,false);
      car.position.set(lx,0,lz);
      car.rotation.y=r%2?0:Math.PI;
      g.add(car);
      addCol(wx,wz,1.8,3.8,.1,'car');
    }
    W.parkSpots.push({x:wx,z:wz,occupied:occ,heading:r%2?0:Math.PI,blockI,blockJ});
  }
  // P sign
  const signM=new THREE.MeshLambertMaterial({color:0x1a5fbd,roughness:.6});
  const sign=new THREE.Mesh(new THREE.BoxGeometry(1.4,.06,1),signM);sign.position.set(0,2.8,CFG.blockSz/2-1.5);g.add(sign);
  g.position.set(cx,.018,cz);return g;
}
function mkFuelStation(x,z){
  const g=new THREE.Group();
  const bM=new THREE.MeshLambertMaterial({color:0x999,roughness:.7});
  const base=new THREE.Mesh(new THREE.BoxGeometry(7,.1,9),bM);base.position.y=.05;base.receiveShadow=true;g.add(base);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(8,.22,10),new THREE.MeshLambertMaterial({color:0xcc3311,roughness:.6}));roof.position.y=3.2;g.add(roof);
  [-1.6,1.6].forEach(ox=>{
    const pump=new THREE.Mesh(new THREE.BoxGeometry(.48,1.4,.38),new THREE.MeshLambertMaterial({color:0x2255aa,roughness:.6}));
    pump.position.set(ox,.7,0);pump.castShadow=true;g.add(pump);
  });
  g.position.set(x,0,z);addCol(x,z,8,10);
  W.fuelPts.push({x,z});return g;
}
function mkRain(){
  const N=1200,geo=new THREE.BufferGeometry();
  const pos=new Float32Array(N*3),vel=new Float32Array(N);
  for(let i=0;i<N;i++){pos[i*3]=rand(-60,60);pos[i*3+1]=rand(0,42);pos[i*3+2]=rand(-60,60);vel[i]=rand(18,28);}
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const pts=new THREE.Points(geo,new THREE.PointsMaterial({color:0xaacfff,size:.1,transparent:true,opacity:.5}));
  pts.visible=false;pts.userData.vel=vel;return pts;
}
/* ─── DESTINATION / MISSION MARKER (3D) ─────────────────────────
   A floating "!" badge + light beam over whatever W.dest currently
   points to, visible right in the driving scene — not just the map. */
function mkExclaimTexture(){
  const c=document.createElement('canvas');c.width=128;c.height=128;
  const x=c.getContext('2d');
  const g=x.createRadialGradient(64,64,8,64,64,62);
  g.addColorStop(0,'rgba(255,60,70,.55)');g.addColorStop(1,'rgba(255,60,70,0)');
  x.fillStyle=g;x.beginPath();x.arc(64,64,62,0,Math.PI*2);x.fill();
  x.fillStyle='#ff3344';x.beginPath();x.arc(64,56,32,0,Math.PI*2);x.fill();
  x.strokeStyle='#fff';x.lineWidth=4;x.stroke();
  x.fillStyle='#fff';x.font='900 44px Rajdhani,Arial,sans-serif';x.textAlign='center';x.textBaseline='middle';
  x.fillText('!',64,58);
  return new THREE.CanvasTexture(c);
}
let destMarker=null,destBeam=null,destMarkerT=0;
function buildDestMarker(){
  const mat=new THREE.SpriteMaterial({map:mkExclaimTexture(),transparent:true,depthWrite:false});
  destMarker=new THREE.Sprite(mat);destMarker.scale.set(6,6,1);destMarker.visible=false;destMarker.renderOrder=999;
  scene.add(destMarker);
  const beamMat=new THREE.MeshBasicMaterial({color:0xff3344,transparent:true,opacity:.32,depthWrite:false,side:THREE.DoubleSide});
  destBeam=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,14,8,1,true),beamMat);
  destBeam.visible=false;scene.add(destBeam);
}
function updateDestMarker(dt){
  if(!destMarker)return;
  destMarkerT+=dt;
  if(W.dest){
    const bob=Math.sin(destMarkerT*2.4)*.5;
    destMarker.visible=true;destMarker.position.set(W.dest.x,6.4+bob,W.dest.z);
    destBeam.visible=true;destBeam.position.set(W.dest.x,7,W.dest.z);
  } else {
    destMarker.visible=false;destBeam.visible=false;
  }
}
/* ─── SIMPLE MISSION PROPS: cones + parking-box outline ─────────
   Deliberately low-poly — these only need to read clearly at a glance,
   not hold up to a close look. */
function mkCone(){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.ConeGeometry(.32,.62,8),new THREE.MeshLambertMaterial({color:0xff6a1f}));
  body.position.y=.31;g.add(body);
  const stripe=new THREE.Mesh(new THREE.ConeGeometry(.26,.13,8),new THREE.MeshBasicMaterial({color:0xffffff}));
  stripe.position.y=.4;g.add(stripe);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,.06,10),new THREE.MeshLambertMaterial({color:0x1a1a1a}));
  base.position.y=.03;g.add(base);
  return g;
}
function mkParkBox(box){
  const g=new THREE.Group();
  const edges=new THREE.EdgesGeometry(new THREE.PlaneGeometry(box.halfW*2,box.halfL*2));
  const line=new THREE.LineSegments(edges,new THREE.LineBasicMaterial({color:0x2ecc70,linewidth:4}));
  line.rotation.x=-Math.PI/2;line.position.y=.04;g.add(line);
  g.position.set(box.x,0,box.z);g.rotation.y=box.heading;
  return g;
}

/* 3D Finish Line Archway (matching reference image) */
function mkFinishArch(pos){
  const g=new THREE.Group();
  const pMat=new THREE.MeshLambertMaterial({color:0x222222});
  const p1=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,5.5,8),pMat);
  p1.position.set(-4.5,2.75,0);g.add(p1);
  const p2=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,5.5,8),pMat);
  p2.position.set(4.5,2.75,0);g.add(p2);
  const top=new THREE.Mesh(new THREE.BoxGeometry(9.6,.9,.5),new THREE.MeshLambertMaterial({color:0x2ecc70}));
  top.position.set(0,5.2,0);g.add(top);
  if(pos)g.position.set(pos.x,0,pos.z);
  return g;
}

/* 3D Glowing Checkpoint Marker with Red Flag (matching reference image) */
function mkCheckpointMarker(pos){
  const g=new THREE.Group();
  const ring=new THREE.Mesh(new THREE.RingGeometry(1.8,2.4,24),new THREE.MeshBasicMaterial({color:0x2ecc70,side:THREE.DoubleSide,transparent:true,opacity:.7}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.04;g.add(ring);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,4,8),new THREE.MeshLambertMaterial({color:0xdddddd}));
  pole.position.y=2;g.add(pole);
  const flag=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:0xff3344,side:THREE.DoubleSide}));
  const fVertices=new Float32Array([0,3.8,0, 1.2,3.3,0, 0,2.8,0]);
  flag.geometry.setAttribute('position',new THREE.BufferAttribute(fVertices,3));
  g.add(flag);
  if(pos)g.position.set(pos.x,0,pos.z);
  return g;
}
function buildCity(){
  scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x9fc4e8,.0032);scene.background=new THREE.Color(.07,.12,.18);
  // sky
  const sky=new THREE.Mesh(new THREE.SphereGeometry(490,16,10),new THREE.ShaderMaterial({
    uniforms:{top:{value:new THREE.Color(.16,.42,.70)},bot:{value:new THREE.Color(.78,.89,1.0)}},
    vertexShader:`varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform vec3 top,bot;varying vec3 vP;void main(){float h=clamp(normalize(vP).y*.5+.5,0.,1.);gl_FragColor=vec4(mix(bot,top,pow(h,.5)),1.);}`,
    side:THREE.BackSide,depthWrite:false,
  }));sky.name='sky';scene.add(sky);W.skyMesh=sky;
  // stars
  const sG=new THREE.BufferGeometry(),sP=new Float32Array(400*3);
  for(let i=0;i<400;i++){const r=478,t=Math.random()*Math.PI*2,p=Math.random()*Math.PI*.5;sP[i*3]=r*Math.sin(p)*Math.cos(t);sP[i*3+1]=r*Math.cos(p)+10;sP[i*3+2]=r*Math.sin(p)*Math.sin(t);}
  sG.setAttribute('position',new THREE.BufferAttribute(sP,3));
  const stars=new THREE.Points(sG,new THREE.PointsMaterial({color:0xffffff,size:1.25,transparent:true,opacity:0}));
  stars.name='stars';scene.add(stars);W.starsMesh=stars;
  // lights
  sunLight=new THREE.DirectionalLight(0xffffff,2.2);sunLight.castShadow=false;
  sunLight.shadow.mapSize.set(1024,1024);const sd=82;['left','right','top','bottom'].forEach((k,i)=>sunLight.shadow.camera[k]=i%2?sd:-sd);
  sunLight.shadow.camera.far=260;sunLight.shadow.bias=-.0004;scene.add(sunLight,sunLight.target);
  ambLight=new THREE.AmbientLight(0x9fb3c8,.38);scene.add(ambLight);
  hemiLight=new THREE.HemisphereLight(0x9fc4e8,0x33301f,.38);scene.add(hemiLight);
  // ground
  const gnd=new THREE.Mesh(new THREE.PlaneGeometry(CFG.span+90,CFG.span+90),new THREE.MeshLambertMaterial({map:T.road,roughness:.95}));
  gnd.rotation.x=-Math.PI/2;gnd.receiveShadow=true;scene.add(gnd);
  const half=CFG.grid>>1;
  const stG=new THREE.Group(),prG=new THREE.Group();
  const parkSet=new Set(),fuelSet=new Set();
  while(parkSet.size<5)parkSet.add(`${Math.floor(rand(-half+1,half))},${Math.floor(rand(-half+1,half))}`);
  while(fuelSet.size<3)fuelSet.add(`${Math.floor(rand(-half+1,half))},${Math.floor(rand(-half+1,half))}`);
  let lamBudget=18;
  for(let ix=-half;ix<half;ix++)for(let iz=-half;iz<half;iz++){
    const cx=ix*CFG.cell+CFG.cell/2-CFG.roadW/2;
    const cz=iz*CFG.cell+CFG.cell/2-CFG.roadW/2;
    const key=`${ix},${iz}`;
    const sw=new THREE.Mesh(new THREE.PlaneGeometry(CFG.blockSz+2.2,CFG.blockSz+2.2),new THREE.MeshLambertMaterial({map:T.sw,roughness:1}));
    sw.rotation.x=-Math.PI/2;sw.position.set(cx,.013,cz);sw.receiveShadow=true;prG.add(sw);
    const nearSpawn=Math.abs(cx-CFG.spawnX)<CFG.cell*1.4&&Math.abs(cz-CFG.spawnZ)<CFG.cell*1.4;
    if(parkSet.has(key)){prG.add(mkParkLot(cx,cz,ix,iz));}
    else if(fuelSet.has(key)){stG.add(mkFuelStation(cx,cz));}
    else if(ix===0&&iz===0){
      const pk=new THREE.Mesh(new THREE.PlaneGeometry(CFG.blockSz-3,CFG.blockSz-3),new THREE.MeshLambertMaterial({map:T.grass,roughness:1}));
      pk.rotation.x=-Math.PI/2;pk.position.set(cx,.019,cz);pk.receiveShadow=true;prG.add(pk);
      for(let t=0;t<12;t++)prG.add(mkTree(cx+rand(-16,16),cz+rand(-16,16)));
    } else {
      // Scatter roadside pine trees & green islands for scenery matching the reference images
      if(Math.random()<0.45){
        for(let t=0;t<3;t++)prG.add(mkTree(cx+rand(-18,18),cz+rand(-18,18)));
      }
      const nb=nearSpawn?0:Math.random()<.55?0:1;
      for(let b=0;b<nb;b++){
        const bx=cx+(b-.5)*(CFG.blockSz*.46);
        const bz=cz+rand(-3,3);
        stG.add(mkBuilding(bx,bz,CFG.blockSz*.41));
      }
    }
    if(!nearSpawn){
      const rl=lamBudget-->0;
      prG.add(mkLamp(cx+CFG.blockSz/2+.6,cz+CFG.blockSz/2+.6,Math.PI*.25,rl));
    }
    if(Math.random()<.55&&!nearSpawn)
      prG.add(mkTLight(cx-CFG.blockSz/2-.6,cz-CFG.blockSz/2-.6,Math.PI/4));
    if(Math.random()<.16&&!nearSpawn){
      const tx=cx-CFG.blockSz/2-1.4,tz=cz+rand(-11,11);
      if(!hits(tx,tz,2))prG.add(mkTree(tx,tz));
    }
  }
  // lane markings — 18 long dashed strips (one per road line) instead of
  // ~1450 individual tiny planes. Same visual result, a fraction of the
  // draw calls, which was the single biggest cause of low FPS.
  const fullLen=CFG.grid*CFG.cell;
  const dashN=Math.max(1,Math.round(fullLen/5.5));
  const dashDraw=(c,w,h)=>{const dw=w*(2.8/5.5);c.fillStyle='rgba(255,224,96,0.75)';c.fillRect((w-dw)/2,0,dw,h);};
  const lMX=new THREE.MeshBasicMaterial({map:mkTex(dashDraw,64,8,dashN,1),transparent:true});
  const lMZ=new THREE.MeshBasicMaterial({map:mkTex(dashDraw,64,8,1,dashN),transparent:true});
  for(let i=-half;i<=half;i++){
    const sX=new THREE.Mesh(new THREE.PlaneGeometry(fullLen,.26),lMX);
    sX.rotation.x=-Math.PI/2;sX.position.set(0,0.021,i*CFG.cell-CFG.roadW/2);prG.add(sX);
    const sZ=new THREE.Mesh(new THREE.PlaneGeometry(.26,fullLen),lMZ);
    sZ.rotation.x=-Math.PI/2;sZ.position.set(i*CFG.cell-CFG.roadW/2,0.021,0);prG.add(sZ);
  }
  scene.add(stG,prG);
  // Freeze transforms for everything static (buildings, sidewalks, parked
  // cars, lamps, trees, lane markings, park lots, fuel stations, traffic
  // light posts, ground, sky). By default three.js recomputes every
  // object's local + world matrix EVERY frame even if it never moves —
  // with a full city's worth of static meshes that's real, wasted CPU
  // time on every single frame. None of this ever changes position/
  // rotation/scale after being placed (only some materials' color/
  // emissive intensity change, which doesn't need a matrix update), so
  // compute each matrix once here and never again.
  function freezeStatic(obj){
    obj.matrixAutoUpdate=false;obj.updateMatrix();
    obj.children.forEach(freezeStatic);
  }
  freezeStatic(stG);freezeStatic(prG);
  gnd.matrixAutoUpdate=false;gnd.updateMatrix();
  sky.matrixAutoUpdate=false;sky.updateMatrix();
  // AI traffic cars — more of them now, with mixed body styles for variety.
  // Left-hand traffic (India/UK style): each car loops its block corner-to-
  // corner in a fixed winding order, and since that winding is CCW, insetting
  // the loop toward the block's own centre (r-laneOffset instead of r) puts
  // every car on the LEFT side of the road relative to its direction of
  // travel — same trick real one-way circulation blocks use, no per-edge
  // trig needed.
  // IMPORTANT: the loop must be anchored on a BLOCK CENTRE (same formula
  // buildCity uses for cx/cz below), not a road INTERSECTION node. Those
  // two anchors are a half-cell apart — anchoring on the wrong one is
  // exactly what was sending traffic loops straight through the block
  // interior (buildings/sidewalks) instead of around the road that
  // surrounds the block, and is why pedestrians (which shared the same
  // buggy anchor) ended up drifting into the road too.
  const laneOffset=CFG.roadW*.27;
  // trimmed from 28 → 20: each AI car is its own draw call plus its own
  // per-frame nested distance-checks against every other AI car and every
  // traffic light, so cutting the count reduces both GPU and CPU load
  // directly. The city still reads as busy at 20.
  for(let i=0;i<20;i++){
    const bx=Math.floor(rand(-half,half))*CFG.cell+CFG.cell/2-CFG.roadW/2;
    const bz=Math.floor(rand(-half,half))*CFG.cell+CFG.cell/2-CFG.roadW/2;
    const r=CFG.blockSz/2+CFG.roadW/2-laneOffset;
    const path=[new THREE.Vector3(bx-r,0,bz-r),new THREE.Vector3(bx+r,0,bz-r),new THREE.Vector3(bx+r,0,bz+r),new THREE.Vector3(bx-r,0,bz+r)];
    const car=mkCar(pick(CAR_PAL),pick(['suv','sedan','sedan','van','sport']),false);car.position.copy(path[0]);scene.add(car);
    W.aiCars.push({mesh:car,path,idx:0,spd:rand(3.5,8.5),waitT:0});
  }
  // pedestrians — anchored on the same block-centre point as the traffic
  // loop above, offset just past the block edge (blockSz/2) onto the
  // sidewalk apron (which extends blockSz/2+1.1), well short of the
  // inset road lane (r above), so cars and peds now provably never share
  // the same ground.
  // pedestrians — high density city sidewalks and crosswalks
  for(let i=0;i<45;i++){
    const bx=Math.floor(rand(-half,half))*CFG.cell+CFG.cell/2-CFG.roadW/2;
    const bz=Math.floor(rand(-half,half))*CFG.cell+CFG.cell/2-CFG.roadW/2;
    const r=CFG.blockSz/2+.8;
    const h=Math.random()<.5;
    const pA=new THREE.Vector3(bx+(h?-r:r*.3),0,bz+(h?.3*r:-r));
    const pB=new THREE.Vector3(bx+(h?r:-r*.3),0,bz+(h?-.3*r:r));
    const pg=new THREE.Group();
    const tM=new THREE.MeshLambertMaterial({color:pick([0x3355aa,0xaa4433,0x333333,0xbbbbbb,0x226644,0xd35400,0x8e44ad,0x16a085])});
    const torso=new THREE.Mesh(new THREE.CylinderGeometry(.14,.12,.52,6),tM);torso.position.y=1.04;torso.castShadow=false;
    const head=new THREE.Mesh(new THREE.SphereGeometry(.13,6,6),new THREE.MeshLambertMaterial({color:0xdea880}));head.position.y=1.4;head.castShadow=false;
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(.052,.052,.54,6),new THREE.MeshLambertMaterial({color:0x1e2530}));
    const lL=leg.clone();lL.position.set(-.07,.5,0);const lR=leg.clone();lR.position.set(.07,.5,0);
    pg.add(torso,head,lL,lR);pg.position.copy(pA);scene.add(pg);
    W.peds.push({mesh:pg,a:pA,b:pB,t:Math.random(),dir:1,spd:rand(.22,.48),lL,lR,hitT:0,downT:0,hitVel:new THREE.Vector3(),spin:0});
  }
  // rain
  W.rain=mkRain();scene.add(W.rain);
  // boundary
  const B=CFG.span/2+5;[[-B,0,4,B*2],[B,0,4,B*2],[0,-B,B*2,4],[0,B,B*2,4]].forEach(([x,z,sx,sz])=>addCol(x,z,sx,sz,0));
  // floating "!" destination / mission marker, hidden until W.dest is set
  buildDestMarker();
}

