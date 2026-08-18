const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const HTTP_PORT = 8080;
const BASE_DIR = __dirname;

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { host: null, mode: null, controller: null, p1: null, p2: null });
  }
  return rooms.get(roomId);
}

function cleanupRoom(roomId) {
  const r = rooms.get(roomId);
  if (r && !r.host && !r.controller && !r.p1 && !r.p2) {
    rooms.delete(roomId);
  }
}

function safeSend(ws, obj) {
  if (ws && ws.readyState === 1) { // 1 = OPEN
    try {
      ws.send(JSON.stringify(obj));
    } catch (e) {
      // ignore
    }
  }
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg'
};

// HTTP Server
const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // API endpoint for LAN IP
  if (urlPath === '/api/ip') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ip: getLocalIP() }));
    return;
  }

  // Map / to index.html
  let filePath = path.join(BASE_DIR, urlPath === '/' ? 'index.html' : urlPath);

  // Security check: ensure path is within BASE_DIR
  if (!filePath.startsWith(BASE_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error: ' + err.code);
      }
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
});

// WebSocket Server (specifically matching path /ws)
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = request.url.split('?')[0];
  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  const meta = { room: null, kind: null, role: null };

  ws.on('message', (message) => {
    let d;
    try {
      d = JSON.parse(message);
    } catch (e) {
      return;
    }

    const msgType = d.type;
    const roomId = d.room;

    // --- HOST REGISTRATION ---
    if (msgType === 'register' && roomId) {
      const r = getRoom(roomId);
      r.host = ws;
      r.mode = 'phone';
      meta.room = roomId;
      meta.kind = 'host';
      safeSend(ws, { type: 'registered' });
      if (r.controller) {
        safeSend(ws, { type: 'controller-joined' });
      }
    } else if (msgType === 'mp-register' && roomId) {
      const r = getRoom(roomId);
      r.host = ws;
      r.mode = 'mp';
      meta.room = roomId;
      meta.kind = 'host';
      safeSend(ws, { type: 'mp-registered' });
      if (r.p1) {
        safeSend(ws, { type: 'mp-player-joined', role: 'p1' });
      }
      if (r.p2) {
        safeSend(ws, { type: 'mp-player-joined', role: 'p2' });
      }
    }

    // --- PHONE / PLAYER JOIN ---
    else if (msgType === 'join' && roomId) {
      const r = getRoom(roomId);
      const role = d.role;
      meta.room = roomId;
      meta.kind = 'phone';
      meta.role = role;

      if (role === 'p1' || role === 'p2') {
        r[role] = ws;
        safeSend(ws, { type: 'joined', role: role });
        if (r.host) {
          safeSend(r.host, { type: 'mp-player-joined', role: role });
        }
      } else {
        r.controller = ws;
        safeSend(ws, { type: 'joined' });
        if (r.host) {
          safeSend(r.host, { type: 'controller-joined' });
        }
      }
    }

    // --- RELAY PHONE INPUT -> HOST ---
    else if (msgType === 'input') {
      const r = rooms.get(meta.room);
      if (r && r.host) {
        safeSend(r.host, d);
      }
    } else if (msgType === 'mp-input') {
      const r = rooms.get(meta.room);
      if (r && r.host) {
        d.role = meta.role;
        safeSend(r.host, d);
      }
    }

    // --- RELAY PLAYER POSITION ---
    else if (msgType === 'mp-pos') {
      const r = rooms.get(meta.room);
      if (r) {
        d.role = meta.role || d.role;
        if (r.host) {
          safeSend(r.host, d);
        }
        const opp = d.role === 'p1' ? 'p2' : 'p1';
        if (r[opp]) {
          safeSend(r[opp], d);
        }
      }
    }

    // --- RELAY FINISH STATUS ---
    else if (msgType === 'mp-finish') {
      const r = rooms.get(meta.room);
      if (r && r.host) {
        d.role = meta.role || d.role;
        safeSend(r.host, d);
      }
    }

    // --- RELAY HOST STATE -> PHONES ---
    else if (msgType === 'telemetry') {
      const r = rooms.get(meta.room);
      if (r && r.controller) {
        safeSend(r.controller, d);
      }
    } else if (msgType === 'mp-state') {
      const r = rooms.get(meta.room);
      if (r) {
        if (r.p1) safeSend(r.p1, d);
        if (r.p2) safeSend(r.p2, d);
      }
    }
  });

  ws.on('close', () => {
    const roomId = meta.room;
    const role = meta.role;
    const kind = meta.kind;

    if (roomId && rooms.has(roomId)) {
      const r = rooms.get(roomId);
      if (kind === 'host') {
        r.host = null;
        if (r.controller) safeSend(r.controller, { type: 'host-left' });
        if (r.p1) safeSend(r.p1, { type: 'host-left' });
        if (r.p2) safeSend(r.p2, { type: 'host-left' });
      } else if (role === 'p1' || role === 'p2') {
        r[role] = null;
        if (r.host) {
          safeSend(r.host, { type: 'mp-player-left', role: role });
        }
      } else {
        r.controller = null;
        if (r.host) {
          safeSend(r.host, { type: 'controller-left' });
        }
      }
      cleanupRoom(roomId);
    }
  });
});

server.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`[INFO] Unified Node HTTP + WebSocket Server running on port ${HTTP_PORT}`);
});
