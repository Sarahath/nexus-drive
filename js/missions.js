"use strict";
/* ─── MISSION FLOW: briefing → play → result → next ─────────────
   Every mission is shown as a briefing (objective + instructions) before
   it starts, and ends in a result screen (score, performance, time,
   collisions) with a way forward that never dead-ends the player. */
function startMissionMode(reset){
  gameMode='mission';
  if(reset){missionState.current=-1;missionState.unlocked=0;missionState.results=[];}
  document.getElementById('scr-misend').classList.remove('show');
  document.getElementById('scr-campaign').classList.remove('show');
  openBriefing(missionState.unlocked);
}
function openBriefing(i){
  i=clamp(i,0,MISSIONS.length-1);
  if(i>missionState.unlocked)i=missionState.unlocked; // missions can't be skipped ahead
  missionState.current=i;
  const m=MISSIONS[i];
  document.getElementById('brief-tag').textContent=`MISSION ${i+1} OF ${MISSIONS.length}`;
  document.getElementById('brief-ico').textContent=m.icon;
  document.getElementById('brief-name').textContent=m.name;
  document.getElementById('brief-obj').textContent=m.objective;
  document.getElementById('brief-list').innerHTML=m.instructions.map(t=>`<li>${t}</li>`).join('');
  document.getElementById('scr-brief').classList.add('show');
  appState='briefing';
}
function isNearFuelStation(x,z,minDist=45){
  if(!W.fuelPts||!W.fuelPts.length)return false;
  for(const f of W.fuelPts){
    if(Math.hypot(x-f.x,z-f.z)<minDist)return true;
  }
  return false;
}

function pickSafePoints(n,minFuelDist=45){
  const pts=[];
  const half=Math.max(2,(CFG.grid>>1)-1);
  const candidates=[];
  for(let i=-half;i<=half;i++){
    for(let j=-half;j<=half;j++){
      const pos=navNodeToWorld(i,j);
      const dSpawn=Math.hypot(pos.x-CFG.spawnX,pos.z-CFG.spawnZ);
      if(dSpawn>25&&!isNearFuelStation(pos.x,pos.z,minFuelDist)){
        candidates.push(pos);
      }
    }
  }
  for(let i=candidates.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [candidates[i],candidates[j]]=[candidates[j],candidates[i]];
  }
  for(const c of candidates){
    if(pts.length>=n)break;
    let close=false;
    for(const p of pts){
      if(Math.hypot(c.x-p.x,c.z-p.z)<28){close=true;break;}
    }
    if(!close||pts.length===0)pts.push(c);
  }
  while(pts.length<n&&candidates.length>pts.length){
    pts.push(candidates[pts.length]);
  }
  return pts;
}

function beginMission(i){
  const m=MISSIONS[i];
  const mis={index:i,t:0,progress:0,collisionsStart:W.collisionCount};
  
  // Always reset car to start grid / spawn point for fresh mission start
  Car.reset();
  Car.pos.set(CFG.spawnX,0,CFG.spawnZ);
  Car.heading=0;
  Car.speed=0;
  Car._applyMesh();
  if(typeof updateCam==='function')updateCam(0.016);

  W.dest=null;Car.aiDriving=false;W.ai.car=false;Car.autoPark=null;
  document.getElementById('ap-hud').classList.remove('show');
  document.getElementById('mis-hud').classList.add('show');
  document.getElementById('mis-title').textContent=`MISSION ${i+1} OF ${MISSIONS.length} · ${m.name.toUpperCase()}`;
  toast(`🎯 ${m.name}`);
  clearMissionProps(); // tear down any leftover cones/box outline from a previous attempt
  
  if(m.key==='timetrial'){
    // Destination away from petrol bunks across downtown
    const pts=pickSafePoints(1,50);
    mis.target=pts[0]||navNodeToWorld(NAV_HALF-1,NAV_HALF-1);
    W.dest=mis.target;
    const dist=Math.hypot(mis.target.x-Car.pos.x,mis.target.z-Car.pos.z);
    mis.timeLimit=Math.round(clamp(dist/4.2,65,85)); // Extended time limit (65-85s)
    if(typeof mkFinishArch==='function'){
      const arch=mkFinishArch(mis.target);
      scene.add(arch);W.missionProps.push(arch);
    }
  } else if(m.key==='parkchallenge'){
    let free=ensureFreeSpot();
    // Filter parking spots to guarantee they are NOT near any petrol bunk
    const safeFree=free.filter(s=>!isNearFuelStation(s.x,s.z,42));
    if(safeFree.length)free=safeFree;
    
    if(!free.length){
      toast('⚠ No free parking spots right now — try again in a moment');
      document.getElementById('mis-hud').classList.remove('show');
      return;
    }
    free.sort((a,b)=>((a.x-Car.pos.x)**2+(a.z-Car.pos.z)**2)-((b.x-Car.pos.x)**2+(b.z-Car.pos.z)**2));
    const spot=free[Math.min(free.length-1,3)];
    mis.box={x:spot.x,z:spot.z,heading:spot.heading,halfW:2.5,halfL:3.9};
    spot.occupied=true;
    mis.reservedSpot=spot;
    W.dest={x:spot.x,z:spot.z};
    mis.stopT=0;mis.perfect=false;

    // Completely remove any invisible wall / collider blocking the parking bay or driveway entrance
    if(W.colliders&&W.colliders.length){
      W.colliders=W.colliders.filter(c=>{
        const cx=(c.x1+c.x2)/2,cz=(c.z1+c.z2)/2;
        return Math.hypot(cx-spot.x,cz-spot.z)>4.6;
      });
    }

    const boxMesh=mkParkBox(mis.box);scene.add(boxMesh);W.missionProps.push(boxMesh);
    mis.boxMesh=boxMesh;
  } else if(m.key==='obstacledodge'){
    const pts=pickSafePoints(1,48);
    const far=pts[0]||navNodeToWorld(NAV_HALF-1,NAV_HALF-1);
    const startPos={x:Car.pos.x,z:Car.pos.z};
    let out=planRoadRoute(Car.pos,far.x,far.z)||[far];
    let back=planRoadRoute(far,startPos.x,startPos.z)||[startPos];
    mis.checkpoints=[...out,...back.slice(1)];
    mis.idx=0;W.dest=mis.checkpoints[0];
    mis.hits=0;
    let courseLen=0;
    for(let k=1;k<mis.checkpoints.length;k++)courseLen+=Math.hypot(mis.checkpoints[k].x-mis.checkpoints[k-1].x,mis.checkpoints[k].z-mis.checkpoints[k-1].z);
    mis.timeLimit=clamp(courseLen/7.5,45,120);
    mis.cones=[];
    for(let k=1;k<mis.checkpoints.length;k++){
      const a=mis.checkpoints[k-1],b=mis.checkpoints[k];
      const segLen=Math.hypot(b.x-a.x,b.z-a.z);
      if(segLen<6)continue;
      const dx=(b.x-a.x)/segLen,dz=(b.z-a.z)/segLen;
      const px=-dz,pz=dx;
      const n=segLen>16?2:1;
      for(let c=1;c<=n;c++){
        const f=c/(n+1);
        const cx=a.x+dx*segLen*f,cz=a.z+dz*segLen*f;
        const side=Math.random()<.5?-1:1;
        const off=side*(CFG.roadW*.28+Math.random()*1.1);
        const cone=mkCone();cone.position.set(cx+px*off,0,cz+pz*off);
        scene.add(cone);W.missionProps.push(cone);
        mis.cones.push({mesh:cone,x:cx+px*off,z:cz+pz*off,hit:false});
      }
    }
  } else if(m.key==='checkpointrally'){
    mis.checkpoints=pickSafePoints(5,45);
    mis.idx=0;W.dest=mis.checkpoints[0];
    let courseLen=0;
    for(let k=1;k<mis.checkpoints.length;k++)courseLen+=Math.hypot(mis.checkpoints[k].x-mis.checkpoints[k-1].x,mis.checkpoints[k].z-mis.checkpoints[k-1].z);
    mis.timeLimit=clamp(courseLen/6.5,70,170);
    if(typeof mkCheckpointMarker==='function'){
      mis.checkpoints.forEach(cp=>{
        const cpMesh=mkCheckpointMarker(cp);
        scene.add(cpMesh);W.missionProps.push(cpMesh);
      });
    }
  } else if(m.key==='nightdrift'){
    W.tod=22;W.wx='rain';
    mis.driftPts=0;mis.targetPts=1500;
    const pts=pickSafePoints(1,48);
    mis.target=pts[0]||navNodeToWorld(NAV_HALF-1,NAV_HALF-1);
    W.dest=mis.target;
    mis.timeLimit=m.timeLimit||65;
    if(typeof mkFinishArch==='function'){
      const arch=mkFinishArch(mis.target);
      scene.add(arch);W.missionProps.push(arch);
    }
  } else if(m.key==='viprescue'){
    mis.vipHealth=100;mis.lastCol=W.collisionCount;
    mis.checkpoints=pickSafePoints(3,48);
    mis.idx=0;W.dest=mis.checkpoints[0];
    mis.timeLimit=m.timeLimit||85;
    if(typeof mkCheckpointMarker==='function'){
      mis.checkpoints.forEach(cp=>{
        const cpMesh=mkCheckpointMarker(cp);
        scene.add(cpMesh);W.missionProps.push(cpMesh);
      });
    }
  } else if(m.key==='ecofuel'){
    Car.fuel=22.0;
    // Eco charging haven destination far away from petrol stations
    const pts=pickSafePoints(1,55);
    mis.target={x:pts[0].x,z:pts[0].z};
    W.dest=mis.target;
    mis.timeLimit=m.timeLimit||75;
    if(typeof mkCheckpointMarker==='function'){
      const cpMesh=mkCheckpointMarker(mis.target);
      scene.add(cpMesh);W.missionProps.push(cpMesh);
    }
  } else if(m.key==='sensorcalib'){
    mis.checkpoints=pickSafePoints(4,45);
    mis.idx=0;W.dest=mis.checkpoints[0];
    mis.calibrated=0;mis.timeLimit=m.timeLimit||80;
    if(typeof mkCheckpointMarker==='function'){
      mis.checkpoints.forEach(cp=>{
        const cpMesh=mkCheckpointMarker(cp);
        scene.add(cpMesh);W.missionProps.push(cpMesh);
      });
    }
  } else if(m.key==='trafficweave'){
    mis.nearMisses=0;mis.targetNearMisses=8;mis.nearMissCooldown=0;
    const pts=pickSafePoints(1,48);
    mis.target=pts[0]||navNodeToWorld(NAV_HALF-1,NAV_HALF-1);
    W.dest=mis.target;
    mis.timeLimit=m.timeLimit||75;
    if(typeof mkFinishArch==='function'){
      const arch=mkFinishArch(mis.target);
      scene.add(arch);W.missionProps.push(arch);
    }
  } else if(m.key==='apexfinale'){
    mis.checkpoints=pickSafePoints(8,45);
    mis.idx=0;W.dest=mis.checkpoints[0];
    mis.timeLimit=m.timeLimit||140;
    if(typeof mkCheckpointMarker==='function'){
      mis.checkpoints.forEach((cp,ci)=>{
        if(ci===mis.checkpoints.length-1&&typeof mkFinishArch==='function'){
          const arch=mkFinishArch(cp);
          scene.add(arch);W.missionProps.push(arch);
        } else {
          const cpMesh=mkCheckpointMarker(cp);
          scene.add(cpMesh);W.missionProps.push(cpMesh);
        }
      });
    }
  }
  W.activeMission=mis;
  updateMissionHUD();
}
function updateMissionHUD(){
  const mis=W.activeMission;if(!mis)return;
  const m=MISSIONS[mis.index];
  const collisions=W.collisionCount-mis.collisionsStart;
  let txt=m.objective;
  if(m.key==='checkpointrally')txt=`Checkpoint ${mis.idx+1} of ${mis.checkpoints.length}`;
  else if(m.key==='obstacledodge')txt=`Course progress ${mis.idx}/${mis.checkpoints.length-1} · 🚧 ${mis.hits} hit${mis.hits===1?'':'s'}`;
  else if(m.key==='parkchallenge')txt='Pull fully inside the box and come to a stop';
  else if(m.key==='timetrial'){
    const best=missionState.bestTimes[mis.index];
    txt=best!=null?`Race to the finish — best: ${best.toFixed(1)}s`:'Race to the finish line';
  } else if(m.key==='nightdrift'){
    txt=`🌙 Drift Points: ${mis.driftPts}/${mis.targetPts} ${mis.driftPts>=mis.targetPts?'✓ Reach Finish!':''}`;
  } else if(m.key==='viprescue'){
    txt=`🚨 VIP Drop-off ${mis.idx+1}/3 · Health: ${Math.max(0,mis.vipHealth)}%`;
  } else if(m.key==='ecofuel'){
    txt=`⛽ Fuel Remaining: ${Car.fuel.toFixed(1)}% · Reach Gas Station!`;
  } else if(m.key==='sensorcalib'){
    const kmh=Math.round(Math.abs(Car.speed)*3.6);
    txt=`🤖 LiDAR Gate ${mis.idx+1}/4 · Speed: ${kmh} KM/H (Target: 40-65)`;
  } else if(m.key==='trafficweave'){
    txt=`⚡ Near-Misses: ${mis.nearMisses}/${mis.targetNearMisses} · Rush to Finish!`;
  } else if(m.key==='apexfinale'){
    txt=`👑 Apex Grand Tour: Checkpoint ${mis.idx+1}/${mis.checkpoints.length}`;
  }
  
  let pct=mis.progress*100;
  const tl=mis.timeLimit!=null?mis.timeLimit:m.timeLimit;
  if(tl>0){
    const left=Math.max(0,tl-mis.t);
    txt+=` — ${left.toFixed(0)}s left`;
    pct=clamp((mis.t/tl)*100,0,100);
  }
  document.getElementById('mis-obj').textContent=txt;
  document.getElementById('mis-prog').style.width=clamp(pct,0,100)+'%';
  document.getElementById('mis-sub').textContent=`⏱ ${mis.t.toFixed(0)}s · 💥 ${collisions} collision${collisions===1?'':'s'}`;
}
function scoreFor(mis,success){
  const collisions=W.collisionCount-mis.collisionsStart;
  let score=1000-collisions*120-Math.floor(mis.t)*1.5;
  if(mis.perfect)score+=150; // Perfect Park bonus
  if(mis.driftPts&&mis.driftPts>1500)score+=Math.min(250,Math.round((mis.driftPts-1500)*0.2));
  if(!success)score-=300;
  return clamp(Math.round(score),success?150:0,1000);
}
function perfLabel(score){
  if(score>=850)return'Excellent';
  if(score>=650)return'Good';
  if(score>=400)return'Fair';
  return'Needs Improvement';
}
function finishMission(success,reason){
  const mis=W.activeMission;if(!mis)return;
  const m=MISSIONS[mis.index];
  const collisions=W.collisionCount-mis.collisionsStart;
  const score=scoreFor(mis,success);
  document.getElementById('mis-hud').classList.remove('show');
  document.getElementById('ap-hud').classList.remove('show');
  const idx=mis.index,time=mis.t;
  const bonus=mis.perfect?'⭐ Perfect Park! ':(mis.isNewBest?'🏆 New Best Time! ':'');
  clearMissionProps();
  W.activeMission=null;W.dest=null;Car.aiDriving=false;W.ai.car=false;
  if(success){
    missionState.results[idx]={score,time,collisions,perf:perfLabel(score)};
    missionState.unlocked=Math.max(missionState.unlocked,idx+1);
    if(typeof renderMissionGrid==='function')renderMissionGrid();
    if(idx<MISSIONS.length-1)toast(`🎉 Mission ${idx+1} Complete! 🔓 Mission ${idx+2} Unlocked!`);
  }
  showMissionResult(success,m,score,time,collisions,reason,idx,bonus);
}
function showMissionResult(success,m,score,time,collisions,reason,index,bonus){
  appState='misend';
  if(typeof Aud!=='undefined'&&Aud.stopEngine)Aud.stopEngine();
  const isLast=index>=MISSIONS.length-1;
  document.getElementById('me-tag').textContent=success?'MISSION COMPLETE':'MISSION FAILED';
  document.getElementById('me-ttl').textContent=(success?'✅ ':'❌ ')+m.name;
  document.getElementById('me-score').textContent=score;
  document.getElementById('me-perf').textContent=success?(bonus||'')+perfLabel(score):(reason||'Give it another try');
  document.getElementById('me-time').textContent=time.toFixed(0)+'s';
  document.getElementById('me-col').textContent=collisions;
  document.getElementById('me-drv').textContent=perfLabel(score);
  const nextBtn=document.getElementById('me-next');
  nextBtn.style.display=success?'block':'none';
  nextBtn.textContent=isLast?'🏆 View Results':'Next Mission →';
  document.getElementById('me-retry').style.display=success?'none':'block';
  const el=document.getElementById('scr-misend');
  el.dataset.idx=index;el.dataset.last=isLast?'1':'0';
  el.classList.add('show');
}
function showCampaignComplete(){
  appState='campaign';
  const total=missionState.results.reduce((s,r)=>s+(r?r.score:0),0);
  const max=MISSIONS.length*1000;
  document.getElementById('cc-score').textContent=total;
  document.getElementById('cc-perf').textContent=perfLabel((total/max)*1000);
  document.getElementById('cc-list').innerHTML=MISSIONS.map((m,i)=>{
    const r=missionState.results[i];
    return `<div class="mp-row"><span>${m.icon} ${m.name}</span><span>${r?r.score+' · '+r.perf:'—'}</span></div>`;
  }).join('');
  document.getElementById('scr-campaign').classList.add('show');
}
// Replay list from the pause menu — locked missions can't be jumped to.
function showMissionSelect(){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:200;background:rgba(1,3,6,.94);display:flex;align-items:center;justify-content:center;pointer-events:all';
  const pnl=document.createElement('div');pnl.className='pm';pnl.style.maxWidth='520px';pnl.style.maxHeight='85vh';pnl.style.overflowY='auto';
  pnl.innerHTML=`<div class="pm-ttl">🎯 MISSION SELECT (10 MISSIONS)</div>`+
    MISSIONS.map((m,i)=>{
      const r=missionState.results[i];
      const locked=i>missionState.unlocked;
      return `<div class="pbtn${locked?' locked':''}" data-mi="${i}" style="text-align:left;pointer-events:all;margin-bottom:6px">
        <div>${r?'✅ ':locked?'🔒 ':'▶ '}<b>M${i+1}:</b> ${m.icon} ${m.name}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2em">${m.objective}${r?` · Score ${r.score} (${r.perf})`:''}</div>
      </div>`;
    }).join('')+
    `<div class="pbtn" data-mi="back" style="margin-top:.5em;pointer-events:all">← Back</div>`;
  pnl.addEventListener('click',e=>{
    const btn=e.target.closest('[data-mi]');if(!btn||btn.classList.contains('locked'))return;
    const mi=btn.dataset.mi;
    overlay.remove();
    if(mi==='back'){appState='driving';document.getElementById('c').focus();return;}
    openBriefing(+mi);
  });
  overlay.appendChild(pnl);document.body.appendChild(overlay);
}
function wireMissionUI(){
  wireModeSelect();
  document.getElementById('brief-start').onclick=()=>{
    document.getElementById('scr-brief').classList.remove('show');
    document.getElementById('hud').classList.add('show');
    appState='driving';document.getElementById('c').focus();
    beginMission(missionState.current);
  };
  document.getElementById('brief-exit').onclick=()=>returnToModeSelect();
  document.getElementById('me-next').onclick=()=>{
    const el=document.getElementById('scr-misend');
    const idx=+el.dataset.idx,last=el.dataset.last==='1';
    el.classList.remove('show');
    if(last)showCampaignComplete();else openBriefing(idx+1);
  };
  document.getElementById('me-retry').onclick=()=>{
    const el=document.getElementById('scr-misend');
    const idx=+el.dataset.idx;
    el.classList.remove('show');
    openBriefing(idx);
  };
  document.getElementById('me-exit').onclick=()=>returnToModeSelect();
  document.getElementById('cc-replay').onclick=()=>{
    document.getElementById('scr-campaign').classList.remove('show');
    startMissionMode(true);
  };
  document.getElementById('cc-free').onclick=()=>{
    document.getElementById('scr-campaign').classList.remove('show');
    gameMode='free';clearMissionProps();W.activeMission=null;document.getElementById('mis-hud').classList.remove('show');
    // Coming straight off a finished mission the car can still be
    // rolling (or under autopilot) — Free Mode must start stationary
    // and fully manual, same as every mission start already does.
    Car.reset();W.dest=null;W.ai.car=false;
    Inp.keys={};Inp.throttle=0;Inp.brake=0;Inp.steer=0;Inp.hand=false;
    TouchCtl.throttle=0;TouchCtl.brake=0;TouchCtl.steer=0;TouchCtl.hand=false;
    appState='driving';document.getElementById('c').focus();
    toast('🌆 Free Roam unlocked — explore the city!');
  };
  document.getElementById('go-restart').onclick=()=>{
    document.getElementById('scr-gameover').classList.remove('show');
    Car.reset();
    if(gameMode==='mission'&&missionState.current>=0){openBriefing(missionState.current);}
    else{appState='driving';document.getElementById('c').focus();toast('↺ New vehicle ready');}
  };
  document.getElementById('go-exit').onclick=()=>returnToModeSelect();
}
/* ─── PER-MISSION UPDATE (called every frame while a mission is active) ── */
function updateMission(dt){
  const mis=W.activeMission;if(!mis)return;
  mis.t+=dt;
  const m=MISSIONS[mis.index];
  const tl=mis.timeLimit!=null?mis.timeLimit:m.timeLimit;
  if(m.key==='timetrial'){
    const dx=mis.target.x-Car.pos.x,dz=mis.target.z-Car.pos.z;
    const dist=Math.hypot(dx,dz);
    mis.progress=clamp(mis.t/tl,0,1);
    if(dist<6){
      const best=missionState.bestTimes[mis.index];
      mis.isNewBest=best==null||mis.t<best;
      if(mis.isNewBest)missionState.bestTimes[mis.index]=mis.t;
      finishMission(true);return;
    }
    if(tl>0&&mis.t>tl){finishMission(false,'⏱ Time expired — try again');return;}
  } else if(m.key==='parkchallenge'){
    const box=mis.box;
    const distToBox=Math.hypot(Car.pos.x-box.x,Car.pos.z-box.z);
    mis.progress=clamp(1-distToBox/60,0,1);
    
    // Check if player car is inside the parking spot and stopped
    if(distToBox<3.8&&Math.abs(Car.speed)<0.8){
      mis.stopT+=dt;
      if(mis.stopT>0.4){
        mis.perfect=true;
        if(mis.reservedSpot)mis.reservedSpot.occupied=true;
        toast('🎉 PERFECT PARK! Mission 2 Complete!');
        finishMission(true);
        return;
      }
    } else {
      mis.stopT=0;
    }
  } else if(m.key==='obstacledodge'){
    const cp=mis.checkpoints[mis.idx];
    const dx=cp.x-Car.pos.x,dz=cp.z-Car.pos.z;
    if(Math.hypot(dx,dz)<10){
      mis.idx++;
      if(mis.idx>=mis.checkpoints.length){finishMission(true);return;}
      W.dest=mis.checkpoints[mis.idx];
    }
    mis.progress=mis.idx/(mis.checkpoints.length-1);
    for(const cone of mis.cones){
      if(cone.hit)continue;
      if(Math.hypot(cone.x-Car.pos.x,cone.z-Car.pos.z)<1.5){
        cone.hit=true;cone.mesh.visible=false;
        if(typeof spawnImpactFX==='function')spawnImpactFX({x:cone.x,y:0.4,z:cone.z},0xff6a1f,26,10,0.7,0.35);
        if(typeof Aud!=='undefined'&&Aud.crash)Aud.crash();
        finishMission(false,'💥 Obstacle hit! Course failed — avoid all cones');
        return;
      }
    }
    if(tl>0&&mis.t>tl){finishMission(false,'⏱ Time expired — try again');return;}
  } else if(m.key==='checkpointrally'){
    const cp=mis.checkpoints[mis.idx];
    const dx=cp.x-Car.pos.x,dz=cp.z-Car.pos.z;
    if(Math.hypot(dx,dz)<6){
      mis.idx++;
      if(mis.idx>=mis.checkpoints.length){finishMission(true);return;}
      W.dest=mis.checkpoints[mis.idx];
      toast(`✅ Checkpoint ${mis.idx}/${mis.checkpoints.length}`);
    }
    mis.progress=mis.idx/mis.checkpoints.length;
    if(tl>0&&mis.t>tl){finishMission(false,'⏱ Time expired — try again');return;}
  } else if(m.key==='nightdrift'){
    const isDrifting=Inp.hand||(Math.abs(Car.steer)>0.3&&Math.abs(Car.speed)>9);
    if(isDrifting){
      mis.driftPts+=Math.round(Math.abs(Car.speed)*2.2*dt*12);
      if(Math.random()<0.25&&typeof spawnImpactFX==='function'){
        spawnImpactFX({x:Car.pos.x,y:0.3,z:Car.pos.z},0x2ee6d6,8,3,0.3,0.15);
      }
    }
    const dist=Math.hypot(mis.target.x-Car.pos.x,mis.target.z-Car.pos.z);
    mis.progress=clamp(mis.driftPts/mis.targetPts,0,1);
    if(dist<7&&mis.driftPts>=mis.targetPts){
      toast('🏆 DRIFT KING! Target points achieved!');
      finishMission(true);return;
    }
    if(tl>0&&mis.t>tl){finishMission(false,mis.driftPts<mis.targetPts?'⏱ Drift target not met in time':'⏱ Time expired');return;}
  } else if(m.key==='viprescue'){
    const curCols=W.collisionCount;
    if(curCols>mis.lastCol){
      const diff=curCols-mis.lastCol;
      mis.lastCol=curCols;
      mis.vipHealth-=diff*25;
      toast(`💥 VIP Health: ${Math.max(0,mis.vipHealth)}%`);
      if(mis.vipHealth<=0){
        finishMission(false,'❌ VIP sustained critical damage from collisions!');return;
      }
    }
    const cp=mis.checkpoints[mis.idx];
    const dist=Math.hypot(cp.x-Car.pos.x,cp.z-Car.pos.z);
    if(dist<6.5){
      mis.idx++;
      if(mis.idx>=mis.checkpoints.length){
        toast('🚑 VIP Safely Delivered to all medical centers!');
        finishMission(true);return;
      }
      W.dest=mis.checkpoints[mis.idx];
      toast(`✅ VIP Drop-off ${mis.idx}/${mis.checkpoints.length} Complete!`);
    }
    mis.progress=mis.idx/mis.checkpoints.length;
    if(tl>0&&mis.t>tl){finishMission(false,'⏱ VIP delivery time expired');return;}
  } else if(m.key==='ecofuel'){
    Car.fuel=Math.max(0,Car.fuel-(0.12+Inp.throttle*0.48)*dt);
    if(Car.fuel<=0.05){
      Car.speed=Math.max(0,Car.speed-dt*8);
      finishMission(false,'⛽ Out of fuel before reaching the station!');return;
    }
    const dist=Math.hypot(mis.target.x-Car.pos.x,mis.target.z-Car.pos.z);
    mis.progress=clamp(1-dist/180,0,1);
    if(dist<8){
      toast('⛽ Gas Station reached with fuel to spare!');
      Car.fuel=100;finishMission(true);return;
    }
    if(tl>0&&mis.t>tl){finishMission(false,'⏱ Time expired');return;}
  } else if(m.key==='sensorcalib'){
    const cp=mis.checkpoints[mis.idx];
    const dist=Math.hypot(cp.x-Car.pos.x,cp.z-Car.pos.z);
    const kmh=Math.round(Math.abs(Car.speed)*3.6);
    if(dist<6.5){
      if(kmh>=35&&kmh<=70){
        mis.calibrated++;
        mis.idx++;
        toast(`🤖 Gate ${mis.calibrated}/4 Calibrated! (Speed: ${kmh} KM/H ✓)`);
        if(mis.idx>=mis.checkpoints.length){
          finishMission(true);return;
        }
        W.dest=mis.checkpoints[mis.idx];
      } else {
        toast(`⚠️ Calib Failed: ${kmh} KM/H! Must be between 40-65 KM/H!`);
      }
    }
    mis.progress=mis.idx/mis.checkpoints.length;
    if(tl>0&&mis.t>tl){finishMission(false,'⏱ Sensor diagnostic time expired');return;}
  } else if(m.key==='trafficweave'){
    mis.nearMissCooldown-=dt;
    if(mis.nearMissCooldown<=0&&Math.abs(Car.speed)>12&&W.aiCars){
      for(const ac of W.aiCars){
        const d=Math.hypot(ac.x-Car.pos.x,ac.z-Car.pos.z);
        if(d>1.8&&d<4.2){
          mis.nearMisses++;
          mis.nearMissCooldown=1.2;
          toast(`⚡ NEAR MISS! (${mis.nearMisses}/${mis.targetNearMisses})`);
          if(typeof spawnImpactFX==='function')spawnImpactFX({x:Car.pos.x,y:0.8,z:Car.pos.z},0xffb020,16,5,0.4,0.2);
          break;
        }
      }
    }
    const dist=Math.hypot(mis.target.x-Car.pos.x,mis.target.z-Car.pos.z);
    mis.progress=clamp(mis.nearMisses/mis.targetNearMisses,0,1);
    if(dist<7&&mis.nearMisses>=mis.targetNearMisses){
      toast('🏆 TRAFFIC WEAVE MASTER! Target near-misses hit!');
      finishMission(true);return;
    }
    if(tl>0&&mis.t>tl){finishMission(false,mis.nearMisses<mis.targetNearMisses?'⏱ Near-miss quota not reached in time':'⏱ Time expired');return;}
  } else if(m.key==='apexfinale'){
    const cp=mis.checkpoints[mis.idx];
    const dx=cp.x-Car.pos.x,dz=cp.z-Car.pos.z;
    if(Math.hypot(dx,dz)<7){
      mis.idx++;
      if(mis.idx>=mis.checkpoints.length){
        toast('👑 KING OF NEXUS CITY! GRAND CHAMPION!');
        if(typeof spawnImpactFX==='function')spawnImpactFX({x:Car.pos.x,y:3,z:Car.pos.z},0xffcc00,60,18,1.6,0.5);
        finishMission(true);return;
      }
      W.dest=mis.checkpoints[mis.idx];
      toast(`🚩 Grand Tour Sector ${mis.idx}/${mis.checkpoints.length} Cleared!`);
    }
    mis.progress=mis.idx/mis.checkpoints.length;
    if(tl>0&&mis.t>tl){finishMission(false,'⏱ Grand Tour time limit expired');return;}
  }
  updateMissionHUD();
}

