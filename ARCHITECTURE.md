# Architecture overview

## How the app works

Each person in a room has their own YouTube player. The server does not send the video itself. It only keeps track of the video ID, play/pause state and current time.

When the host plays, pauses, seeks, or changes a video, the browser sends that action to the Node.js server through Socket.IO. The server checks the user's role and sends the latest state to everyone in the room. Each browser then updates its own YouTube player.

```
Host / participant browser
        |
        | Socket.IO
        v
Node.js + Express server
        |
        | sync_state to the room
        v
All connected browsers update their player
```

## Main parts

- `client/` contains the React UI.
- `server/src/models/Room.js` keeps room members, playback state, chat, requests and playlist data.
- `server/src/socket/SocketHandler.js` receives socket events, checks permissions and broadcasts updates.
- `server/src/permissions.js` defines what each role can do.
- `server/src/services/RoomStore.js` saves room snapshots to disk.

## Roles

| Role | What they can do |
|---|---|
| Host | Controls playback, changes roles, removes members and transfers host access |
| Moderator | Controls playback and handles participant requests |
| Participant | Watches, chats and can send requests to the host/moderator |
| Viewer | Watches and chats only |

The server checks permissions before every important action. Hiding a button in the UI is not the only protection.

## Sync example

1. The host clicks pause at 42 seconds.
2. The client sends `pause` with the current time.
3. The server verifies that the user is allowed to control playback.
4. The server broadcasts the updated state to everyone in that room.
5. Other players pause close to the same timestamp.

The client also checks playback position regularly and corrects larger drift. A person who joins late receives the current room state immediately.

## Data and recovery

Room data is saved in `data/rooms.json`. This keeps room settings, playback state, chat and playlist data after a server restart on the same machine. The file is ignored by Git because it can contain live room data.

## YouTube search

The browser asks this app's server for search results. The server uses the YouTube Data API and keeps the API key in environment variables, so the key is never exposed in browser code. Search results are limited to embeddable videos.

## Current limits

This is an internship project, so it uses local file storage and no login system. A larger deployment would use a shared database or Redis and proper user authentication.
