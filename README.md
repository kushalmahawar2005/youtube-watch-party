# YouTube Watch Party

Watch a YouTube video together in a room. The host controls playback and everyone else stays in sync.

**Live demo:** https://mediumvioletred-oryx-264272.hostingersite.com/

## What it includes

- Create a room and share its invite link
- Join with a room code or invite link
- Synced play, pause, seek and video changes using Socket.IO
- Host, moderator, participant and viewer roles
- Role changes, participant removal and host transfer
- Participant requests for playback or video changes
- YouTube search, chat, reactions and an Up Next playlist
- Room snapshots so the room can recover after a restart on the same disk

## Tech used

- React + Vite
- Node.js + Express
- Socket.IO
- YouTube IFrame Player API and YouTube Data API v3

## Run locally

Node.js 20.19+ is required.

```bash
npm run install:all
cp .env.example .env
# Add YOUTUBE_API_KEY to .env if you want in-app YouTube search
```

Start the server and client in separate terminals:

```bash
npm run dev:server
npm run dev:client
```

Open `http://localhost:5173`. To test syncing, create a room and open the invite link in an incognito window or another browser.

## Tests

```bash
npm test
```

The tests cover permissions, real-time sync, role changes, requests, room recovery, playlist actions and chat.

## Deployment

The app is deployed on Hostinger at the live link above. The frontend, API and Socket.IO server run together as one Node.js service.

For a short explanation of the WebSocket flow and role checks, see [ARCHITECTURE.md](ARCHITECTURE.md).
