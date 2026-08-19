# Nexus Drive — Relay Server

This tiny server is what lets **Phone Control** and **Multiplayer** work
from *any* network — no shared Wi-Fi, no typing an IP address. It does two
things:

1. Serves `controller.html` (the page a phone opens after scanning the QR code).
2. Relays WebSocket messages between the PC (host) and the phone(s).

It does **not** run any game logic itself — the PC (browser) is always the
authority; this just passes messages back and forth.

## 1. Deploy it (Render.com — free tier works)

1. Push this `relay-server` folder to its own GitHub repo (or a subfolder
   of your existing repo — just point Render at this folder as the root).
2. Go to https://render.com → **New +** → **Web Service** → connect the repo.
3. Settings:
   - **Root Directory:** `relay-server` (if it's a subfolder)
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free is fine for testing/demos
4. Deploy. Render gives you a URL like `https://nexus-drive-relay.onrender.com`.
   Your WebSocket URL is the same host with `wss://` instead of `https://`:
   `wss://nexus-drive-relay.onrender.com`

Any Node host that supports long-lived WebSocket connections works the same
way (Railway, Fly.io, a small VPS, etc.) — Render is just the easiest free
option. Serverless platforms (Vercel/Netlify functions) do **not** work
here because they can't hold a persistent WebSocket connection open.

Note: Render's free tier spins the service down after inactivity and takes
a few seconds to wake back up on the next connection — fine for a demo,
but for a booth/event running all day consider a paid instance so the
first QR scan of the day isn't slow.

## 2. Point the game at it

Open `js/config.js` (loaded by `index.html`), find this line near the top:

```js
const WS_RELAY_URL = ''; // e.g. 'wss://nexus-drive-relay.onrender.com'
```

Set it to your deployed URL:

```js
const WS_RELAY_URL = 'wss://nexus-drive-relay.onrender.com';
```

That's it. Once this is set, the game skips the "enter server address"
screen entirely for both Phone Control and Multiplayer — players just
scan the QR code shown on screen, from any network.

(Leave it empty and the game falls back to the old manual-address flow,
useful if you want to test locally on your own Wi-Fi first with
`node server.js` running on your machine.)

## 3. Local testing before you deploy

```
cd relay-server
npm install
npm start
```

This starts the relay on `ws://localhost:8787`. On the PC, leave
`WS_RELAY_URL` empty, open the game, and the address field will suggest
your machine's LAN IP — same as the original local-Wi-Fi flow. This is
just for testing the protocol; it still requires the same Wi-Fi, which is
exactly what deploying to Render removes.

## Protocol reference

See the comment block at the top of `server.js` — it documents every
message type the game and controller page exchange.
