import asyncio
import json
import os
import aiohttp
from aiohttp import web

HTTP_PORT = 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

rooms = {}

def get_room(room_id):
    if room_id not in rooms:
        rooms[room_id] = {'host': None, 'mode': None, 'controller': None, 'p1': None, 'p2': None}
    return rooms[room_id]

def cleanup_room(room_id):
    if room_id in rooms:
        r = rooms[room_id]
        if not r['host'] and not r['controller'] and not r['p1'] and not r['p2']:
            del rooms[room_id]

async def safe_send(ws, obj):
    if ws and not ws.closed:
        try:
            await ws.send_str(json.dumps(obj))
        except Exception:
            pass

async def ws_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    meta = {'room': None, 'kind': None, 'role': None}
    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                try:
                    d = json.loads(msg.data)
                except Exception:
                    continue

                msg_type = d.get('type')
                room_id = d.get('room')

                # --- HOST REGISTRATION ---
                if msg_type == 'register' and room_id:
                    r = get_room(room_id)
                    r['host'] = ws
                    r['mode'] = 'phone'
                    meta['room'] = room_id
                    meta['kind'] = 'host'
                    await safe_send(ws, {'type': 'registered'})
                    if r['controller']:
                        await safe_send(ws, {'type': 'controller-joined'})

                elif msg_type == 'mp-register' and room_id:
                    r = get_room(room_id)
                    r['host'] = ws
                    r['mode'] = 'mp'
                    meta['room'] = room_id
                    meta['kind'] = 'host'
                    await safe_send(ws, {'type': 'mp-registered'})
                    if r['p1']:
                        await safe_send(ws, {'type': 'mp-player-joined', 'role': 'p1'})
                    if r['p2']:
                        await safe_send(ws, {'type': 'mp-player-joined', 'role': 'p2'})

                # --- PHONE / PLAYER JOIN ---
                elif msg_type == 'join' and room_id:
                    r = get_room(room_id)
                    role = d.get('role')
                    meta['room'] = room_id
                    meta['kind'] = 'phone'
                    meta['role'] = role

                    if role in ('p1', 'p2'):
                        r[role] = ws
                        await safe_send(ws, {'type': 'joined', 'role': role})
                        if r['host']:
                            await safe_send(r['host'], {'type': 'mp-player-joined', 'role': role})
                    else:
                        r['controller'] = ws
                        await safe_send(ws, {'type': 'joined'})
                        if r['host']:
                            await safe_send(r['host'], {'type': 'controller-joined'})

                # --- RELAY PHONE INPUT -> HOST ---
                elif msg_type == 'input':
                    r = rooms.get(meta['room'])
                    if r and r['host']:
                        await safe_send(r['host'], d)

                elif msg_type == 'mp-input':
                    r = rooms.get(meta['room'])
                    if r and r['host']:
                        d['role'] = meta['role']
                        await safe_send(r['host'], d)

                elif msg_type == 'mp-pos':
                    r = rooms.get(meta['room'])
                    if r:
                        d['role'] = meta.get('role', d.get('role'))
                        if r['host']:
                            await safe_send(r['host'], d)
                        opp = 'p2' if d.get('role') == 'p1' else 'p1'
                        if r.get(opp):
                            await safe_send(r[opp], d)

                elif msg_type == 'mp-finish':
                    r = rooms.get(meta['room'])
                    if r and r['host']:
                        d['role'] = meta.get('role', d.get('role'))
                        await safe_send(r['host'], d)

                # --- RELAY HOST STATE -> PHONES ---
                elif msg_type == 'telemetry':
                    r = rooms.get(meta['room'])
                    if r and r['controller']:
                        await safe_send(r['controller'], d)

                elif msg_type == 'mp-state':
                    r = rooms.get(meta['room'])
                    if r:
                        await safe_send(r['p1'], d)
                        await safe_send(r['p2'], d)

            elif msg_type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.CLOSE):
                break

    except Exception:
        pass
    finally:
        room_id = meta.get('room')
        role = meta.get('role')
        kind = meta.get('kind')
        if room_id and room_id in rooms:
            r = rooms[room_id]
            if kind == 'host':
                r['host'] = None
                await safe_send(r['controller'], {'type': 'host-left'})
                await safe_send(r['p1'], {'type': 'host-left'})
                await safe_send(r['p2'], {'type': 'host-left'})
            elif role in ('p1', 'p2'):
                r[role] = None
                if r['host']:
                    await safe_send(r['host'], {'type': 'mp-player-left', 'role': role})
            else:
                r['controller'] = None
                if r['host']:
                    await safe_send(r['host'], {'type': 'controller-left'})
            cleanup_room(room_id)

    return ws

async def index_handler(request):
    return web.FileResponse(os.path.join(BASE_DIR, 'index.html'))

async def ip_handler(request):
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = socket.gethostbyname(socket.gethostname())
    return web.json_response({'ip': local_ip})

app = web.Application()
# Primary HTTP & API routes
app.router.add_get('/', index_handler)
app.router.add_get('/index.html', index_handler)
app.router.add_get('/api/ip', ip_handler)
# Dedicated WebSocket relay route
app.router.add_get('/ws', ws_handler)

# Static files route
app.router.add_static('/', path=BASE_DIR, show_index=True)

if __name__ == '__main__':
    print(f"[INFO] Unified AIOHTTP HTTP + WebSocket Server running on port {HTTP_PORT}")
    web.run_app(app, host='0.0.0.0', port=HTTP_PORT)
