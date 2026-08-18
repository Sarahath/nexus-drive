// Nexus Drive — public relay server
// ----------------------------------
// Serves controller.html (the phone-side control page) and relays
// WebSocket messages between the PC (host) and one or two phones
// (controller / p1 / p2), so pairing works over the public internet —
// no shared Wi-Fi, no local IP typing.
//
// Deploy this once (see README.md), then set WS_RELAY_URL near the top
// of the game's <script> to this server's wss:// address.
//
// Protocol (all messages are JSON):
//   Host -> server:
//     {type:'register',    role:'host', room}          (phone control)
//     {type:'mp-register',              room}          (multiplayer)
//     {type:'telemetry', speed, fuel}                  (phone control, host->phone)
//     {type:'mp-state', state, count?, winner?}         (multiplayer, host->phones)
//   Phone -> server:
//     {type:'join', room, role?}   role omitted for phone control,
//                                   'p1'/'p2' for multiplayer
//     {type:'input', throttle, steer, brake, hand, action?}      (phone control)
//     {type:'mp-input', role, throttle, steer, brake}            (multiplayer)
//   Server -> host:
//     {type:'registered'} / {type:'mp-registered'}
//     {type:'controller-joined'} / {type:'controller-left'}
//     {type:'mp-player-joined', role} / {type:'mp-player-left', role}
//     {type:'input', ...} / {type:'mp-input', role, ...}   (relayed)
//   Server -> phone:
//     {type:'telemetry', ...} / {type:'mp-state', ...}     (relayed)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8787;

// room => { host: ws|null, mode: 'phone'|'mp'|null, controller: ws|null, p1: ws|null, p2: ws|null }
const rooms = new Map();
function getRoom(id) {
  if (!rooms.has(id)) rooms.set(id, { host: null, mode: null, controller: null, p1: null, p2: null });
  return rooms.get(id);
}
function cleanupRoom(id) {
  const r = rooms.get(id);
  if (r && !r.host && !r.controller && !r.p1 && !r.p2) rooms.delete(id);
}
function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Nexus Drive relay is running.');
    return;
  }
  if (urlPath === '/controller.html') {
    fs.readFile(path.join(__dirname, 'controller.html'), (err, data) => {
      if (err) { res.writeHead(500); res.end('controller.html missing'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }
  res.writeHead(404); res.end('Not found');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.meta = { room: null, kind: null, role: null }; // kind: 'host' | 'phone'

  ws.on('message', (raw) => {
    let d;
    try { d = JSON.parse(raw); } catch (e) { return; }

    // ---- HOST registers a room ----
    if (d.type === 'register' && d.room) {
      const r = getRoom(d.room);
      r.host = ws; r.mode = 'phone';
      ws.meta = { room: d.room, kind: 'host' };
      send(ws, { type: 'registered' });
      if (r.controller) send(ws, { type: 'controller-joined' });
      return;
    }
    if (d.type === 'mp-register' && d.room) {
      const r = getRoom(d.room);
      r.host = ws; r.mode = 'mp';
      ws.meta = { room: d.room, kind: 'host' };
      send(ws, { type: 'mp-registered' });
      if (r.p1) send(ws, { type: 'mp-player-joined', role: 'p1' });
      if (r.p2) send(ws, { type: 'mp-player-joined', role: 'p2' });
      return;
    }

    // ---- PHONE joins a room ----
    if (d.type === 'join' && d.room) {
      const r = getRoom(d.room);
      ws.meta = { room: d.room, kind: 'phone', role: d.role || null };
      if (d.role === 'p1' || d.role === 'p2') {
        r[d.role] = ws;
        send(ws, { type: 'joined', role: d.role });
        if (r.host) send(r.host, { type: 'mp-player-joined', role: d.role });
      } else {
        r.controller = ws;
        send(ws, { type: 'joined' });
        if (r.host) send(r.host, { type: 'controller-joined' });
      }
      return;
    }

    // ---- relay input from phone -> host ----
    if (d.type === 'input') {
      const r = rooms.get(ws.meta.room);
      if (r && r.host) send(r.host, { ...d });
      return;
    }
    if (d.type === 'mp-input') {
      const r = rooms.get(ws.meta.room);
      if (r && r.host) send(r.host, { ...d, role: ws.meta.role });
      return;
    }

    // ---- relay state from host -> phone(s) ----
    if (d.type === 'telemetry') {
      const r = rooms.get(ws.meta.room);
      if (r && r.controller) send(r.controller, { ...d });
      return;
    }
    if (d.type === 'mp-state') {
      const r = rooms.get(ws.meta.room);
      if (r) { send(r.p1, { ...d }); send(r.p2, { ...d }); }
      return;
    }
  });

  ws.on('close', () => {
    const { room, kind, role } = ws.meta || {};
    if (!room) return;
    const r = rooms.get(room);
    if (!r) return;
    if (kind === 'host') {
      r.host = null;
      // let phones know the host is gone
      send(r.controller, { type: 'host-left' });
      send(r.p1, { type: 'host-left' });
      send(r.p2, { type: 'host-left' });
    } else if (role === 'p1' || role === 'p2') {
      r[role] = null;
      if (r.host) send(r.host, { type: 'mp-player-left', role });
    } else {
      r.controller = null;
      if (r.host) send(r.host, { type: 'controller-left' });
    }
    cleanupRoom(room);
  });
});

server.listen(PORT, () => console.log('Nexus Drive relay listening on', PORT));
