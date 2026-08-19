"use strict";
/* ─── MANUAL GEARBOX DATA ────────────────────────────────────────
   Five forward gears. `max` is each gear's top speed in the game's
   internal speed units (internal-unit * 3.6 = km/h), so these line
   up with the requested real-world targets:
     1st ≈35 km/h · 2nd ≈70 km/h · 3rd ≈100 km/h · 4th ≈130 km/h · 5th ≈165 km/h
   `accel` is how hard that gear pulls (internal-units/s² at full
   throttle) — short/low gears punch harder but run out of road fast,
   tall/high gears pull weaker but carry on to a higher top speed,
   same trade-off a real manual box has. Holding a gear at full
   throttle asymptotically approaches `max` and then simply stops
   gaining speed there (rev limiter) instead of ever creeping into
   the next gear's speed range. ────────────────────────────────── */
const GEAR_DATA=[
  {max:35/3.6, accel:6.9}, // 1st
  {max:70/3.6, accel:5.0}, // 2nd
  {max:100/3.6,accel:3.6}, // 3rd
  {max:130/3.6,accel:2.5}, // 4th
  {max:165/3.6,accel:1.7}, // 5th
];
function gearData(g){return GEAR_DATA[clamp((g|0)-1,0,GEAR_DATA.length-1)];}
// RPM as a 0-100 gauge percentage: idles a bit above zero like a real
// tach, climbs toward 100 (redline) as speed nears *this gear's* top
// speed — so the same road speed reads at very different RPM depending
// on which gear you're in, and shifting instantly re-reads the gauge
// against the new gear without any speed actually changing.
const IDLE_RPM_PCT=14;
function gearRPMPct(g,speedAbsUnits){
  const gd=gearData(g);
  const ratio=clamp(speedAbsUnits/gd.max,0,1.22); // small overshoot = over-rev if downshifted while still fast
  return IDLE_RPM_PCT+ratio*(100-IDLE_RPM_PCT);
}
const SHIFT_CUT_DUR=.22; // seconds the engine sound "unloads" during a gear change

/* ─── CAR CONTROLLER ─────────────────────────────────────────── */
const Car={
  pos:new THREE.Vector3(CFG.spawnX,0,CFG.spawnZ),
  heading:0,speed:0,steer:0,wheelSpin:0,
  fuel:100,value:100,driveT:0,collisionsAtReset:0,bodyRoll:0,bodyPitch:0,mesh:null,
  gear:1, // manual gear, 1-5 — shifted with Digit1 (up) / Digit2 (down); each gear
  // has its own top speed and accel via GEAR_DATA, and drives RPM + engine pitch
  _shiftT:0, // >0 for a brief window right after a gear change — engine sound "unloads"
  isDrifting:false,driftVel:new THREE.Vector3(),driftSmokeT:0,_wasBraking:false,_wasReversing:false,
  autoPark:null,aiDriving:false,_destPath:null,_destState:null,_destKey:null,
  reset(){this.pos.set(CFG.spawnX,0,CFG.spawnZ);this.heading=0;this.speed=0;this.steer=0;this.fuel=100;this.value=100;this.driveT=0;this.collisionsAtReset=W.collisionCount;this.autoPark=null;this.aiDriving=false;this._destPath=null;this._destState=null;this._destKey=null;this.driftVel.set(0,0,0);this.isDrifting=false;this.gear=1;this._shiftT=0;if(this._wasBraking)Aud.brakeStop();this._wasBraking=false;if(this._wasDrifting)Aud.screechStop();this._wasDrifting=false;if(this._wasReversing)Aud.reverseStop();this._wasReversing=false;},
  update(dt){
    if(this.autoPark){this._doAP(dt);return;}
    if(this.aiDriving){this._doAI(dt);return;}
    if(activeVeh!=='car')return; // parked and waiting
    const I=Inp;
    if(this._shiftT>0)this._shiftT=Math.max(0,this._shiftT-dt);
    // throttle — pull is gear-dependent (GEAR_DATA) and capped at this
    // gear's own top speed, like a real manual car bumping its rev
    // limiter: hold the throttle as long as you want in 1st and it will
    // not creep into 2nd-gear speeds on its own, it just sits at redline.
    if(I.throttle>.01){
      if(this.speed>=0||Math.abs(this.speed)<.18){
        const gd=gearData(this.gear);
        if(this.speed<gd.max)this.speed=Math.min(gd.max,this.speed+gd.accel*I.throttle*dt);
        this.fuel=Math.max(0,this.fuel-dt*.28*I.throttle);
      }
      else this.speed+=22*I.throttle*dt;
    }
    // engine braking / over-rev correction — if the car is going faster
    // than the *current* gear's rated top speed (e.g. just downshifted
    // while still rolling fast), a real manual engine drags the car back
    // down toward that gear's range instead of holding the extra speed.
    {
      const gdCur=gearData(this.gear);
      if(Math.abs(this.speed)>gdCur.max){
        const over=Math.abs(this.speed)-gdCur.max;
        this.speed-=Math.sign(this.speed)*Math.min(over,dt*(3+over*2.4));
      }
    }
    // brake/reverse
    if(I.brake>.01){
      if(this.speed>.18)this.speed-=26*I.brake*dt;
      else this.speed-=9*I.brake*dt;
    }
    // handbrake / drift: turn hard while holding space at speed and the
    // rear breaks traction — the car slides instead of just grinding to a
    // stop, heading swings faster, and it kicks sideways with tire smoke.
    // Straight-line space still just brakes hard like before.
    this.isDrifting=I.hand&&Math.abs(this.speed)>2.2&&Math.abs(I.steer)>.08;
    if(this.isDrifting&&!this._wasDrifting)Aud.screechStart();
    if(!this.isDrifting&&this._wasDrifting)Aud.screechStop();
    if(this.isDrifting){
      // blend of road speed and actual lateral slide velocity (from last
      // frame's driftVel) — reads as how hard the tires are working, not
      // just how fast the car happens to be going
      const slideAmt=clamp(this.driftVel.length()/9,0,1);
      Aud.screechSet(clamp(Math.abs(this.speed)/24*.55+slideAmt*.75,0,1));
    }
    this._wasDrifting=this.isDrifting;
    // firm brake squeal — only for a real, non-drift stop at real speed;
    // light taps and low-speed creeping stay silent like a real car
    // Only a real forward stop counts as "hard braking" (tire squeal) —
    // speed<0 means the car is already reversing, which gets its own
    // distinct reverse sound below instead, so the two never overlap.
    const hardBraking=I.brake>.15&&!this.isDrifting&&this.speed>2;
    if(hardBraking&&!this._wasBraking)Aud.brakeStart();
    if(!hardBraking&&this._wasBraking)Aud.brakeStop();
    if(hardBraking)Aud.brakeSet(clamp(I.brake*Math.min(1,this.speed/14),0,1));
    this._wasBraking=hardBraking;
    // reverse: distinct backup sound, only while actually rolling backward
    // and not mid-drift (drift screech takes priority so the two audio
    // layers never fight for the same moment).
    const reversing=this.speed<-.3&&!this.isDrifting;
    if(reversing&&!this._wasReversing)Aud.reverseStart();
    if(!reversing&&this._wasReversing)Aud.reverseStop();
    if(reversing)Aud.reverseSet(clamp(Math.abs(this.speed)/10,0,1));
    this._wasReversing=reversing;
    if(I.hand){
      if(this.isDrifting)this.speed=lerp(this.speed,this.speed*.9,Math.min(1,dt*3));
      else this.speed=lerp(this.speed,0,Math.min(1,dt*7));
    }
    // friction
    if(I.throttle<.01&&I.brake<.01){const f=4.2*dt;if(Math.abs(this.speed)<f)this.speed=0;else this.speed-=Math.sign(this.speed)*f;}
    this.speed=clamp(this.speed,-10,GEAR_DATA[GEAR_DATA.length-1].max);
    if(this.fuel<=0)this.speed=lerp(this.speed,0,dt*.8);
    // STEERING: A=-1→left, D=+1→right
    const tgtSteer=I.steer*.56;
    this.steer=lerp(this.steer,tgtSteer,dt*9);
    const sf=clamp(Math.abs(this.speed)/7,0,1);
    const td=this.speed>=0?1:-1;
    const driftBoost=this.isDrifting?3.1:1; // tail swings out faster mid-drift
    // With this chase-cam setup (forward=+Z, up=+Y), on-screen "right" is
    // world -X — so a right turn (D) needs heading to DECREASE, not
    // increase. (A previous attempt flipped this to '+=' based on a bad
    // derivation and made D go left / A go right — confirmed backwards
    // by real testing. Reverted to '-=', which is correct.)
    this.heading-=this.steer*sf*td*dt*1.95*driftBoost;
    // move
    const dx=Math.sin(this.heading)*this.speed*dt;
    const dz=Math.cos(this.heading)*this.speed*dt;
    const preImpactSpeed=this.speed;
    // Collision was only ever tested against the car's *center* point
    // (with a small r=1.05 radius) — but the body extends ~2.2 units
    // ahead of center, so the front bumper could plow deep into a wall
    // or parked car before the center point got close enough to trigger
    // a hit. Offset the test point to the leading edge of the car (the
    // nose while moving forward, the tail while reversing) so contact
    // registers right as the bumper touches, not a car-length later.
    const fwdX=Math.sin(this.heading),fwdZ=Math.cos(this.heading);
    const dirSign=this.speed>=0?1:-1;
    const noseLen=2.25,noseR=1.05;
    const hitX=hits(this.pos.x+dx+fwdX*noseLen*dirSign,this.pos.z+fwdZ*noseLen*dirSign,noseR);
    if(!hitX){this.pos.x+=dx;}else{this.speed*=-.1;triggerImpact(preImpactSpeed,{x:this.pos.x+Math.sign(dx||1)*1.2,y:.7,z:this.pos.z},hitX.kind);}
    const hitZ=hits(this.pos.x+fwdX*noseLen*dirSign,this.pos.z+dz+fwdZ*noseLen*dirSign,noseR);
    if(!hitZ){this.pos.z+=dz;}else{this.speed*=-.1;triggerImpact(preImpactSpeed,{x:this.pos.x,y:.7,z:this.pos.z+Math.sign(dz||1)*1.2},hitZ.kind);}
    // drift: sideways slide that builds up while drifting and bleeds off
    // via grip once you're not, plus tire-smoke puffs off the rear.
    if(this.isDrifting){
      const rgtX=Math.cos(this.heading),rgtZ=-Math.sin(this.heading);
      const fwdX=Math.sin(this.heading),fwdZ=Math.cos(this.heading);
      const kick=this.steer*Math.abs(this.speed)*1.95*dt;
      this.driftVel.x+=rgtX*kick;this.driftVel.z+=rgtZ*kick;
      this.driftSmokeT=(this.driftSmokeT||0)-dt;
      if(this.driftSmokeT<=0){
        this.driftSmokeT=.04;
        const rx=this.pos.x-fwdX*1.5,rz=this.pos.z-fwdZ*1.5;
        spawnImpactFX({x:rx,y:.25,z:rz},0xcfcfcf,8,2.1,.75,.32);
        // skid marks left behind by both rear wheels
        [-0.96,0.96].forEach(lx=>{
          const wx=this.pos.x+rgtX*lx+fwdX*(-1.35);
          const wz=this.pos.z+rgtZ*lx+fwdZ*(-1.35);
          layDownSkid(wx,wz,this.heading);
        });
      }
    }
    this.driftVel.multiplyScalar(Math.max(0,1-dt*2.2)); // grip recovers once off the handbrake/turn
    const dvx=this.driftVel.x*dt,dvz=this.driftVel.z*dt;
    if(!hits(this.pos.x+dvx,this.pos.z))this.pos.x+=dvx;
    if(!hits(this.pos.x,this.pos.z+dvz))this.pos.z+=dvz;
    // pedestrians & moving traffic don't sit in the static collider grid
    // (that only holds buildings/parked cars/boundary), so they need their
    // own hit checks — otherwise the car just glides straight through them.
    this._checkPedHits();
    this._checkVehicleHits();
    // visuals
    this.bodyRoll=lerp(this.bodyRoll,this.steer*sf*.3,dt*6);
    this.bodyPitch=lerp(this.bodyPitch,clamp(-this.speed*.009,-.055,.055),dt*4);
    this.wheelSpin+=this.speed*dt*1.5;
    this._applyMesh();
    // ADAS checks
    this._adas(dt);
  },
  _applyMesh(){
    if(!this.mesh)return;
    this.mesh.position.set(this.pos.x,0,this.pos.z);
    this.mesh.rotation.set(this.bodyPitch,this.heading,this.bodyRoll);
    this.mesh.userData.wheels?.forEach(w=>w.children[0].rotation.x=this.wheelSpin);
    this.mesh.userData.front?.forEach(w=>w.rotation.y=-this.steer*.52);
  },
  _checkPedHits(){
    if(Math.abs(this.speed)<1.2)return;
    // use the car's actual forward/side box (not just distance from its
    // center) so a hit at the front bumper or a side-swipe registers
    // immediately — a plain "distance from center" check was missing most
    // real hits because the car body is ~4.4 units long.
    const fwdX=Math.sin(this.heading),fwdZ=Math.cos(this.heading);
    const rgtX=Math.cos(this.heading),rgtZ=-Math.sin(this.heading);
    const halfLen=2.5,halfWid=1.3; // slightly bigger than the mesh so a graze still counts
    W.peds.forEach(p=>{
      if(p.hitT>0||p.downT>0)return; // already reeling from a hit
      const rx=p.mesh.position.x-this.pos.x,rz=p.mesh.position.z-this.pos.z;
      const along=rx*fwdX+rz*fwdZ,side=rx*rgtX+rz*rgtZ;
      if(Math.abs(along)>halfLen||Math.abs(side)>halfWid)return;
      const dist=Math.hypot(rx,rz)||.01,nx=rx/dist,nz=rz/dist;
      const force=clamp(Math.abs(this.speed)*.95,3,13);
      p.hitVel.set(nx*force,force*.34+2.4,nz*force);
      p.hitT=.5;p.spin=rand(6,11)*(Math.random()<.5?-1:1);
      this.speed*=.72; // a person slows the car, doesn't stop it dead like a wall
      triggerImpact(Math.abs(this.speed)*1.4,{x:p.mesh.position.x,y:.9,z:p.mesh.position.z},'ped');
    });
  },
  _checkVehicleHits(){
    const fwdX=Math.sin(this.heading),fwdZ=Math.cos(this.heading);
    const rgtX=Math.cos(this.heading),rgtZ=-Math.sin(this.heading);
    const halfLen=3.3,halfWid=1.9; // player half-size + padding for the AI car's own footprint
    W.aiCars.forEach(ai=>{
      const rx=ai.mesh.position.x-this.pos.x,rz=ai.mesh.position.z-this.pos.z;
      const along=rx*fwdX+rz*fwdZ,side=rx*rgtX+rz*rgtZ;
      if(Math.abs(along)>halfLen||Math.abs(side)>halfWid)return;
      const dist=Math.hypot(rx,rz)||.01,nx=rx/dist,nz=rz/dist;
      const relSpeed=Math.abs(this.speed);
      // Always separate the two cars, even while the AI car is still
      // "reeling" from a very recent hit. Previously this entire block
      // was skipped for ~0.3-0.6s after an impact (ai.waitT>1.4), which
      // let the player's car glide straight through / visually sink into
      // a just-hit AI car with zero resistance — that's the "car goes
      // inside the other car" bug.
      const wasFresh=ai.waitT<=1.4; // only re-fire full impact FX/audio once per hit
      const overlapLen=halfLen-Math.abs(along),overlapWid=halfWid-Math.abs(side);
      // Resolve the *full* overlap every frame (not a fraction of it) —
      // splitting only ~90% of it between the two cars, scaled further by
      // a speed-clamped push, could fall behind a fast-closing player and
      // let the car visually sink into the AI car for a few frames before
      // catching up. Fully separating them each frame prevents that.
      const sep=Math.max(.05,Math.min(overlapLen,overlapWid));
      const push=Math.max(sep*.85,clamp(relSpeed*.22,1,4.2))*(wasFresh?1:.6);
      ai.mesh.position.x+=nx*push;ai.mesh.position.z+=nz*push;
      this.pos.x-=nx*Math.max(sep*.6,.5);
      this.pos.z-=nz*Math.max(sep*.6,.5);
      if(wasFresh&&relSpeed>1.6){
        ai.mesh.rotation.y+=rand(-1.7,1.7);
        ai.waitT=Math.max(ai.waitT,1.1+Math.random()*.6);
        this.speed*=-.32;
        this.heading+=rand(-.18,.18);
        triggerImpact(relSpeed*1.2,{x:this.pos.x+nx*1.3,y:.65,z:this.pos.z+nz*1.3},'car');
      } else if(relSpeed>0.3){
        // gentle contact (low speed, or AI car still reeling): just resist
        // further push-in, don't re-trigger impact FX/sound every frame
        this.speed*=.85;
      }
    });
  },
  _adas(dt){
    // AEB — front collision
    if(W.adas.aeb&&this.speed>2){
      const fx=this.pos.x+Math.sin(this.heading)*2.6;
      const fz=this.pos.z+Math.cos(this.heading)*2.6;
      if(hits(fx,fz,.9)){this.speed=lerp(this.speed,0,.08);toast('⚠ AEB Active');}
    }
    // Pedestrian detection
    if(W.adas.aeb)W.peds.forEach(p=>{const dx=p.mesh.position.x-this.pos.x,dz=p.mesh.position.z-this.pos.z;if(dx*dx+dz*dz<10&&this.speed>1){this.speed=lerp(this.speed,0,.07);toast('⚠ Pedestrian!');}});
    // LKA: nudge back if straying too far from road centre
    // BSM: detect adjacent AI cars
    if(W.adas.bsm){
      const bsmArc=new THREE.Vector3(Math.sin(this.heading+Math.PI/2),0,Math.cos(this.heading+Math.PI/2));
      W.aiCars.forEach(ai=>{const dx=ai.mesh.position.x-this.pos.x,dz=ai.mesh.position.z-this.pos.z;if(dx*dx+dz*dz<14)setADASWarn('bsm');});
    }
  },
  // ── AI Auto-Park: A*-routed drive to the spot, then a real parking
  //    maneuver (forward or reverse, matching the spot's orientation) ──
  _doAP(dt){
    const ap=this.autoPark;if(!ap)return;
    if(ap.phase==='maneuver'){
      // 360-degree sensor sweep during parking maneuver
      const dangerR2=4.5*4.5;
      let danger=false;
      for(const ai of W.aiCars){
        if(ai===this)continue;
        const ddx=ai.mesh.position.x-this.pos.x,ddz=ai.mesh.position.z-this.pos.z;
        if(ddx*ddx+ddz*ddz<dangerR2){danger=true;break;}
      }
      if(!danger)for(const p of W.peds){
        const ddx=p.mesh.position.x-this.pos.x,ddz=p.mesh.position.z-this.pos.z;
        if(ddx*ddx+ddz*ddz<dangerR2){danger=true;break;}
      }
      
      if(danger){
        this.speed=lerp(this.speed,0,dt*9);
        this._applyMesh();
        if(!ap._holding){ap._holding=true;toast('⚠ ADAS: Obstacle detected — auto-park holding');}
        return;
      }
      if(ap._holding){ap._holding=false;toast('🅿 ADAS: Path clear — docking…');}
      
      ap.maneuverT=(ap.maneuverT||0)+dt/2.6;
      const t=clamp(ap.maneuverT,0,1);
      
      // Smooth S-curve easing
      const e=t*t*(3-2*t);
      
      // Step 1 (first 35%): Turn and lock heading directly onto spot heading
      // Step 2 (35% to 100%): Pull straight into the parking bay center
      this.heading=lerp(this.heading,ap.spot.heading,Math.min(1,dt*6));
      
      // Move directly toward parking slot center (X and Z)
      this.pos.x=lerp(this.pos.x,ap.spot.x,Math.min(1,dt*3.5));
      this.pos.z=lerp(this.pos.z,ap.spot.z,Math.min(1,dt*3.5));
      
      this.speed=lerp(this.speed,0,dt*4);
      this._applyMesh();
      
      const distRemain=Math.hypot(this.pos.x-ap.spot.x,this.pos.z-ap.spot.z);
      if(t>=1||distRemain<0.35){
        this.pos.set(ap.spot.x,0,ap.spot.z);
        this.heading=ap.spot.heading;
        this.speed=0;
        this._applyMesh();
        ap.spot.occupied=true;
        this.autoPark=null;
        toast('🅿 PERFECT AUTO-PARK COMPLETE!');
        document.getElementById('ap-hud').classList.remove('show');
      }
      return;
    }
    const status=followRoadPath(this,dt,ap.path,ap,2.5,true);
    if(status==='arrived'){
      ap.phase='maneuver';ap.maneuverT=0;toast('🅿 Executing parking maneuver…');
    } else if(status==='blocked-replan'){
      ap.totalAttempts=(ap.totalAttempts||0)+1;
      if(ap.totalAttempts>7){
        toast('⚠ Could not reach a parking spot — try again in a moment');
        this.autoPark=null;this.speed=0;
        document.getElementById('ap-hud').classList.remove('show');
        return;
      }
      ap.replans=(ap.replans||0)+1;
      if(ap.replans>2){
        const free=W.parkSpots.filter(s=>!s.occupied&&s!==ap.spot);
        free.sort((a,b)=>((a.x-this.pos.x)**2+(a.z-this.pos.z)**2)-((b.x-this.pos.x)**2+(b.z-this.pos.z)**2));
        const alt=free[0];
        const np=alt&&planParkingRoute(this.pos,alt);
        if(np){ap.spot=alt;ap.path=np;ap.idx=0;ap.replans=0;toast('🅿 Spot unreachable — trying a different space…');}
        else toast('⚠ No reachable parking spot found');
      } else {
        const np=planParkingRoute(this.pos,ap.spot);
        if(np){ap.path=np;ap.idx=0;toast('🔄 Road blocked — recalculating route…');}
        else toast('⚠ No alternate route — waiting for road to clear…');
      }
    }
  },
  // ── General AI destination driving (map clicks w/ autopilot, Z key,
  //    fuel navigation, mission autopilot) — same road-network router ──
  _doAI(dt){
    if(!W.dest){this._destPath=null;this._destKey=null;return;}
    const dk=W.dest.x+','+W.dest.z;
    if(this._destKey!==dk){this._destKey=dk;this._destPath=null;}
    if(!this._destPath){
      this._destPath=planRoadRoute(this.pos,W.dest.x,W.dest.z);
      this._destState={idx:0,stuckT:0};
      if(!this._destPath){toast('⚠ No route found to destination');this.aiDriving=false;W.dest=null;return;}
    }
    const status=followRoadPath(this,dt,this._destPath,this._destState);
    if(status==='arrived'){
      W.dest=null;this.aiDriving=false;this._destPath=null;toast('✅ AI reached destination');
    } else if(status==='blocked-replan'){
      this._destPath=planRoadRoute(this.pos,W.dest.x,W.dest.z);
      this._destState={idx:0,stuckT:0};
      if(!this._destPath){toast('⚠ Route blocked — no alternative found');this.aiDriving=false;W.dest=null;}
      else toast('🔄 Recalculating route…');
    }
  },
  startAP(){
    const free=W.parkSpots.filter(s=>!s.occupied);
    if(!free.length){toast('No free parking spots');return;}
    free.sort((a,b)=>((a.x-this.pos.x)**2+(a.z-this.pos.z)**2)-((b.x-this.pos.x)**2+(b.z-this.pos.z)**2));
    const spot=free[0];
    const path=planParkingRoute(this.pos,spot);
    if(!path){toast('⚠ No valid road route to that spot');return;}
    this.aiDriving=false;W.dest=null;W.ai.car=false;
    this.autoPark={spot,path,idx:0,phase:'drive',maneuverT:0,stuckT:0};
    toast('🅿 AI Auto-Parking engaged — route locked');
    document.getElementById('ap-hud').classList.add('show');
  },
  navToFuel(){
    if(!W.fuelPts.length){toast('No fuel stations found');return;}
    const f=W.fuelPts[0];
    W.dest={x:f.x,z:f.z};this._destKey=null;this._destPath=null;
    W.ai.car=true;this.aiDriving=true;
    toast('⛽ Navigating to fuel station…');
  },
};

