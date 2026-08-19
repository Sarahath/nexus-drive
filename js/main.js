"use strict";
/* ─── MAIN LOOP ──────────────────────────────────────────────── */
let loopPaused=false;
function loop(now){
  if(loopPaused)return; // resumed by the visibilitychange handler in initRenderer()
  requestAnimationFrame(loop);
  const dt=Math.min(clock.getDelta(),.05);
  tickFPS(now||performance.now());
  if(appState==='loading'||appState==='custom'||appState==='modeselect'||appState==='mp-lobby')return;
  if(appState==='mp-race'){
    updateMPRace(dt);
    if(typeof updateFX==='function')updateFX(dt);
    if(renderer&&scene&&mpCamP1&&mpCamP2)renderMPSplit();
    return;
  }
  if(appState==='driving'||appState==='paused'||appState==='briefing'||appState==='misend'||appState==='campaign'||appState==='gameover'){
    if(appState==='driving'){
      if(!mapOpen){
        Inp.update();
        Car.update(dt);
        updateCam(dt);
        Aud.update(Car.speed/46,Inp.throttle);
        updateWorld(dt);updateHUD();
      }
      if(mapOpen)drawFullMap();
    } else {
      Aud.stopEngine();
    }
    if(renderer&&scene&&driveCam)renderer.render(scene,driveCam);
  } else {
    Aud.stopEngine();
  }
}

/* ─── EXTERNAL CONFIG (nexus-drive-config.json) ─────────────────
   Colors, keybinds, and per-vehicle stats/options live in the JSON
   file so they can be tweaked without touching this script. If the
   fetch fails (e.g. this page was opened directly as a file:// URL,
   where local fetch() is blocked by CORS) we just keep the built-in
   defaults above and the game still runs normally. */
async function loadConfig(){
  try{
    const res=await fetch('nexus-drive-config.json');
    if(!res.ok)throw new Error('HTTP '+res.status);
    const cfg=await res.json();
    if(Array.isArray(cfg.colors?.car)){CAR_PAL.length=0;CAR_PAL.push(...cfg.colors.car.map(h=>parseInt(h.replace('#',''),16)));}
    if(cfg.keybinds)Object.assign(KEYMAP,cfg.keybinds);
    if(cfg.vehicles?.car)CU.car=cfg.vehicles.car;
    cuState.carCol=CAR_PAL[0];
  }catch(e){
    console.warn('nexus-drive-config.json not loaded, using built-in defaults:',e.message);
  }
}

/* ─── BOOT ───────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded',async()=>{
  try{ await loadConfig(); }catch(e){ console.error(e); }
  try{ initForcedLandscape(); }catch(e){ console.error(e); }
  try{ Inp.init(); }catch(e){ console.error(e); }
  try{ TouchCtl.init(); }catch(e){ console.error(e); }
  try{ GamepadCtl.init(); }catch(e){ console.error(e); }
  try{ initMobileAutoFullscreen(); }catch(e){ console.error(e); }
  try{ wireRotatePrompt(); }catch(e){ console.error(e); }
  try{ wirePause(); }catch(e){ console.error(e); }
  try{ initMapEvents(); }catch(e){ console.error(e); }
  try{ wireCu(); }catch(e){ console.error(e); }
  try{ initPhoneUI(); }catch(e){ console.error(e); }
  try{ wireMissionUI(); }catch(e){ console.error(e); }
  try{ wireMultiplayer(); }catch(e){ console.error(e); }
  try{ if(typeof renderPlayOnMobileQR==='function')renderPlayOnMobileQR(); }catch(e){ console.error(e); }
  clock.getDelta();
  runLoad();
  requestAnimationFrame(loop);
});
