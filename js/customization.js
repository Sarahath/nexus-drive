"use strict";
/* ─── CUSTOMIZATION SCREEN ───────────────────────────────────── */
let CU={
  car:{
    cats:{
      'Paint & Color':null,'Body Kit':null,'Bumpers':null,
      'Spoiler':null,'Wheels & Tires':null,'Suspension':null,
      'Lighting':null,'Performance':null,'Interior':null,'Electronics':null,
    },
    opts:{
      'Paint & Color':['Base Color','Metallic','Matte','Carbon Fiber','Vinyl Wrap','Pearl','Chrome','Racing Stripe'],
      'Body Kit':['Stock','Sport','Aero+','Wide Body','Race Kit','Lowrider','Lifted','GT'],
      'Bumpers':['Stock','Sport Front','Splitter','Diffuser','Tow Hook'],
      'Spoiler':['None','Lip','Duck Tail','GT Wing','Roof','Shark Fin'],
      'Wheels & Tires':['Stock 18"','Sport 20"','Race Slick','Off-Road','Low-Pro 22"','Forged'],
      'Suspension':['Stock','Sport -20mm','Race -40mm','Air Ride','Hydraulic','Lifted'],
      'Lighting':['Stock','Full LED','DRL Strip','Underglow','Ambient Int.','Laser Beam'],
      'Performance':['Stock','Sport Tune','Turbo Kit','Full Race','Hybrid','Electric'],
      'Interior':['Stock','Sport Seats','Carbon Dash','Racing Cage','Premium','Minimal'],
      'Electronics':['Basic','Navigation','AI Assist','Full ADAS','Autonomous Kit'],
    },
    stats:{Speed:72,Accel:65,Handling:70,Brake:68,'Fuel Eff.':75},
    chips:['Sport Mode','Launch Control','AI Co-Pilot','ADAS Suite','Night Vision','360° Camera','Auto-Park','Lane Assist'],
  },
};

let cuType='car',cuScene,cuCam,cuRend,cuCar,cuTheta=.45,cuRAF;
const cuState={carCol:CAR_PAL[0],sels:{}};

function buildCuPreview(){
  const cv=document.getElementById('cu-canvas');
  if(cuRend)cuRend.dispose();
  cuRend=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});
  cuRend.setPixelRatio(Math.min(devicePixelRatio,2));
  cuRend.shadowMap.enabled=true;cuRend.toneMapping=THREE.ACESFilmicToneMapping;cuRend.toneMappingExposure=1.12;
  cuScene=new THREE.Scene();cuScene.background=new THREE.Color(.03,.05,.09);
  cuCam=new THREE.PerspectiveCamera(38,1,.1,60);cuCam.position.set(5,2.6,7);cuCam.lookAt(0,.55,0);
  cuScene.add(new THREE.AmbientLight(0x334455,.5));
  const kl=new THREE.SpotLight(0xffffff,3.2,30,Math.PI/6,.4,1.2);kl.position.set(6,8,4);kl.castShadow=true;cuScene.add(kl,kl.target);
  const rl=new THREE.SpotLight(0x2ee6d6,4,28,Math.PI/5,.5);rl.position.set(-7,4,-6);cuScene.add(rl,rl.target);
  cuScene.add(new THREE.HemisphereLight(0x88aaff,0x111111,.4));
  const fl=new THREE.Mesh(new THREE.CircleGeometry(14,56),new THREE.MeshLambertMaterial({color:0x0c1217,metalness:.58,roughness:.16}));
  fl.rotation.x=-Math.PI/2;fl.receiveShadow=true;cuScene.add(fl);
  for(let r=1.5;r<14;r+=2.2){const rg=new THREE.Mesh(new THREE.RingGeometry(r,r+.016,60),new THREE.MeshBasicMaterial({color:0x2ee6d6,transparent:true,opacity:.06,side:THREE.DoubleSide}));rg.rotation.x=-Math.PI/2;rg.position.y=.003;cuScene.add(rg);}
  cuCar=mkCar(cuState.carCol);cuScene.add(cuCar);
  resizeCu();cancelAnimationFrame(cuRAF);animCu();
}
function resizeCu(){
  const cv=document.getElementById('cu-canvas');const p=cv.parentElement;
  const w=p.clientWidth||250,h=p.clientHeight-150||240;
  if(cuRend){cuRend.setSize(w,Math.max(h,180));if(cuCam){cuCam.aspect=w/Math.max(h,180);cuCam.updateProjectionMatrix();}}
}
function animCu(){cuRAF=requestAnimationFrame(animCu);if(appState!=='custom')return;cuTheta+=.007;
  if(cuCar)cuCar.rotation.y=cuTheta;
  if(cuRend&&cuScene&&cuCam)cuRend.render(cuScene,cuCam);}

function showCuType(type){
  cuType=type;
  const d=CU[type];
  document.getElementById('cu-vn').textContent='Vantis GT-R';
  document.getElementById('cu-vtag').textContent='Prototype · Smart City Edition';
  if(cuCar)cuCar.visible=true;
  // sidebar
  const side=document.getElementById('cu-side');side.innerHTML='';
  Object.keys(d.cats).forEach((cat,i)=>{
    const el=document.createElement('div');el.className='cu-cat'+(i===0?' on':'');el.textContent=cat;
    el.onclick=()=>{document.querySelectorAll('.cu-cat').forEach(c=>c.classList.remove('on'));el.classList.add('on');showCuSection(type,cat);};
    side.appendChild(el);
  });
  showCuSection(type,Object.keys(d.cats)[0]);
  updateCuStats(type);buildCuChips(type);buildCuColors(type);
}
function showCuSection(type,cat){
  const main=document.getElementById('cu-main');main.innerHTML=`<div class="cu-stitle">${cat}</div>`;
  if(cat==='Paint & Color'){
    const palette=CAR_PAL;
    const sw=document.createElement('div');sw.className='swatches';
    palette.forEach(c=>{
      const el=document.createElement('div');el.className='sw';
      const active=c===cuState.carCol;
      if(active)el.classList.add('on');
      el.style.background='#'+c.toString(16).padStart(6,'0');
      el.onclick=()=>{
        sw.querySelectorAll('.sw').forEach(s=>s.classList.remove('on'));el.classList.add('on');
        cuState.carCol=c;cuCar?.userData.setCol(c);
        updateCuStats(type);
      };
      sw.appendChild(el);
    });
    main.appendChild(sw);
    // finish
    ['Metalness','Roughness','Clearcoat'].forEach(l=>{
      const r=document.createElement('div');r.className='sl-row';
      r.innerHTML=`<label>${l}<span>50</span></label><input type="range" min="0" max="100" value="50">`;
      r.querySelector('input').oninput=e=>{r.querySelector('span').textContent=e.target.value;
        if(cuCar&&l!=='Clearcoat')cuCar.userData.pM[l==='Metalness'?'metalness':'roughness']=parseInt(e.target.value)/100;};
      main.appendChild(r);
    });
  } else {
    const opts=CU[type].opts[cat]||[];
    const grid=document.createElement('div');grid.className='cu-grid';
    const icons='🏎⚡🛡💨🔧⚙🎨💡📡🎯🔬🌐📷🔋'.split('');
    opts.forEach((opt,i)=>{
      const el=document.createElement('div');el.className='cu-opt';
      if(!cuState.sels[cat]&&i===0)el.classList.add('on');if(cuState.sels[cat]===opt)el.classList.add('on');
      el.innerHTML=`<span class="ico">${icons[i%icons.length]}</span>${opt}`;
      el.onclick=()=>{grid.querySelectorAll('.cu-opt').forEach(o=>o.classList.remove('on'));el.classList.add('on');cuState.sels[cat]=opt;updateCuStats(type);};
      grid.appendChild(el);
    });
    main.appendChild(grid);
  }
  if(cat==='Performance'){
    ['Max Power','Efficiency','Weight Reduction'].forEach(l=>{
      const r=document.createElement('div');r.className='sl-row';
      r.innerHTML=`<label>${l}<span>${50+Math.random()*30|0}</span></label><input type="range" min="0" max="100" value="${50+Math.random()*30|0}">`;
      r.querySelector('input').oninput=e=>r.querySelector('span').textContent=e.target.value;main.appendChild(r);
    });
  }
}
function updateCuStats(type){
  const el=document.getElementById('cu-stats');el.innerHTML='';
  Object.entries(CU[type].stats).forEach(([k,v])=>{
    const pct=Math.min(100,Math.max(10,v+Math.random()*14-5|0));
    el.innerHTML+=`<div class="cu-stat"><div class="cu-stat-lbl">${k}</div><div class="cu-stat-bar"><i style="width:${pct}%"></i></div></div>`;
  });
}
function buildCuChips(type){
  const el=document.getElementById('cu-chips');el.innerHTML='';
  CU[type].chips.forEach((c,i)=>{
    const ch=document.createElement('div');ch.className='chip'+(i<3?' on':'');ch.textContent=c;
    ch.onclick=()=>ch.classList.toggle('on');el.appendChild(ch);
  });
}
function buildCuColors(type){
  // also rebuild the main color swatches if Paint & Color is active
}
function wireCu(){
  document.querySelectorAll('.vtab').forEach(t=>t.onclick=()=>{
    document.querySelectorAll('.vtab').forEach(x=>x.classList.remove('on'));t.classList.add('on');
    showCuType(t.dataset.vt);
  });
  document.getElementById('cu-rst').onclick=()=>{cuState.sels={};cuState.carCol=CAR_PAL[0];showCuType(cuType);toast('↺ Reset to defaults');};
  document.getElementById('cu-go').onclick=()=>startSim();
}
function enterFullscreen(){
  try{
    const el=document.documentElement;
    const req=el.requestFullscreen||el.webkitRequestFullscreen||el.mozRequestFullScreen||el.msRequestFullscreen;
    if(req){
      const p=req.call(el);
      // orientation lock only works while actually in fullscreen on the
      // browsers that support it at all (mainly Chrome/Android) — try
      // right after the fullscreen promise resolves, and swallow any
      // failure quietly since plenty of browsers don't support it
      const lockLandscape=()=>{try{screen.orientation?.lock?.('landscape').catch(()=>{});}catch(e){}};
      if(p&&p.then)p.then(lockLandscape).catch(()=>{});else lockLandscape();
    }
  }catch(e){}
}
function toggleFullscreen(){
  if(document.fullscreenElement||document.webkitFullscreenElement)
    (document.exitFullscreen||document.webkitExitFullscreen)?.call(document);
  else enterFullscreen();
}
function startSim(){
  // Enter fullscreen right at the top of this handler — it's still inside
  // the click event's call stack (browsers require a real user gesture for
  // this, so it can't be done automatically on page load), and it's what
  // actually hides Chrome's address bar / tab strip, not just a CSS/meta
  // trick. Also try to lock to landscape, which only some browsers support
  // (notably not iOS Safari) so it's wrapped so a failure there is silent
  // and doesn't block the game from starting.
  enterFullscreen();
  document.getElementById('scr-cu').classList.remove('show');
  Aud.resume();
  Car.mesh?.userData.setCol(cuState.carCol);
  const vl=document.getElementById('veil');vl.style.opacity=1;
  appState='transitioning';Car.reset();camMode='third';
  W.dest=null;clearMissionProps();W.activeMission=null;
  document.getElementById('mis-hud').classList.remove('show');document.getElementById('ap-hud').classList.remove('show');
  document.getElementById('telem').classList.add('show');
  setTimeout(()=>{
    vl.style.opacity=0;
    document.getElementById('hud').classList.add('show');
    document.getElementById('c').focus();
    if(gameMode==='mission'){
      appState='driving';
      openBriefing(missionState.current===-1?0:missionState.current);
    } else {
      appState='driving';
      toast('🚗 NEXUS DRIVE · W/S=Drive · A=Left · D=Right · M=Map');
    }
  },650);
}

