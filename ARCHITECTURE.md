# Architecture overview

## 1. Big picture

```
 Browser (Host)          Browser (Participant)        Browser (Moderator)
 React + YT player       React + YT player            React + YT player
        │                        │                            │
        └──────── Socket.IO (WebSocket, stays open) ──────────┘
                                 │
                    Node.js: Express + Socket.IO
                    ┌──────────────────────────────┐
                    │ SocketHandler (MessageHandler)│  events → checks → broadcast
                    │ RoomManager  → Map<code,Room> │
                    │ Room → Participants, playback,│
                    │        chat, requests         │
                    └──────────────────────────────┘
```

Every browser runs its **own** YouTube player. The server does not stream video; it only stores
the **state** (`videoId`, playing/paused, time) and tells everyone to apply it.

## 2. Why WebSockets

HTTP is request → response. The server can't push "host paused" to other people on its own.
A WebSocket stays open in both directions, so the server can broadcast instantly.
Socket.IO adds rooms (`io.to(roomId).emit`), acknowledgements (callbacks), auto-reconnect and a polling fallback.

## 3. Event flow

### Create and join
1. Home: `create_room {userId}` → server creates a `Room` with `hostUserId = userId` → ack `{roomId}`.
2. Room page: `join_room {roomId, userId, username}` → server adds a `Participant`
   (role = `host` if `userId === hostUserId`, otherwise `participant`), then `socket.join(roomId)`.
3. Server replies (ack) with `participants` + `chat`, sends `sync_state` to the new socket,
   and broadcasts `user_joined` to the others.

### Playback sync (the core loop)
```
Host clicks ▶
  client  → emit('play', { time: 42.3 })
  server  → requireMember → authorize(CONTROL_PLAYBACK) → validate → room.play(42.3)
  server  → io.to(roomId).emit('sync_state', { videoId, playState:'playing', currentTime:42.3 })
  every client (including the host) → player.seekTo(42.3) + player.playVideo()
```

**No echo loop:** custom controls emit playback events directly. A direct tap on YouTube's own
play/pause target is also relayed to the server, but client-applied `sync_state` updates are
briefly suppressed so they cannot echo back as a second event.

**Time math:** the server saves `position` + `updatedAt` instead of running a timer.
Live time = `position + (now − updatedAt) / 1000` while playing. A late joiner gets that value.

**Drift correction:** every 500 ms the client compares the player time with the expected time
(`currentTime + time since the sync_state arrived`) and seeks if the difference is over 1.5 s.

**Autoplay block:** if the browser refuses to start playback, a "Tap to join playback" overlay appears.

## 4. Role-based access control

`server/src/permissions.js` is the single source of truth:

| Action | Host | Moderator | Participant | Viewer |
|---|:-:|:-:|:-:|:-:|
| play / pause / seek | ✅ | ✅ | request | ❌ |
| change video | ✅ | ✅ | request | ❌ |
| approve requests | ✅ | ✅ | ❌ | ❌ |
| assign role / remove / transfer host | ✅ | ❌ | ❌ | ❌ |
| chat + reactions | ✅ | ✅ | ✅ | ✅ |

Every handler in `SocketHandler` runs: **find member → `can(role, action)` → validate → mutate Room → broadcast**.
If the check fails, a `RoomError('FORBIDDEN')` goes back only to the caller (`error_message` + ack).
The frontend also disables buttons, but that is only UX. Sending `change_video` from the browser console as a participant is still rejected.

Host and moderators also join a private channel `ROOMID:staff`, so only they receive `request_created`.

## 5. Socket events

**Client → Server:** `create_room`, `join_room`, `leave_room`, `play`, `pause`, `seek`, `change_video`,
`assign_role`, `remove_participant`, `transfer_host`, `request_action`, `resolve_request`, `chat_message`, `reaction`

**Server → Client:** `sync_state`, `user_joined`, `user_left`, `presence_changed`, `role_assigned`,
`participant_removed`, `kicked`, `session_replaced`, `request_created`, `request_resolved`,
`requests_snapshot`, `chat_message`, `reaction`, `error_message`

## 6. Edge cases handled

- **Refresh / network drop:** `userId` lives in sessionStorage. On disconnect the participant is marked offline
  and kept for 15 s. Reconnecting with the same `userId` restores their seat and role.
- **Host leaves:** after the grace period `room.electNewHost()` promotes an online moderator first, then the earliest joiner.
- **Removed user:** added to `kickedUserIds`, can't rejoin that room.
- **Same user in two tabs:** the newest tab wins, the old one gets `session_replaced`.
- **Empty rooms** are deleted (immediately when the last person leaves, after 10 min if never joined).
- **Validation:** video id regex, time range, name/chat length, role whitelist, reaction rate limit.

## 7. Persistence, trade-offs and scaling

- **File-backed snapshots:** `RoomStore` writes room metadata, playback state, participants, chat,
  requests and playlist data to `data/rooms.json`. It survives a process restart when the host keeps
  the same disk. It is deliberately ignored by Git because it contains live room data.
- **Production durability:** local disk is not enough for multiple instances or ephemeral hosts.
  The next step is Redis or Postgres for shared, durable state.
- **Scaling to 1,000+ users on multiple instances:** add `@socket.io/redis-adapter` so `io.to(room).emit`
  reaches sockets on every instance, move `Room` state to Redis, and use sticky sessions on the load balancer.
- **Identity:** random `userId` per tab, no login. Enough for the assignment; real auth would use JWT sessions.
- **Sync accuracy:** within ~1 s, limited by network latency and YouTube buffering. Good enough for watching together.

## YouTube Data API (search + video details)

The browser never sees the API key. React calls our REST endpoints, the server calls Google:

```
VideoPicker ── GET /api/youtube/search?q=lofi ──▶ Express ──▶ YouTubeService ──▶ googleapis.com/youtube/v3
                                                               (TTL cache)
```

- `search.list` costs **100 quota units** (default daily quota: 10,000), so autocomplete is debounced
  while typing and results are cached for 30 min. `videos.list` costs 1 unit and is cached for 6 h.
- Search results are filtered to **embeddable** videos, so everything in the list can play in the IFrame player.
- Search is only a way to pick a `videoId`. Syncing still goes through the same `change_video` / `request_action`
  socket events, so the role checks on the backend are unchanged.
- Without `YOUTUBE_API_KEY`, `/api/config` returns `youtubeSearch: false` and the UI falls back to pasting links.
