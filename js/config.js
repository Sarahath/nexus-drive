/* ================================================================
   NEXUS DRIVE  —  AI Car Simulation Platform
   Architecture: 12 modules matching the system diagram
   1. Sensors  2. AI Processing  3. Communication  4. Car Control
   5. Cloud/Data  6. Live Telemetry  7. Map & Navigation
   8. Traffic Detection  9. Pedestrian Detection  10. Auto Parking
   11. Battery  12. Mobile Controller
   ================================================================ */
"use strict";
/* ─── GLOBALS ───────────────────────────────────────────────── */
let renderer,scene,driveCam,sunLight,ambLight,hemiLight;
let gScene,gCam,gRend;          // garage preview renderer
let appState='loading';         // loading|custom|driving|paused
let activeVeh='car';            // 'car'
let camMode='third';
const clock=new THREE.Clock();

/* ─── MOBILE DETECTION & HARDENING ───────────────────────────────
   Computed once up front so both the renderer setup and the touch
   controls can use the same flag. Also blocks pinch-zoom / double-tap
   zoom / iOS rubber-band gestures at the document level — the CSS
   touch-action rules handle most of it, but iOS Safari still needs
   these JS listeners for pinch (gesture events) and stray multi-touch. */
const IS_MOBILE=(('ontouchstart' in window)||navigator.maxTouchPoints>0);
document.addEventListener('gesturestart',e=>e.preventDefault());
document.addEventListener('gesturechange',e=>e.preventDefault());
let _lastTapT=0;
document.addEventListener('touchend',e=>{
  const t=Date.now();
  if(t-_lastTapT<300)e.preventDefault(); // double-tap zoom guard
  _lastTapT=t;
},{passive:false});
document.addEventListener('touchmove',e=>{ if(e.touches.length>1)e.preventDefault(); },{passive:false});

/* ─── CONFIG ────────────────────────────────────────────────── */
// The single public URL this game is hosted at. Used ONLY for the
// "Play on Mobile" QR code shown in PC Mode — scanning it must open
// this same hosted game on a phone (which then auto-detects itself as
// mobile and loads Mobile Mode). Update this one line whenever the
// deployment URL changes; nothing else needs to change.
// MUST be a real public URL — never localhost/127.0.0.1/a local IP,
// since a phone that isn't on your LAN needs to be able to open it.
const HOSTED_GAME_URL = ''; // e.g. 'https://your-project.netlify.app/index.html'

// Public WebSocket relay used for BOTH "Phone Control" (one phone driving
// the PC) and "Multiplayer" (two phones racing). This must be a real
// publicly reachable wss:// address — i.e. phone-control/server.js
// deployed to a host like Render/Railway/Fly.io — NOT a LAN/local address.
// Once this is set, players never type a server address or need to be on
// the same Wi-Fi as the PC: the QR code alone is enough from anywhere.
// Leave it empty to fall back to the old manual "enter server address"
// flow (useful for local testing on your own Wi-Fi during development).
const WS_RELAY_URL = ''; // e.g. 'wss://nexus-drive-relay.onrender.com'

const CFG={
  blockSz:44, roadW:12, grid:9,
  get cell(){return this.blockSz+this.roadW},
  get span(){return this.grid*this.cell},
  spawnX:2, spawnZ:8,
};
// Defaults below are used if nexus-drive-config.json can't be loaded
// (e.g. opened as a local file:// page without a server — fetch() of
// local JSON is blocked by CORS in that case). loadConfig() overwrites
// these arrays/objects in place once the JSON has loaded successfully.
let CAR_PAL =[0x2ee6d6,0xff3344,0xffffff,0xffb020,0x6655ff,0x111111,0xff66aa,0x00ff88,0x44aaff,0xff6600];

/* ─── WORLD STATE ───────────────────────────────────────────── */
const W={
  tod:7, wx:'sunny',
  colliders:[],
  aiCars:[], peds:[],
  winMats:[], lampMats:[], lampPts:[],
  tlights:[],
  parkSpots:[], fuelPts:[], chargePts:[],
  dest:null,
  rain:null,
  headlights:false,
  adas:{acc:true,aeb:true,lka:true,bsm:true,tsr:true},
  ai:{car:false},
  activeMission:null,
  collisionCount:0,
};

/* ─── UTILS ─────────────────────────────────────────────────── */
const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>a+Math.random()*(b-a);
const pick=a=>a[Math.random()*a.length|0];
const ftm=h=>{const hh=h|0,mm=(h%1*60)|0;return`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`};

