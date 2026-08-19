"use strict";
/* ─── INPUT MANAGER ──────────────────────────────────────────── */
// Defaults — overwritten in place by loadConfig() from
// nexus-drive-config.json (falls back to these if the fetch fails).
let KEYMAP={
  throttle:['KeyW','ArrowUp'], brake:['KeyS','ArrowDown'],
  steerLeft:['KeyA','ArrowLeft'], steerRight:['KeyD','ArrowRight'],
  handbrake:['Space'], pause:['Escape'], cycleCamera:['KeyC'],
  toggleMap:['KeyM'], autoPark:['KeyP'],
  honk:['KeyH'], headlights:['KeyL'], recover:['KeyR'],
  fpsToggle:['KeyF'], autopilot:['KeyZ'],
  gearUp:['Digit1'], gearDown:['Digit2'],
};
function dkeySet(){return new Set(Object.values(KEYMAP).flat());}
const Inp={
  keys:{},throttle:0,brake:0,steer:0,hand:false,source:'kb',
  init(){
    const cv=document.getElementById('c');cv.setAttribute('tabindex','0');cv.style.outline='none';
    const grab=()=>cv.focus();cv.addEventListener('pointerdown',grab);window.addEventListener('pointerdown',grab);grab();
    window.addEventListener('keydown',e=>{
      this.keys[e.code]=true;
      if(dkeySet().has(e.code)&&(appState==='driving'||appState==='paused'))e.preventDefault();
      this._tap(e.code);
    },{passive:false});
    window.addEventListener('keyup',e=>{this.keys[e.code]=false;if(dkeySet().has(e.code))e.preventDefault();},{passive:false});
  },
  _tap(c){
    if(appState!=='driving'&&appState!=='paused')return;
    if(KEYMAP.pause.includes(c))togglePause();
    if(appState!=='driving')return;
    if(KEYMAP.cycleCamera.includes(c))cycleCam();
    if(KEYMAP.toggleMap.includes(c))toggleMap();
    if(KEYMAP.autoPark.includes(c))Car.startAP();
    if(KEYMAP.honk.includes(c))Aud.honk();
    if(KEYMAP.headlights.includes(c))W.headlights=!W.headlights;
    if(KEYMAP.recover.includes(c)){Car.reset();toast('↺ Recovered');}
    if(KEYMAP.fpsToggle.includes(c))document.getElementById('fps-hud').classList.toggle('show');
    if(KEYMAP.autopilot.includes(c)){Car.aiDriving=!Car.aiDriving;W.ai.car=Car.aiDriving;syncPauseSeg('seg-ai','ai',Car.aiDriving?'car':'off');toast(Car.aiDriving?'🤖 Autopilot ON':'🤖 Autopilot OFF');}
    // manual gear shift — 1 = up a gear, 2 = down a gear (never during
    // autopilot/auto-park, where the game drives and picks its own revs)
    if(!Car.aiDriving&&!Car.autoPark){
      if(KEYMAP.gearUp.includes(c)&&Car.gear<GEAR_DATA.length){Car.gear++;Car._shiftT=SHIFT_CUT_DUR;Aud.shiftCut();Aud.exhaustPop();toast('⚙ Gear '+Car.gear);}
      if(KEYMAP.gearDown.includes(c)&&Car.gear>1){Car.gear--;Car._shiftT=SHIFT_CUT_DUR;Aud.shiftCut();Aud.exhaustPop();toast('⚙ Gear '+Car.gear);}
    }
  },
  update(){
    if(typeof GamepadCtl!=='undefined')GamepadCtl.poll();

    const k=this.keys;
    const kbThrottle=KEYMAP.throttle.some(c=>k[c])?1:0;
    const kbBrake=KEYMAP.brake.some(c=>k[c])?1:0;
    const kbSteer=(KEYMAP.steerRight.some(c=>k[c])?1:0)-(KEYMAP.steerLeft.some(c=>k[c])?1:0);
    const kbHand=KEYMAP.handbrake.some(c=>k[c]);

    const rcThr=RC.connected?(RC.throttle||0):0;
    const rcBrk=RC.connected?(RC.brake||0):0;
    const rcStr=RC.connected?(RC.steer||0):0;
    const rcHnd=RC.connected?(RC.hand||false):false;

    const gpThr=GamepadCtl.connected?(GamepadCtl.throttle||0):0;
    const gpBrk=GamepadCtl.connected?(GamepadCtl.brake||0):0;
    const gpStr=GamepadCtl.connected?(GamepadCtl.steer||0):0;
    const gpHnd=GamepadCtl.connected?(GamepadCtl.hand||false):false;

    this.throttle=Math.max(kbThrottle,TouchCtl.throttle||0,rcThr,gpThr);
    this.brake=Math.max(kbBrake,TouchCtl.brake||0,rcBrk,gpBrk);
    this.steer=kbSteer!==0?kbSteer:(gpStr||TouchCtl.steer||rcStr);
    this.hand=kbHand||(TouchCtl.hand||false)||rcHnd||gpHnd;
  },
};
/* ─── ON-SCREEN TOUCH CONTROLS ─────────────────────────────────── */
const TouchCtl={
  active:false,throttle:0,brake:0,steer:0,hand:false,
  init(){
    this.active=true;
    document.body.classList.add('touch-device');
    this._bindSteer();
    this._bindHold(document.getElementById('tc-gas'),'active',()=>this.throttle=1,()=>this.throttle=0);
    this._bindHold(document.getElementById('tc-brake'),'active',()=>this.brake=1,()=>this.brake=0);
    this._bindHold(document.getElementById('tc-hand'),'active',()=>this.hand=true,()=>this.hand=false);
    const tap=(id,fn)=>{
      const el=document.getElementById(id);
      if(el)el.addEventListener('pointerdown',e=>{e.preventDefault();fn();});
    };
    tap('tc-horn',()=>Aud.honk());
    tap('tc-lights',()=>W.headlights=!W.headlights);
    tap('tc-cam',()=>cycleCam());
    tap('tc-recover',()=>{Car.reset();toast('↺ Recovered');});
    tap('tc-fs',()=>toggleFullscreen());
    // manual gear shift buttons — mirrors the Digit1/Digit2 keyboard
    // shortcuts and the phone-controller gear-up/gear-down actions,
    // disabled while autopilot/auto-park is driving the car itself
    tap('tc-gear-up',()=>{
      if(Car.aiDriving||Car.autoPark)return;
      if(Car.gear<GEAR_DATA.length){Car.gear++;Car._shiftT=SHIFT_CUT_DUR;Aud.shiftCut();Aud.exhaustPop();toast('⚙ Gear '+Car.gear);}
    });
    tap('tc-gear-down',()=>{
      if(Car.aiDriving||Car.autoPark)return;
      if(Car.gear>1){Car.gear--;Car._shiftT=SHIFT_CUT_DUR;Aud.shiftCut();Aud.exhaustPop();toast('⚙ Gear '+Car.gear);}
    });
  },
  _bindHold(el,activeCls,onDown,onUp){
    if(!el)return;
    let pid=null;
    el.addEventListener('pointerdown',e=>{
      if(pid!==null)return;
      pid=e.pointerId;el.setPointerCapture(e.pointerId);
      el.classList.add(activeCls);onDown();
    });
    const release=e=>{
      if(e.pointerId!==pid)return;
      pid=null;el.classList.remove(activeCls);onUp();
    };
    el.addEventListener('pointerup',release);
    el.addEventListener('pointercancel',release);
    el.addEventListener('pointerleave',e=>{if(e.pointerId===pid)release(e);});
  },
  _bindSteer(){
    let leftDown=false,rightDown=false;
    const apply=()=>{ this.steer=(rightDown?1:0)-(leftDown?1:0); };
    const bindArrow=(id,setDown)=>{
      const el=document.getElementById(id);
      if(!el)return;
      let pid=null;
      el.addEventListener('pointerdown',e=>{
        if(pid!==null)return;
        pid=e.pointerId;el.setPointerCapture(e.pointerId);
        el.classList.add('active');setDown(true);apply();
      });
      const release=e=>{
        if(e.pointerId!==pid)return;
        pid=null;el.classList.remove('active');setDown(false);apply();
      };
      el.addEventListener('pointerup',release);
      el.addEventListener('pointercancel',release);
      el.addEventListener('pointerleave',e=>{if(e.pointerId===pid)release(e);});
    };
    bindArrow('tc-left',v=>leftDown=v);
    bindArrow('tc-right',v=>rightDown=v);
  },
};
/* ─── GAMEPAD / JOYSTICK ────────────────────────────────────────
   Any controller the browser recognizes with the "standard" Gamepad
   mapping (Xbox, PlayStation, most generic USB/Bluetooth pads) drives
   the car directly — just plug it in / pair it and press a button or
   move a stick, no setup screen needed. Left stick steers, the
   analog triggers are gas/brake, face buttons handle the rest. */
const GAMEPAD_MAP={
  steerAxis:0, throttleBtn:7, brakeBtn:6,
  handbrake:0,   // A / Cross — hold
  horn:1,        // B / Circle — tap
  headlights:2,  // X / Square — tap
  cycleCam:3,    // Y / Triangle — tap
  gearDown:4,    // Left bumper — tap
  gearUp:5,      // Right bumper — tap
  toggleMap:8,   // Back / Select — tap
  pause:9,       // Start — tap
  recover:10,    // Left stick click — tap
  autoPark:11,   // Right stick click — tap
};
const GamepadCtl={
  index:null,connected:false,throttle:0,brake:0,steer:0,hand:false,
  _prev:{},
  init(){
    window.addEventListener('gamepadconnected',e=>{
      this.index=e.gamepad.index;this.connected=true;this._prev={};
      Inp.source='gamepad';
      toast('🎮 Controller connected');
      const hint=document.getElementById('gp-hint');if(hint)hint.style.display='';
    });
    window.addEventListener('gamepaddisconnected',e=>{
      if(e.gamepad.index!==this.index)return;
      this.index=null;this.connected=false;
      this.throttle=0;this.brake=0;this.steer=0;this.hand=false;
      Inp.source=(typeof TouchCtl!=='undefined'&&TouchCtl.active)?'touch':'kb';
      toast('🎮 Controller disconnected');
      const hint=document.getElementById('gp-hint');if(hint)hint.style.display='none';
    });
  },
  _pressed(gp,i){const b=gp.buttons[i];return !!(b&&(b.pressed||b.value>.5));},
  _tapped(gp,i){
    const now=this._pressed(gp,i);const was=!!this._prev[i];this._prev[i]=now;
    return now&&!was;
  },
  poll(){
    if(this.index===null)return;
    const pads=navigator.getGamepads?navigator.getGamepads():[];
    const gp=pads[this.index];
    if(!gp){return;}

    const ax=gp.axes[GAMEPAD_MAP.steerAxis]||0;
    this.steer=Math.abs(ax)>.12?clamp(ax,-1,1):0;

    const rt=gp.buttons[GAMEPAD_MAP.throttleBtn]?gp.buttons[GAMEPAD_MAP.throttleBtn].value:0;
    const lt=gp.buttons[GAMEPAD_MAP.brakeBtn]?gp.buttons[GAMEPAD_MAP.brakeBtn].value:0;
    this.throttle=rt>.04?rt:0;
    this.brake=lt>.04?lt:0;
    this.hand=this._pressed(gp,GAMEPAD_MAP.handbrake);

    // one-shot (edge-triggered) actions — same gating as keyboard/touch
    if(appState!=='driving'&&appState!=='paused')return;
    if(this._tapped(gp,GAMEPAD_MAP.pause)){togglePause();return;}
    if(appState!=='driving')return;
    if(this._tapped(gp,GAMEPAD_MAP.cycleCam))cycleCam();
    if(this._tapped(gp,GAMEPAD_MAP.toggleMap))toggleMap();
    if(this._tapped(gp,GAMEPAD_MAP.autoPark))Car.startAP();
    if(this._tapped(gp,GAMEPAD_MAP.horn))Aud.honk();
    if(this._tapped(gp,GAMEPAD_MAP.headlights))W.headlights=!W.headlights;
    if(this._tapped(gp,GAMEPAD_MAP.recover)){Car.reset();toast('↺ Recovered');}
    if(!Car.aiDriving&&!Car.autoPark){
      if(this._tapped(gp,GAMEPAD_MAP.gearUp)&&Car.gear<GEAR_DATA.length){Car.gear++;Car._shiftT=SHIFT_CUT_DUR;Aud.shiftCut();Aud.exhaustPop();toast('⚙ Gear '+Car.gear);}
      if(this._tapped(gp,GAMEPAD_MAP.gearDown)&&Car.gear>1){Car.gear--;Car._shiftT=SHIFT_CUT_DUR;Aud.shiftCut();Aud.exhaustPop();toast('⚙ Gear '+Car.gear);}
    }
  },
};
// Phone Control bridge (Wi-Fi LAN, QR-code pairing, WebSocket)
const RC={
  ws:null,on:false,connected:false,room:null,telTimer:null,
  genRoom(){return String(Math.floor(1000+Math.random()*9000));},
  start(serverUrl){
    this.url=serverUrl.replace(/\/$/,'');
    this.room=this.genRoom();
    this.on=true;
    this._conn();
    return this.room;
  },
  stop(){
    this.on=false;this.connected=false;Inp.source=(typeof TouchCtl!=='undefined'&&TouchCtl.active)?'touch':'kb';
    if(this.telTimer){clearInterval(this.telTimer);this.telTimer=null;}
    this.ws?.close();this.ws=null;
  },
  _conn(){
    if(!this.on)return;
    try{
      this.ws=new WebSocket(this.url);
      this.ws.onopen=()=>{
        this.ws.send(JSON.stringify({type:'register',role:'host',room:this.room}));
        phoneUI_status('Waiting for phone…','');
      };
      this.ws.onclose=()=>{
        this.connected=false;Inp.source=(typeof TouchCtl!=='undefined'&&TouchCtl.active)?'touch':'kb';
        if(this.telTimer){clearInterval(this.telTimer);this.telTimer=null;}
        phoneUI_status('Server connection lost','err');
        if(this.on)setTimeout(()=>this._conn(),3000);
      };
      this.ws.onerror=()=>{phoneUI_status(HAS_PUBLIC_RELAY?'Could not reach the relay server — check your internet connection':'Could not reach server — check address & Wi-Fi','err');};
      this.ws.onmessage=ev=>{
        let d;try{d=JSON.parse(ev.data);}catch(e){return;}
        if(d.type==='registered'){
          phoneUI_status('Ready — scan the QR code on your phone','');
        } else if(d.type==='controller-joined'){
          this.connected=true;Inp.source='remote';
          phoneUI_status('📱 Phone connected!','ok');
          toast('📱 Phone controller connected');
          if(!this.telTimer)this.telTimer=setInterval(()=>{
            if(this.ws&&this.ws.readyState===1){
              const gDisplay=Car.speed<-0.2?'R':(Math.abs(Car.speed)*3.6<1.5?'N':`D${Math.min(5,Math.max(1,Car.gear))}`);
              this.ws.send(JSON.stringify({type:'telemetry',speed:Math.abs(Car.speed)*3.6,fuel:Car.fuel,gear:gDisplay}));
            }
          },120);
        } else if(d.type==='controller-left'){
          this.connected=false;Inp.source=(typeof TouchCtl!=='undefined'&&TouchCtl.active)?'touch':'kb';
          phoneUI_status('Phone disconnected — waiting…','');
          toast('📱 Phone controller disconnected');
        } else if(d.type==='input'){
          this.throttle=clamp(d.throttle||0,0,1);
          this.steer=clamp(d.steer||0,-1,1);
          this.brake=clamp(d.brake||0,0,1);
          this.hand=!!d.hand;
          if(d.action)this._action(d.action);
        }
      };
    }catch(e){phoneUI_status('Invalid server address','err');}
  },
  _action(a){
    if(a==='horn'){ if(typeof Aud!=='undefined'&&Aud.honk)Aud.honk(); }
    else if(a==='autopark'){ if(typeof Car!=='undefined'&&Car.startAP)Car.startAP(); }
    else if(a==='headlights'){ W.headlights=!W.headlights; toast(`💡 Headlights: ${W.headlights?'ON':'OFF'}`); }
    else if(a==='camera'){ if(typeof cycleCam==='function')cycleCam(); }
    else if(a==='weather'){
      const wxs=['sunny','cloudy','rain','fog','night'];
      const nextIdx=(wxs.indexOf(W.wx)+1)%wxs.length;
      W.wx=wxs[nextIdx];
      toast(`Weather: ${W.wx.toUpperCase()}`);
    }
    else if(a==='free-mode'){
      gameMode='free';
      document.getElementById('scr-mode').classList.remove('show');
      document.getElementById('scr-mis-select').classList.remove('show');
      appState='driving';
      document.getElementById('hud').classList.add('show');
      toast('🏎️ Switched to Free Mode!');
    }
    else if(a==='mission-mode'){
      gameMode='mission';
      if(typeof renderMissionGrid==='function')renderMissionGrid();
      document.getElementById('scr-mode').classList.remove('show');
      document.getElementById('scr-mis-select').classList.add('show');
      toast('🎯 Switched to Mission Mode!');
    }
    else if(a==='gear-up'){
      if(Car.gear<5){
        Car.gear++;Car._shiftT=SHIFT_CUT_DUR;
        if(typeof Aud!=='undefined'){if(Aud.shiftCut)Aud.shiftCut();if(Aud.exhaustPop)Aud.exhaustPop();}
        toast('⚙ Gear '+Car.gear);
      }
    }
    else if(a==='gear-down'){
      if(Car.gear>1){
        Car.gear--;Car._shiftT=SHIFT_CUT_DUR;
        if(typeof Aud!=='undefined'){if(Aud.shiftCut)Aud.shiftCut();if(Aud.exhaustPop)Aud.exhaustPop();}
        toast('⚙ Gear '+Car.gear);
      }
    }
    else if(a==='recover'){Car.reset();toast('↺ Recovered');}
  },
};
function phoneUI_status(msg,cls){
  const el=document.getElementById('phc-status');
  if(el){el.textContent=msg;el.className='phc-status'+(cls?' '+cls:'');}
  const note=document.getElementById('rem-note');
  if(note)note.textContent=RC.connected?'📱 Phone connected':RC.on?'Waiting for phone…':'Keyboard active';
}
// True once a real public relay is configured — Phone Control and
// Multiplayer then skip manual server-address entry entirely and just
// use it, so pairing works from any network, not only the same Wi-Fi.
const HAS_PUBLIC_RELAY=/^wss?:\/\/.+/.test(WS_RELAY_URL);
function guessLanAddr(){
  if(HAS_PUBLIC_RELAY)return WS_RELAY_URL;
  const proto=location.protocol==='https:'?'wss:':'ws:';
  const host=location.hostname||'localhost';
  const port=location.port?`:${location.port}`:':8080';
  return `${proto}//${host}${port}/ws`;
}
function renderPairingQR(room,serverUrl){
  const httpUrl=serverUrl.replace(/^ws/,'http');
  const controllerUrl=`${httpUrl}/controller.html?room=${room}&server=${encodeURIComponent(serverUrl)}`;
  const qr=qrcode(0,'M');
  qr.addData(controllerUrl);
  qr.make();
  document.getElementById('phc-qr').innerHTML=qr.createSvgTag({cellSize:5,margin:2});
  return controllerUrl;
}
function initPhoneUI(){
  const addrInput=document.getElementById('phc-addr');
  addrInput.value=guessLanAddr();
  if(HAS_PUBLIC_RELAY){
    // Public relay configured: hide the address field/instructions and
    // the QR alone is enough — any network, no pairing typed in.
    document.getElementById('phc-precheck-note').textContent='Scan the QR code with your phone to pair it as a controller — works from any network.';
    document.getElementById('phc-addr-lbl').style.display='none';
    addrInput.style.display='none';
    document.getElementById('phc-start').textContent='Generate Pairing QR';
  }
  document.getElementById('pm-phone').onclick=()=>{
    document.getElementById('pause').classList.remove('show');
    document.getElementById('phone-modal').classList.add('show');
    document.getElementById('phone-precheck').style.display=RC.connected||RC.on?'none':'block';
    document.getElementById('phone-live').style.display=RC.on?'block':'none';
    if(RC.on){document.getElementById('phc-code').textContent=RC.room;renderPairingQR(RC.room,RC.url);}
  };
  document.getElementById('phc-start').onclick=()=>{
    const addr=addrInput.value.trim();
    if(!/^wss?:\/\/.+/.test(addr)){phoneUI_status('Enter a valid ws:// address','err');return;}
    const room=RC.start(addr);
    document.getElementById('phone-precheck').style.display='none';
    document.getElementById('phone-live').style.display='block';
    document.getElementById('phc-code').textContent=room;
    renderPairingQR(room,addr);
  };
  document.getElementById('phc-stop').onclick=()=>{
    RC.stop();
    document.getElementById('phone-precheck').style.display='block';
    document.getElementById('phone-live').style.display='none';
    document.getElementById('rem-note').textContent='Keyboard active';
  };
  document.getElementById('phc-close').onclick=()=>{
    document.getElementById('phone-modal').classList.remove('show');
    appState='paused';document.getElementById('pause').classList.add('show');
  };
}

