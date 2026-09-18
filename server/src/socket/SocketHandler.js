import { C2S, S2C } from './events.js';
import { RoomError } from '../errors.js';
import { ACTIONS, ROLES, can, isStaff } from '../permissions.js';
import {
  cleanChatText,
  cleanRoomPassword,
  cleanRoomTitle,
  cleanUsername,
  isValidTime,
  isValidUserId,
  isValidVideoId,
  normalizeRoomId,
} from '../validation.js';

const REQUEST_TYPES = ['play', 'pause', 'seek', 'change_video'];
const REACTIONS = ['🔥', '😂', '😮', '❤️', '👏', '😢'];
const staffChannel = (roomId) => `${roomId}:staff`;

/**
 * MessageHandler: turns socket events into Room method calls.
 *
 * Flow of every event:
 *   1. find the caller's room + participant   (requireMember)
 *   2. check permission for the action         (authorize)
 *   3. validate the payload                     (validation.js)
 *   4. mutate Room state                        (Room methods)
 *   5. broadcast the result to the room         (io.to(roomId).emit)
 * Any RoomError thrown on the way is sent back to the caller only.
 */
export class SocketHandler {
  constructor(io, roomManager, { disconnectGraceMs = 15_000, emptyRoomTtlMs = 10 * 60_000 } = {}) {
    this.io = io;
    this.rooms = roomManager;
    this.disconnectGraceMs = disconnectGraceMs;
    this.emptyRoomTtlMs = emptyRoomTtlMs;
  }

  attach() {
    this.io.on('connection', (socket) => this.#onConnection(socket));
  }

  #onConnection(socket) {
    socket.data.roomId = null;
    socket.data.userId = null;
    socket.data.lastReactionAt = 0;

    const routes = {
      [C2S.CREATE_ROOM]: this.handleCreateRoom,
      [C2S.JOIN_ROOM]: this.handleJoinRoom,
      [C2S.LEAVE_ROOM]: this.handleLeaveRoom,
      [C2S.PLAY]: this.handlePlay,
      [C2S.PAUSE]: this.handlePause,
      [C2S.SEEK]: this.handleSeek,
      [C2S.CHANGE_VIDEO]: this.handleChangeVideo,
      [C2S.ASSIGN_ROLE]: this.handleAssignRole,
      [C2S.REMOVE_PARTICIPANT]: this.handleRemoveParticipant,
      [C2S.TRANSFER_HOST]: this.handleTransferHost,
      [C2S.REQUEST_ACTION]: this.handleRequestAction,
      [C2S.RESOLVE_REQUEST]: this.handleResolveRequest,
      [C2S.CHAT_MESSAGE]: this.handleChatMessage,
      [C2S.REACTION]: this.handleReaction,
      [C2S.UPDATE_ROOM]: this.handleUpdateRoom,
      [C2S.CANCEL_REQUEST]: this.handleCancelRequest,
      [C2S.ADD_TO_PLAYLIST]: this.handleAddToPlaylist,
      [C2S.REMOVE_FROM_PLAYLIST]: this.handleRemoveFromPlaylist,
      [C2S.PLAY_PLAYLIST_ITEM]: this.handlePlayPlaylistItem,
      [C2S.MOVE_PLAYLIST_ITEM]: this.handleMovePlaylistItem,
    };

    for (const [event, handler] of Object.entries(routes)) {
      socket.on(event, (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          handler.call(this, socket, payload && typeof payload === 'object' ? payload : {}, reply);
        } catch (err) {
          this.#sendError(socket, err, reply, event);
        }
      });
    }

    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  /* ───────────── helpers ───────────── */

  #sendError(socket, err, reply, event) {
    const isExpected = err instanceof RoomError;
    if (!isExpected) console.error(`[socket] ${event} failed:`, err);
    const error = {
      code: isExpected ? err.code : 'INTERNAL',
      message: isExpected ? err.message : 'Something went wrong.',
      event,
    };
    socket.emit(S2C.ERROR, error);
    reply({ ok: false, error });
  }

  /** Returns the room + participant for this socket, or throws. */
  #requireMember(socket) {
    const room = socket.data.roomId ? this.rooms.getRoom(socket.data.roomId) : null;
    const me = room?.getParticipant(socket.data.userId);
    if (!room || !me) throw new RoomError('NOT_IN_ROOM', 'Join a room first.');
    return { room, me };
  }

  /** Role check. This is what stops a participant from sending `change_video` from the console. */
  #authorize(me, action) {
    if (!can(me.role, action)) {
      throw new RoomError('FORBIDDEN', `A ${me.role} is not allowed to ${action.replace(/_/g, ' ')}.`);
    }
  }

  #socketOf(participant) {
    return participant?.socketId ? this.io.sockets.sockets.get(participant.socketId) : null;
  }

  /** Host/mods sit in an extra channel so only they receive change requests. */
  #syncStaffChannel(room, participant) {
    const socket = this.#socketOf(participant);
    if (!socket) return;
    if (isStaff(participant.role)) {
      socket.join(staffChannel(room.id));
      socket.emit(S2C.REQUESTS_SNAPSHOT, { requests: room.listRequests(), history: room.listRequestHistory() });
    } else {
      socket.leave(staffChannel(room.id));
    }
  }

  #broadcastState(room, action, by, extra = {}) {
    this.io.to(room.id).emit(S2C.SYNC_STATE, {
      ...room.getState(),
      action,
      by: by ? { userId: by.userId, username: by.username } : null,
      ...extra,
    });
  }

  #scheduleEmptyRoomCleanup(room) {
    setTimeout(() => {
      if (this.rooms.getRoom(room.id) === room && room.size === 0) this.rooms.deleteRoom(room.id);
    }, this.emptyRoomTtlMs).unref?.();
  }

  /** Removes a participant and tells everyone. reason: 'left' | 'kicked' | 'timeout'. */
  #removeFromRoom(room, userId, reason) {
    const wasHost = room.hostUserId === userId;
    const removed = reason === 'kicked' ? room.kick(userId) : room.removeParticipant(userId);
    if (!removed) return;

    const socket = this.#socketOf(removed);
    if (socket) {
      socket.leave(room.id);
      socket.leave(staffChannel(room.id));
      socket.data.roomId = null;
      socket.data.userId = null;
    }

    if (room.size === 0) {
      this.rooms.deleteRoom(room.id);
      return;
    }

    const payload = {
      userId: removed.userId,
      username: removed.username,
      participants: room.listParticipants(),
    };
    if (reason === 'kicked') {
      this.io.to(room.id).emit(S2C.PARTICIPANT_REMOVED, payload);
    } else {
      this.io.to(room.id).emit(S2C.USER_LEFT, payload);
    }

    if (wasHost && reason !== 'kicked') {
      const next = room.electNewHost();
      if (next) {
        this.#syncStaffChannel(room, next);
        this.io.to(room.id).emit(S2C.ROLE_ASSIGNED, {
          userId: next.userId,
          username: next.username,
          role: ROLES.HOST,
          reason: 'host_left',
          participants: room.listParticipants(),
        });
      }
    }
    this.rooms.persist();
  }

  /* ───────────── room lifecycle ───────────── */

  handleCreateRoom(socket, { userId }, reply) {
    if (!isValidUserId(userId)) throw new RoomError('INVALID_USER', 'Invalid user id.');
    const room = this.rooms.createRoom(userId);
    this.#scheduleEmptyRoomCleanup(room);
    reply({ ok: true, roomId: room.id });
  }

  handleJoinRoom(socket, { roomId, userId, username, password }, reply) {
    const name = cleanUsername(username);
    if (!name) throw new RoomError('INVALID_USERNAME', 'Please enter a name.');
    if (!isValidUserId(userId)) throw new RoomError('INVALID_USER', 'Invalid user id.');

    const room = this.rooms.getRoom(roomId);
    if (!room) throw new RoomError('ROOM_NOT_FOUND', `Room ${normalizeRoomId(roomId)} does not exist.`);
    // Existing members may refresh without being prompted for the password again.
    // New people must prove they know it before they get a seat in the room.
    if (!room.getParticipant(userId) && !room.verifyPassword(password)) {
      throw new RoomError('PASSWORD_REQUIRED', 'This room needs the correct password.');
    }

    // already in a different room on this socket? leave it first
    if (socket.data.roomId && socket.data.roomId !== room.id) {
      const oldRoom = this.rooms.getRoom(socket.data.roomId);
      if (oldRoom) this.#removeFromRoom(oldRoom, socket.data.userId, 'left');
    }

    const { participant, isNew } = room.join(userId, name);

    // same user opened the room in another tab -> the newest tab wins
    const oldSocket = this.#socketOf(participant);
    if (oldSocket && oldSocket.id !== socket.id) {
      oldSocket.emit(S2C.SESSION_REPLACED, { roomId: room.id });
      oldSocket.leave(room.id);
      oldSocket.leave(staffChannel(room.id));
      oldSocket.data.roomId = null;
      oldSocket.data.userId = null;
    }
    const wasOffline = !participant.online;

    participant.connect(socket.id);
    socket.join(room.id);
    socket.data.roomId = room.id;
    socket.data.userId = userId;
    this.#syncStaffChannel(room, participant);
    this.rooms.persist();

    reply({
      ok: true,
      roomId: room.id,
      self: participant.toJSON(),
      participants: room.listParticipants(),
      chat: room.chat,
      roomMeta: room.getMeta(),
      myRequests: room.listRequests().filter((request) => request.userId === userId),
      playlist: room.playlist,
    });

    // late joiners get the current video state immediately
    socket.emit(S2C.SYNC_STATE, { ...room.getState(), action: 'join', by: null });

    if (isNew || wasOffline) {
      socket.to(room.id).emit(S2C.USER_JOINED, {
        userId: participant.userId,
        username: participant.username,
        role: participant.role,
        rejoined: !isNew,
        participants: room.listParticipants(),
      });
    }
  }

  handleUpdateRoom(socket, { title, emoji, password, removePassword }, reply) {
    const { room, me } = this.#requireMember(socket);
    this.#authorize(me, ACTIONS.MANAGE_ROOM);
    const cleanTitle = title === undefined ? null : cleanRoomTitle(title);
    if (title !== undefined && !cleanTitle) throw new RoomError('INVALID_ROOM_TITLE', 'Room name must be 1–48 characters.');
    const cleanPassword = password === undefined || password === '' ? null : cleanRoomPassword(password);
    if (password !== undefined && password !== '' && !cleanPassword) throw new RoomError('INVALID_PASSWORD', 'Password must be 4–64 characters.');
    const meta = room.updateMeta({ title: cleanTitle, emoji, password: cleanPassword, removePassword });
    this.rooms.persist();
    this.io.to(room.id).emit(S2C.ROOM_UPDATED, meta);
    reply({ ok: true, roomMeta: meta });
  }

  handleLeaveRoom(socket, _payload, reply) {
    const { room, me } = this.#requireMember(socket);
    this.#removeFromRoom(room, me.userId, 'left');
    reply({ ok: true });
  }

  handleDisconnect(socket) {
    const room = socket.data.roomId ? this.rooms.getRoom(socket.data.roomId) : null;
    const me = room?.getParticipant(socket.data.userId);
    if (!room || !me || me.socketId !== socket.id) return;

    // Keep their seat (and role) for a short grace period so a page refresh doesn't kick the host.
    me.disconnect();
    this.rooms.persist();
    this.io.to(room.id).emit(S2C.PRESENCE_CHANGED, { participants: room.listParticipants() });

    me.disconnectTimer = setTimeout(() => {
      if (!me.online && room.getParticipant(me.userId) === me) {
        this.#removeFromRoom(room, me.userId, 'timeout');
      }
    }, this.disconnectGraceMs);
    me.disconnectTimer.unref?.();
  }

  /* ───────────── playback (host + moderator) ───────────── */

  #applyPlayback(room, type, payload, by, extra) {
    switch (type) {
      case 'play':
        room.play(isValidTime(payload.time) ? payload.time : undefined);
        break;
      case 'pause':
        room.pause(isValidTime(payload.time) ? payload.time : undefined);
        break;
      case 'seek':
        if (!isValidTime(payload.time)) throw new RoomError('INVALID_TIME', 'Invalid seek time.');
        room.seek(payload.time);
        break;
      case 'change_video':
        if (!isValidVideoId(payload.videoId)) throw new RoomError('INVALID_VIDEO', 'Invalid YouTube video id.');
        room.changeVideo(payload.videoId);
        break;
      default:
        throw new RoomError('INVALID_ACTION', 'Unknown action.');
    }
    this.#broadcastState(room, type, by, extra);
    this.rooms.persist();
  }

  #handlePlayback(socket, type, payload, reply) {
    const { room, me } = this.#requireMember(socket);
    this.#authorize(me, type === 'change_video' ? ACTIONS.CHANGE_VIDEO : ACTIONS.CONTROL_PLAYBACK);
    this.#applyPlayback(room, type, payload, me);
    reply({ ok: true });
  }

  handlePlay(socket, payload, reply) {
    this.#handlePlayback(socket, 'play', payload, reply);
  }

  handlePause(socket, payload, reply) {
    this.#handlePlayback(socket, 'pause', payload, reply);
  }

  handleSeek(socket, payload, reply) {
    this.#handlePlayback(socket, 'seek', payload, reply);
  }

  handleChangeVideo(socket, payload, reply) {
    this.#handlePlayback(socket, 'change_video', payload, reply);
  }

  /* ───────────── host controls ───────────── */

  handleAssignRole(socket, { userId, role }, reply) {
    const { room, me } = this.#requireMember(socket);
    this.#authorize(me, ACTIONS.ASSIGN_ROLE);
    if (userId === me.userId) throw new RoomError('INVALID_TARGET', 'You cannot change your own role.');

    const target = room.assignRole(userId, role);
    this.#syncStaffChannel(room, target);

    this.io.to(room.id).emit(S2C.ROLE_ASSIGNED, {
      userId: target.userId,
      username: target.username,
      role: target.role,
      by: { userId: me.userId, username: me.username },
      participants: room.listParticipants(),
    });
    this.rooms.persist();
    reply({ ok: true });
  }

  handleTransferHost(socket, { userId }, reply) {
    const { room, me } = this.#requireMember(socket);
    this.#authorize(me, ACTIONS.TRANSFER_HOST);

    const { previous, next } = room.transferHost(userId);
    this.#syncStaffChannel(room, next);
    if (previous) this.#syncStaffChannel(room, previous);

    this.io.to(room.id).emit(S2C.ROLE_ASSIGNED, {
      userId: next.userId,
      username: next.username,
      role: ROLES.HOST,
      reason: 'host_transferred',
      previousHostId: previous?.userId ?? null,
      by: { userId: me.userId, username: me.username },
      participants: room.listParticipants(),
    });
    this.rooms.persist();
    reply({ ok: true });
  }

  handleRemoveParticipant(socket, { userId }, reply) {
    const { room, me } = this.#requireMember(socket);
    this.#authorize(me, ACTIONS.REMOVE_PARTICIPANT);
    if (userId === me.userId) throw new RoomError('INVALID_TARGET', 'You cannot remove yourself.');

    const target = room.requireParticipant(userId);
    const targetSocket = this.#socketOf(target);
    targetSocket?.emit(S2C.KICKED, { roomId: room.id, by: me.username });

    this.#removeFromRoom(room, target.userId, 'kicked');
    reply({ ok: true });
  }

  /* ───────────── participant requests ───────────── */

  handleRequestAction(socket, { type, payload = {} }, reply) {
    const { room, me } = this.#requireMember(socket);
    this.#authorize(me, ACTIONS.REQUEST_CHANGE);
    if (!REQUEST_TYPES.includes(type)) throw new RoomError('INVALID_ACTION', 'Unknown request type.');

    const clean = {};
    if (type === 'seek') {
      if (!isValidTime(payload.time)) throw new RoomError('INVALID_TIME', 'Invalid seek time.');
      clean.time = payload.time;
    }
    if (type === 'change_video') {
      if (!isValidVideoId(payload.videoId)) throw new RoomError('INVALID_VIDEO', 'Invalid YouTube video id.');
      clean.videoId = payload.videoId;
    }

    const request = room.createRequest(me, type, clean);
    this.rooms.persist();
    this.io.to(staffChannel(room.id)).emit(S2C.REQUEST_CREATED, request);
    reply({ ok: true, requestId: request.id });
  }

  handleResolveRequest(socket, { requestId, approve }, reply) {
    const { room, me } = this.#requireMember(socket);
    this.#authorize(me, ACTIONS.RESOLVE_REQUEST);

    const request = room.takeRequest(requestId);
    const approved = approve === true;
    if (approved) {
      this.#applyPlayback(room, request.type, request.payload, me, {
        requestedBy: { userId: request.userId, username: request.username },
      });
    }

    const result = {
      requestId: request.id,
      type: request.type,
      approved,
      userId: request.userId,
      by: { userId: me.userId, username: me.username },
    };
    room.addRequestHistory(request, { approved, by: me });
    this.rooms.persist();
    this.io.to(staffChannel(room.id)).emit(S2C.REQUEST_RESOLVED, result);
    this.#socketOf(room.getParticipant(request.userId))?.emit(S2C.REQUEST_RESOLVED, result);
    this.io.to(staffChannel(room.id)).emit(S2C.REQUESTS_SNAPSHOT, { requests: room.listRequests(), history: room.listRequestHistory() });
    reply({ ok: true });
  }

  handleCancelRequest(socket, { requestId }, reply) {
    const { room, me } = this.#requireMember(socket);
    const request = room.cancelRequest(requestId, me.userId);
    const payload = { requestId: request.id, userId: me.userId, username: me.username };
    this.rooms.persist();
    this.io.to(staffChannel(room.id)).emit(S2C.REQUEST_CANCELLED, payload);
    socket.emit(S2C.REQUEST_CANCELLED, payload);
    reply({ ok: true });
  }

  handleAddToPlaylist(socket, { videoId }, reply) {
    const { room, me } = this.#requireMember(socket);
    this.#authorize(me, ACTIONS.MANAGE_PLAYLIST);
    if (!isValidVideoId(videoId)) throw new RoomError('INVALID_VIDEO', 'Invalid YouTube video id.');
    room.addToPlaylist(videoId, me);
    this.rooms.persist();
    this.io.to(room.id).emit(S2C.PLAYLIST_UPDATED, { playlist: room.playlist });
    reply({ ok: true });
  }

  handleRemoveFromPlaylist(socket, { itemId }, reply) {
    const { room, me } = this.#requireMember(socket);
    this.#authorize(me, ACTIONS.MANAGE_PLAYLIST);
    room.removeFromPlaylist(itemId);
    this.rooms.persist();
    this.io.to(room.id).emit(S2C.PLAYLIST_UPDATED, { playlist: room.playlist });
    reply({ ok: true });
  }

  handlePlayPlaylistItem(socket, { itemId }, reply) {
    const { room, me } = this.#requireMember(socket);
    this.#authorize(me, ACTIONS.MANAGE_PLAYLIST);
    room.playPlaylistItem(itemId);
    this.#broadcastState(room, 'change_video', me, { fromPlaylist: true });
    this.rooms.persist();
    this.io.to(room.id).emit(S2C.PLAYLIST_UPDATED, { playlist: room.playlist });
    reply({ ok: true });
  }

  handleMovePlaylistItem(socket, { itemId, direction }, reply) {
    const { room, me } = this.#requireMember(socket);
    this.#authorize(me, ACTIONS.MANAGE_PLAYLIST);
    room.movePlaylistItem(itemId, direction);
    this.rooms.persist();
    this.io.to(room.id).emit(S2C.PLAYLIST_UPDATED, { playlist: room.playlist });
    reply({ ok: true });
  }

  /* ───────────── chat + reactions ───────────── */

  handleChatMessage(socket, { text }, reply) {
    const { room, me } = this.#requireMember(socket);
    this.#authorize(me, ACTIONS.CHAT);
    const clean = cleanChatText(text);
    if (!clean) throw new RoomError('INVALID_MESSAGE', 'Message is empty.');
    this.io.to(room.id).emit(S2C.CHAT_MESSAGE, room.addChatMessage(me, clean));
    this.rooms.persist();
    reply({ ok: true });
  }

  handleReaction(socket, { emoji }, reply) {
    const { room, me } = this.#requireMember(socket);
    this.#authorize(me, ACTIONS.CHAT);
    if (!REACTIONS.includes(emoji)) throw new RoomError('INVALID_REACTION', 'Unknown reaction.');

    const now = Date.now();
    if (now - socket.data.lastReactionAt < 250) return reply({ ok: false }); // tiny rate limit
    socket.data.lastReactionAt = now;

    this.io.to(room.id).emit(S2C.REACTION, {
      id: `${me.userId}-${now}`,
      emoji,
      userId: me.userId,
      username: me.username,
      videoTime: room.getCurrentTime(now),
    });
    reply({ ok: true });
  }
}
