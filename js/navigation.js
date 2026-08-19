"use strict";
/* ─── ROAD NETWORK / A* PATHFINDING ─────────────────────────────
   The city is a Manhattan grid: every road is a straight line at
   i*CFG.cell-CFG.roadW/2 (matches the lane-marking grid exactly),
   so intersections form a fully-addressable graph with NAV_HALF*2+1
   nodes per axis. A* runs over this graph so any route the AI drives
   is guaranteed to stay on the road — it can never cut through a
   building, lawn, or the boundary wall.                            */
const NAV_HALF=CFG.grid>>1;
function navNodeToWorld(i,j){return{x:i*CFG.cell-CFG.roadW/2,z:j*CFG.cell-CFG.roadW/2};}
function navWorldToNode(x,z){
  const i=clamp(Math.round((x+CFG.roadW/2)/CFG.cell),-NAV_HALF,NAV_HALF);
  const j=clamp(Math.round((z+CFG.roadW/2)/CFG.cell),-NAV_HALF,NAV_HALF);
  return{i,j};
}
function findRoadPathAStar(si,sj,gi,gj){
  const h=(i,j)=>Math.abs(i-gi)+Math.abs(j-gj);
  const nkey=(i,j)=>i+'_'+j;
  const open=new Map();open.set(nkey(si,sj),{i:si,j:sj,g:0,f:h(si,sj),parent:null});
  const closed=new Set();let guard=0;
  while(open.size&&guard++<500){
    let curKey=null,cur=null;
    for(const[k,v]of open)if(!cur||v.f<cur.f){cur=v;curKey=k;}
    if(cur.i===gi&&cur.j===gj){
      const path=[];let n=cur;while(n){path.unshift({i:n.i,j:n.j});n=n.parent;}return path;
    }
    open.delete(curKey);closed.add(curKey);
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([di,dj])=>{
      const ni=cur.i+di,nj=cur.j+dj;
      if(ni<-NAV_HALF||ni>NAV_HALF||nj<-NAV_HALF||nj>NAV_HALF)return;
      const nk=nkey(ni,nj);if(closed.has(nk))return;
      const g=cur.g+1,ex=open.get(nk);
      if(!ex||g<ex.g)open.set(nk,{i:ni,j:nj,g,f:g+h(ni,nj),parent:cur});
    });
  }
  return null;
}
// Route to an arbitrary world point (map clicks, fuel stations, missions):
// drives the road grid, then only takes a final straight leg off-road
// if that leg is actually clear — otherwise it stops at the curb rather
// than crossing whatever is in the way.
function planRoadRoute(fromPos,toX,toZ){
  const s=navWorldToNode(fromPos.x,fromPos.z),g=navWorldToNode(toX,toZ);
  const np=findRoadPathAStar(s.i,s.j,g.i,g.j);
  if(!np)return null;
  const wps=np.map(n=>navNodeToWorld(n.i,n.j));
  const last=wps[wps.length-1];
  const legDist=Math.hypot(last.x-toX,last.z-toZ);
  if(legDist>1.5){
    const mx=(last.x+toX)/2,mz=(last.z+toZ)/2;
    if(!hits(mx,mz,1.2)&&!hits(toX,toZ,1.2))wps.push({x:toX,z:toZ});
  }
  return wps;
}
// Route to a specific parking spot: road-network to a corner of that
// spot's lot, then a short driveway leg into the space itself.
function planParkingRoute(fromPos,spot){
  const approachDist=6.5;
  const appX=spot.x-Math.sin(spot.heading)*approachDist;
  const appZ=spot.z-Math.cos(spot.heading)*approachDist;
  
  const dToSpot=Math.hypot(fromPos.x-spot.x,fromPos.z-spot.z);
  if(dToSpot<28){
    // Close range direct approach
    return [
      {x:appX,z:appZ},
      {x:spot.x,z:spot.z,park:true,heading:spot.heading}
    ];
  }
  
  const s=navWorldToNode(fromPos.x,fromPos.z);
  const targetNode=navWorldToNode(appX,appZ);
  const np=findRoadPathAStar(s.i,s.j,targetNode.i,targetNode.j);
  if(!np||np.length===0){
    return [
      {x:appX,z:appZ},
      {x:spot.x,z:spot.z,park:true,heading:spot.heading}
    ];
  }
  const wps=np.map(n=>navNodeToWorld(n.i,n.j));
  wps.push({x:appX,z:appZ});
  wps.push({x:spot.x,z:spot.z,park:true,heading:spot.heading});
  return wps;
}

function followRoadPath(car,dt,path,state,arriveR=3.0,safeMode=false){
  if(!path||!path.length)return'arrived';
  if(state.idx>=path.length)return'arrived';
  
  const cwp=path[state.idx];
  const dx=cwp.x-car.pos.x,dz=cwp.z-car.pos.z;
  const dist=Math.hypot(dx,dz);
  
  const curArriveR=cwp.park?1.5:(state.idx===path.length-1?arriveR:4.2);
  if(dist<curArriveR){
    state.idx++;
    state.stuckT=0;
    if(state.idx>=path.length)return'arrived';
  }
  
  const wantHeading=Math.atan2(dx,dz);
  const diff=((wantHeading-car.heading)+Math.PI*3)%(Math.PI*2)-Math.PI;
  
  let turnFactor=1;
  const nn=path[state.idx+1];
  if(nn){
    const legDir=Math.atan2(cwp.x-car.pos.x,cwp.z-car.pos.z);
    const nextDir=Math.atan2(nn.x-cwp.x,nn.z-cwp.z);
    const turnDiff=Math.abs(((nextDir-legDir)+Math.PI*3)%(Math.PI*2)-Math.PI);
    turnFactor=clamp(1-turnDiff/Math.PI*.7,.35,1);
  }
  
  const speedAbs=Math.abs(car.speed);
  const lookAhead=clamp(speedAbs*.8,2.2,8.0);
  const fwdX=Math.sin(car.heading),fwdZ=Math.cos(car.heading);
  const perpX=Math.cos(car.heading),perpZ=-Math.sin(car.heading);
  const fx=car.pos.x+fwdX*lookAhead,fz=car.pos.z+fwdZ*lookAhead;
  
  let blocked=false;
  let dynamicAhead=false;
  
  if(speedAbs>0.8){
    const probePts=[
      {x:fx,z:fz},
      {x:fx+perpX*1.1,z:fz+perpZ*1.1},
      {x:fx-perpX*1.1,z:fz-perpZ*1.1}
    ];
    for(const pt of probePts){
      if(hits(pt.x,pt.z,1.0)){blocked=true;break;}
    }
  }
  
  if(!blocked&&speedAbs>0.8){
    for(const ai of W.aiCars){
      if(ai===car)continue;
      const ax=ai.mesh.position.x-fx,az=ai.mesh.position.z-fz;
      if(ax*ax+az*az<24){blocked=true;dynamicAhead=true;break;}
    }
  }
  
  // Traffic lights & signals
  let redLight=false;
  if(!blocked)for(const tl of W.tlights){
    if(tl.userData.state===2)continue; // Green light
    const tdx=tl.position.x-fx,tdz=tl.position.z-fz;
    if(tdx*tdx+tdz*tdz<30){redLight=true;blocked=true;break;}
  }
  // local avoidance: if the way ahead is blocked, check either side for a
  // clear gap (e.g. squeezing past a parked/AI car) and steer around it
  // instead of just stopping dead — real self-driving cars do this too.
  // Skipped entirely in safeMode: a car or person in the path always means
  // a full stop-and-wait, never a squeeze-past.
  let avoidSteer=0,canDodge=false;
  if(blocked&&!redLight&&!safeMode){
    const off=2.6;
    const rx=fx+perpX*off,rz=fz+perpZ*off,lx=fx-perpX*off,lz=fz-perpZ*off;
    const rightClear=!hits(rx,rz,1.0),leftClear=!hits(lx,lz,1.0);
    if(rightClear&&!leftClear){avoidSteer=.7;canDodge=true;}
    else if(leftClear&&!rightClear){avoidSteer=-.7;canDodge=true;}
    else if(rightClear&&leftClear){avoidSteer=diff>=0?.55:-.55;canDodge=true;}
  }
  // steering — smoothed toward the target the same way manual steering is
  // (previously this was a hard clamp() assignment with no lerp, so the
  // steer value could jump instantly frame-to-frame whenever the avoid/
  // dodge check flipped on or off — that's what caused the visible
  // jerk/twitch in the car's turning and wheel animation specifically in
  // Machine/AI mode, since manual driving never had that instant-snap path)
  const targetSteer=clamp(-diff*1.15+avoidSteer,-1,1);
  car.steer=lerp(car.steer,targetSteer,Math.min(1,dt*8));
  const sf=clamp(Math.abs(car.speed)/7,0,1);
  car.heading-=car.steer*sf*dt*2.1;
  // speed: smooth accel/brake toward a target that respects turns/dodges/obstacles/arrival
  const hardStop=blocked&&!canDodge;
  const targetSpeed=hardStop?0:Math.min(9*turnFactor*(blocked?.5:1),dist*1.6+1.5);
  car.speed=car.speed<targetSpeed?Math.min(targetSpeed,car.speed+6*dt):Math.max(targetSpeed,car.speed-9*dt);
  car.fuel=Math.max(0,car.fuel-dt*.12);
  // move, but never through a collider — this is what stops road-crossing
  const mdx=Math.sin(car.heading)*car.speed*dt,mdz=Math.cos(car.heading)*car.speed*dt;
  let movedX=false,movedZ=false;
  if(!hits(car.pos.x+mdx,car.pos.z,1.05)){car.pos.x+=mdx;movedX=true;}else car.speed*=.2;
  if(!hits(car.pos.x,car.pos.z+mdz,1.05)){car.pos.z+=mdz;movedZ=true;}else car.speed*=.2;
  // stuck handling: brief reverse-and-turn nudge, then ask caller to replan
  // (skipped while legitimately holding at a red light — that's not "stuck".
  // In safeMode, a car/person in the path gets the same treatment: hold and
  // keep watching indefinitely, don't reverse-nudge or give up and replan —
  // the whole point is to wait the obstacle out, however long that takes,
  // then resume the exact same parking route.)
  if(redLight||(safeMode&&dynamicAhead)){
    state.stuckT=0;
    state.progPos={x:car.pos.x,z:car.pos.z};state.progT=0;
  } else {
    if((!movedX&&!movedZ)||Math.abs(car.speed)<.12){
      state.stuckT=(state.stuckT||0)+dt;
      if(state.stuckT>1.1&&state.stuckT<=2.4){
        car.speed=lerp(car.speed,-2.2,dt*3);
        car.heading+=(car.steer>=0?-1:1)*dt*.7;
      } else if(state.stuckT>2.4){
        state.stuckT=0;return'blocked-replan';
      }
    } else state.stuckT=0;
    // secondary backstop: even if per-frame flags flicker (tiny creeps that
    // keep resetting stuckT above), check net displacement over a longer
    // rolling window — genuinely stalled progress always trips this.
    if(!state.progPos){state.progPos={x:car.pos.x,z:car.pos.z};state.progT=0;}
    state.progT+=dt;
    if(state.progT>1.4){
      const movedNet=Math.hypot(car.pos.x-state.progPos.x,car.pos.z-state.progPos.z);
      state.progPos={x:car.pos.x,z:car.pos.z};state.progT=0;
      if(movedNet<1.0){state.stuckT=0;return'blocked-replan';}
    }
  }
  car.wheelSpin+=car.speed*dt*1.5;
  car.bodyRoll=lerp(car.bodyRoll,car.steer*sf*.3,dt*6);
  car._applyMesh();
  return'driving';
}

/* ─── DYNAMIC GPS PATHFINDING & 3D ROUTE LINE ────────────────── */
let lastGPSCalcAt=0,lastGPSCarPos={x:-999,z:-999};

function updateDynamicGPS(dt){
  if(!W.dest){
    W.currentRouteWps=null;
    if(W.routeMesh3D)W.routeMesh3D.visible=false;
    return;
  }
  
  const now=performance.now();
  const dFromLast=Math.hypot(Car.pos.x-lastGPSCarPos.x,Car.pos.z-lastGPSCarPos.z);
  
  let needsReplan=!W.currentRouteWps||W.currentRouteWps.length===0;
  
  if(!needsReplan&&W.currentRouteWps.length>0){
    const wp0=W.currentRouteWps[0];
    const d0=Math.hypot(Car.pos.x-wp0.x,Car.pos.z-wp0.z);
    if(d0<7.5){
      W.currentRouteWps.shift();
      needsReplan=W.currentRouteWps.length===0;
    } else if(dFromLast>9&&now-lastGPSCalcAt>500){
      needsReplan=true;
    }
  }
  
  if(needsReplan||(now-lastGPSCalcAt>900&&dFromLast>3.5)){
    lastGPSCalcAt=now;
    lastGPSCarPos={x:Car.pos.x,z:Car.pos.z};
    const wps=planRoadRoute(Car.pos,W.dest.x,W.dest.z);
    if(wps&&wps.length>0){
      W.currentRouteWps=wps;
      update3DGPSRouteMesh(wps);
    }
  } else if(W.routeMesh3D&&W.currentRouteWps){
    update3DGPSRouteMesh(W.currentRouteWps);
  }
}

function update3DGPSRouteMesh(wps){
  if(!scene||!wps||wps.length===0){
    if(W.routeMesh3D)W.routeMesh3D.visible=false;
    return;
  }
  
  const points=[new THREE.Vector3(Car.pos.x,0.09,Car.pos.z)];
  for(let i=0;i<wps.length;i++){
    points.push(new THREE.Vector3(wps[i].x,0.09,wps[i].z));
  }
  
  if(!W.routeMesh3D){
    const geo=new THREE.BufferGeometry().setFromPoints(points);
    const mat=new THREE.LineBasicMaterial({color:0x00e5ff,linewidth:6,transparent:true,opacity:0.9});
    W.routeMesh3D=new THREE.Line(geo,mat);
    W.routeMesh3D.renderOrder=998;
    scene.add(W.routeMesh3D);
  } else {
    W.routeMesh3D.geometry.dispose();
    W.routeMesh3D.geometry=new THREE.BufferGeometry().setFromPoints(points);
    W.routeMesh3D.visible=true;
  }
}


