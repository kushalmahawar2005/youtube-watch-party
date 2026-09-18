# 🎬 YouTube Watch Party

Watch YouTube videos together in real time. The host (and moderators) control playback; everyone in the room sees the same video at the same second.

**Live demo:** `https://<your-app>.onrender.com`  ← _replace after deploying_

## Features

- Create a room → get a 6-character code + invite link
- Join by code or link (joiners are **Participants**)
- Play / pause / seek / change-video sync over **WebSockets (Socket.IO)**
- **Search YouTube inside the room** (YouTube Data API v3) or paste a link; results show thumbnail, channel, duration, views
- Now-playing and change-video requests show real video details (title, channel, views)
- Roles: **Host**, **Moderator**, **Participant**, **Viewer**, enforced on the **server**
- Host can assign roles, remove participants, transfer host
- Participants can **request** play / pause / seek / a new video → host or moderator approves
- Late joiners jump straight to the current position
- Refresh-safe: a disconnected user keeps their seat and role for 15 seconds
- If the host leaves, the next best person becomes host automatically
- Chat and floating emoji reactions
- OOP backend (`Room`, `Participant`, `RoomManager`, `SocketHandler`) with automated tests

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite, React Router |
| Backend | Node.js + Express 5 |
| Real-time | Socket.IO (WebSocket) |
| Video | YouTube IFrame Player API + YouTube Data API v3 (search, details) |
| Storage | In-memory (`Map`), see trade-offs in ARCHITECTURE.md |
| Tests | `node:test` + `socket.io-client` |

## Project structure

```
youtube-watch-party/
├── package.json            # root scripts (build / start for deployment)
├── render.yaml             # Render deploy blueprint
├── server/
│   ├── src/
│   │   ├── index.js            # entry: starts HTTP + Socket.IO
│   │   ├── app.js              # Express app, REST routes, serves React build
│   │   ├── permissions.js      # ROLES, ACTIONS, can(role, action)
│   │   ├── validation.js       # input validators
│   │   ├── errors.js           # RoomError
│   │   ├── services/
│   │   │   └── YouTubeService.js # Data API proxy: search + video details, TTL cache
│   │   ├── models/
│   │   │   ├── Participant.js
│   │   │   ├── Room.js          # participants, playback state, chat, requests
│   │   │   └── RoomManager.js   # all rooms + room code generator
│   │   └── socket/
│   │       ├── events.js        # event names
│   │       └── SocketHandler.js # event → permission check → Room → broadcast
│   └── test/watchParty.test.js
└── client/
    ├── index.html
    ├── vite.config.js           # dev proxy /api and /socket.io → :3001
    └── src/
        ├── pages/ Home.jsx, Room.jsx
        ├── hooks/ useRoom.js (socket state), useSyncedPlayer.js (YouTube sync)
        ├── components/ VideoStage, ParticipantList, RequestsPanel, ChatPanel, …
        └── lib/ socket.js, youtube.js, identity.js, permissions.js, events.js
```

## Run locally

Requirements: **Node.js 20.19+** (22 recommended).

```bash
# 1. install
npm run install:all

# (optional) enable in-room search
cp .env.example .env   # then set YOUTUBE_API_KEY

# 2. start backend (terminal 1)  → http://localhost:3001
npm run dev:server

# 3. start frontend (terminal 2) → http://localhost:5173
npm run dev:client
```

Open http://localhost:5173, create a room, then open the invite link in **another browser / incognito window** (a duplicated tab shares the same identity).

### Production mode locally

```bash
npm run build   # installs everything + builds React into client/dist
npm start       # Express serves client/dist + API + WebSocket on :3001
```

### Tests

```bash
npm test
```

Covers: host/participant assignment, broadcast, permission rejection, promote to moderator, request + approve, remove + no rejoin, transfer host, late-join state, host disconnect → new host, chat.

## Deploy (Render, one service)

1. Push this folder to a GitHub repo.
2. On [render.com](https://render.com) → **New → Blueprint** → pick the repo (uses `render.yaml`).
   Or **New → Web Service**: Build `npm run build`, Start `npm start`, env `NODE_VERSION=22`.
3. Open the `.onrender.com` URL and paste it at the top of this README.

Why one service: React build, REST API and WebSocket share one origin, so no CORS setup and a single URL.
Set `YOUTUBE_API_KEY` in the Render dashboard (Environment). It is never sent to the browser: the client calls `/api/youtube/*` on our server.
Note: Render's free plan sleeps after ~15 min idle (first load takes ~30-50 s), and a restart clears in-memory rooms.

**Split deploy (optional):** frontend on Vercel/Netlify with `VITE_SERVER_URL=https://<backend>.onrender.com`, backend on Render/Railway with `CLIENT_ORIGIN=https://<frontend-domain>`. Vercel serverless functions can't hold WebSocket connections, so the backend must live on Render/Railway.

## Environment variables

| Name | Where | Purpose |
|---|---|---|
| `PORT` | server | Port (Render sets it automatically) |
| `YOUTUBE_API_KEY` | server | YouTube Data API v3 key. Enables search + video details. Without it, pasting links still works |
| `CLIENT_ORIGIN` | server | Allowed frontend origin(s) for CORS, only for split deploy |
| `VITE_SERVER_URL` | client (build) | Backend URL, only for split deploy |

See **ARCHITECTURE.md** for how WebSockets, sync and roles work.
