import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { Participant } from './Participant.js';
import { RoomError } from '../errors.js';
import { ROLES, ASSIGNABLE_ROLES } from '../permissions.js';

export const DEFAULT_VIDEO_ID = 'M7lc1UVf-VE'; // YouTube IFrame API demo video
const MAX_CHAT_HISTORY = 100;
const MAX_REQUEST_HISTORY = 30;
const ROLE_ORDER = { host: 0, moderator: 1, participant: 2, viewer: 3 };

/**
 * A watch-party room: who is inside, what they are watching, chat and pending requests.
 * Pure state + rules. It knows nothing about sockets (easy to test, easy to explain).
 */
export class Room {
  constructor(id, hostUserId) {
    this.id = id;
    this.hostUserId = hostUserId;
    this.createdAt = Date.now();
    this.participants = new Map(); // userId -> Participant
    this.kickedUserIds = new Set();
    this.chat = [];
    this.requests = new Map(); // requestId -> request
    this.requestHistory = [];
    this.playlist = [];
    this.title = 'My watch party';
    this.emoji = '🎬';
    this.passwordHash = null;

    /**
     * Playback is stored as "position at time updatedAt".
     * The live position is calculated on demand, so the server never needs a timer.
     */
    this.playback = {
      videoId: DEFAULT_VIDEO_ID,
      isPlaying: false,
      position: 0,
      updatedAt: Date.now(),
    };
  }

  /* ───────────── participants ───────────── */

  get size() {
    return this.participants.size;
  }

  get isPrivate() {
    return Boolean(this.passwordHash);
  }

  getMeta() {
    return { title: this.title, emoji: this.emoji, isPrivate: this.isPrivate };
  }

  toSnapshot() {
    return {
      id: this.id,
      hostUserId: this.hostUserId,
      createdAt: this.createdAt,
      participants: [...this.participants.values()].map((p) => ({ userId: p.userId, username: p.username, role: p.role, joinedAt: p.joinedAt })),
      kickedUserIds: [...this.kickedUserIds],
      chat: this.chat,
      requests: this.listRequests(),
      requestHistory: this.requestHistory,
      playlist: this.playlist,
      title: this.title,
      emoji: this.emoji,
      passwordHash: this.passwordHash,
      playback: this.playback,
    };
  }

  static fromSnapshot(snapshot) {
    if (!snapshot?.id || !snapshot?.hostUserId) return null;
    const room = new Room(snapshot.id, snapshot.hostUserId);
    room.createdAt = Number.isFinite(snapshot.createdAt) ? snapshot.createdAt : Date.now();
    room.title = typeof snapshot.title === 'string' && snapshot.title ? snapshot.title : room.title;
    room.emoji = typeof snapshot.emoji === 'string' && snapshot.emoji ? snapshot.emoji : room.emoji;
    room.passwordHash = typeof snapshot.passwordHash === 'string' ? snapshot.passwordHash : null;
    room.playback = snapshot.playback && typeof snapshot.playback === 'object' ? { ...room.playback, ...snapshot.playback, isPlaying: false, updatedAt: Date.now() } : room.playback;
    room.kickedUserIds = new Set(Array.isArray(snapshot.kickedUserIds) ? snapshot.kickedUserIds : []);
    room.chat = Array.isArray(snapshot.chat) ? snapshot.chat.slice(-MAX_CHAT_HISTORY) : [];
    room.requests = new Map((Array.isArray(snapshot.requests) ? snapshot.requests : []).filter((r) => r?.id).map((r) => [r.id, r]));
    room.requestHistory = Array.isArray(snapshot.requestHistory) ? snapshot.requestHistory.slice(0, MAX_REQUEST_HISTORY) : [];
    room.playlist = Array.isArray(snapshot.playlist) ? snapshot.playlist.filter((item) => item?.id && item?.videoId) : [];
    for (const data of Array.isArray(snapshot.participants) ? snapshot.participants : []) {
      if (!data?.userId || !data?.username || !data?.role) continue;
      const participant = new Participant(data);
      participant.joinedAt = Number.isFinite(data.joinedAt) ? data.joinedAt : Date.now();
      room.participants.set(participant.userId, participant);
    }
    return room;
  }

  updateMeta({ title, emoji, password, removePassword }) {
    if (title) this.title = title;
    if (emoji) this.emoji = emoji;
    if (password) this.passwordHash = this.#hashPassword(password);
    if (removePassword === true) this.passwordHash = null;
    return this.getMeta();
  }

  verifyPassword(password) {
    if (!this.passwordHash) return true;
    if (typeof password !== 'string') return false;
    const [salt, expected] = this.passwordHash.split(':');
    const actual = scryptSync(password, salt, 32).toString('hex');
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
  }

  #hashPassword(password) {
    const salt = randomBytes(16).toString('hex');
    return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
  }

  getParticipant(userId) {
    return this.participants.get(userId) ?? null;
  }

  /** Adds a user (or returns the existing one when they reconnect). */
  join(userId, username) {
    if (this.kickedUserIds.has(userId)) {
      throw new RoomError('KICKED', 'You were removed from this room by the host.');
    }
    const existing = this.participants.get(userId);
    if (existing) {
      existing.username = username;
      return { participant: existing, isNew: false };
    }
    const role = userId === this.hostUserId ? ROLES.HOST : ROLES.PARTICIPANT;
    const participant = new Participant({ userId, username, role });
    this.participants.set(userId, participant);
    return { participant, isNew: true };
  }

  removeParticipant(userId) {
    const participant = this.participants.get(userId);
    if (!participant) return null;
    participant.clearDisconnectTimer();
    this.participants.delete(userId);
    // drop their pending requests
    for (const [id, req] of this.requests) {
      if (req.userId === userId) this.requests.delete(id);
    }
    return participant;
  }

  kick(userId) {
    this.kickedUserIds.add(userId);
    return this.removeParticipant(userId);
  }

  /** Participants sorted: host, moderators, participants, viewers (then by join time). */
  listParticipants() {
    return [...this.participants.values()]
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joinedAt - b.joinedAt)
      .map((p) => p.toJSON());
  }

  assignRole(targetUserId, role) {
    if (!ASSIGNABLE_ROLES.includes(role)) {
      throw new RoomError('INVALID_ROLE', `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}`);
    }
    const target = this.requireParticipant(targetUserId);
    if (target.role === ROLES.HOST) {
      throw new RoomError('INVALID_TARGET', 'Use transfer host to change the host role.');
    }
    target.role = role;
    return target;
  }

  /** Host hands over the crown. Old host becomes a moderator. */
  transferHost(toUserId) {
    const next = this.requireParticipant(toUserId);
    if (next.userId === this.hostUserId) {
      throw new RoomError('INVALID_TARGET', 'That user is already the host.');
    }
    const previous = this.getParticipant(this.hostUserId);
    if (previous) previous.role = ROLES.MODERATOR;
    next.role = ROLES.HOST;
    this.hostUserId = next.userId;
    return { previous, next };
  }

  /** Called when the host leaves: promote the best remaining person. */
  electNewHost() {
    const candidates = [...this.participants.values()].sort(
      (a, b) =>
        Number(b.online) - Number(a.online) ||
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
        a.joinedAt - b.joinedAt,
    );
    const next = candidates[0];
    if (!next) return null;
    next.role = ROLES.HOST;
    this.hostUserId = next.userId;
    return next;
  }

  requireParticipant(userId) {
    const p = this.getParticipant(userId);
    if (!p) throw new RoomError('USER_NOT_FOUND', 'That user is not in this room.');
    return p;
  }

  /* ───────────── playback ───────────── */

  /** Live position = saved position + time passed since it was saved (only while playing). */
  getCurrentTime(now = Date.now()) {
    const { isPlaying, position, updatedAt } = this.playback;
    return isPlaying ? position + (now - updatedAt) / 1000 : position;
  }

  play(time) {
    this.#setPlayback({ isPlaying: true, position: time ?? this.getCurrentTime() });
  }

  pause(time) {
    this.#setPlayback({ isPlaying: false, position: time ?? this.getCurrentTime() });
  }

  seek(time) {
    this.#setPlayback({ position: time });
  }

  changeVideo(videoId) {
    this.#setPlayback({ videoId, position: 0, isPlaying: true });
  }

  #setPlayback(patch) {
    this.playback = { ...this.playback, ...patch, updatedAt: Date.now() };
  }

  /** Snapshot sent to clients in sync_state. */
  getState() {
    const now = Date.now();
    return {
      videoId: this.playback.videoId,
      playState: this.playback.isPlaying ? 'playing' : 'paused',
      currentTime: this.getCurrentTime(now),
      serverTime: now,
    };
  }

  /* ───────────── chat ───────────── */

  addChatMessage(participant, text) {
    const message = {
      id: randomUUID(),
      userId: participant.userId,
      username: participant.username,
      role: participant.role,
      text,
      sentAt: Date.now(),
    };
    this.chat.push(message);
    if (this.chat.length > MAX_CHAT_HISTORY) this.chat.shift();
    return message;
  }

  addSystemMessage(text) {
    const message = { id: randomUUID(), system: true, text, sentAt: Date.now() };
    this.chat.push(message);
    if (this.chat.length > MAX_CHAT_HISTORY) this.chat.shift();
    return message;
  }

  /* ───────────── change requests (participant -> host/mod approval) ───────────── */

  createRequest(participant, type, payload) {
    // one pending request per user per type (a new one replaces the old one)
    for (const [id, req] of this.requests) {
      if (req.userId === participant.userId && req.type === type) this.requests.delete(id);
    }
    const request = {
      id: randomUUID(),
      userId: participant.userId,
      username: participant.username,
      type,
      payload,
      createdAt: Date.now(),
    };
    this.requests.set(request.id, request);
    return request;
  }

  takeRequest(requestId) {
    const request = this.requests.get(requestId);
    if (!request) throw new RoomError('REQUEST_NOT_FOUND', 'This request was already handled.');
    this.requests.delete(requestId);
    return request;
  }

  cancelRequest(requestId, userId) {
    const request = this.requests.get(requestId);
    if (!request) throw new RoomError('REQUEST_NOT_FOUND', 'This request was already handled.');
    if (request.userId !== userId) throw new RoomError('FORBIDDEN', 'You can only cancel your own request.');
    this.requests.delete(requestId);
    return request;
  }

  listRequests() {
    return [...this.requests.values()];
  }

  addRequestHistory(request, { approved, by }) {
    const item = { ...request, approved, resolvedAt: Date.now(), resolvedBy: { userId: by.userId, username: by.username } };
    this.requestHistory.unshift(item);
    if (this.requestHistory.length > MAX_REQUEST_HISTORY) this.requestHistory.pop();
    return item;
  }

  listRequestHistory() {
    return this.requestHistory;
  }

  addToPlaylist(videoId, participant) {
    const item = { id: randomUUID(), videoId, addedAt: Date.now(), addedBy: { userId: participant.userId, username: participant.username } };
    this.playlist.push(item);
    return item;
  }

  removeFromPlaylist(itemId) {
    const index = this.playlist.findIndex((item) => item.id === itemId);
    if (index === -1) throw new RoomError('PLAYLIST_ITEM_NOT_FOUND', 'That video is no longer in the playlist.');
    return this.playlist.splice(index, 1)[0];
  }

  playPlaylistItem(itemId) {
    const item = this.removeFromPlaylist(itemId);
    this.changeVideo(item.videoId);
    return item;
  }

  movePlaylistItem(itemId, direction) {
    const index = this.playlist.findIndex((item) => item.id === itemId);
    if (index === -1) throw new RoomError('PLAYLIST_ITEM_NOT_FOUND', 'That video is no longer in the playlist.');
    const target = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : -1;
    if (target < 0 || target >= this.playlist.length) throw new RoomError('INVALID_PLAYLIST_MOVE', 'That video cannot move any further.');
    [this.playlist[index], this.playlist[target]] = [this.playlist[target], this.playlist[index]];
    return this.playlist;
  }
}
