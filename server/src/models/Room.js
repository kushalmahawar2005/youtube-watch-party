import { randomUUID } from 'node:crypto';
import { Participant } from './Participant.js';
import { RoomError } from '../errors.js';
import { ROLES, ASSIGNABLE_ROLES } from '../permissions.js';

export const DEFAULT_VIDEO_ID = 'M7lc1UVf-VE'; // YouTube IFrame API demo video
const MAX_CHAT_HISTORY = 100;
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

  listRequests() {
    return [...this.requests.values()];
  }
}
