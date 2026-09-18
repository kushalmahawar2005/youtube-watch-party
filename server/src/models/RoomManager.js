import { randomInt } from 'node:crypto';
import { Room } from './Room.js';
import { normalizeRoomId } from '../validation.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
const CODE_LENGTH = 6;

/** Keeps every active room in memory (a Map). One instance per server process. */
export class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> Room
  }

  createRoom(hostUserId) {
    const id = this.#generateUniqueCode();
    const room = new Room(id, hostUserId);
    this.rooms.set(id, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(normalizeRoomId(roomId)) ?? null;
  }

  deleteRoom(roomId) {
    return this.rooms.delete(normalizeRoomId(roomId));
  }

  stats() {
    let users = 0;
    for (const room of this.rooms.values()) users += room.size;
    return { rooms: this.rooms.size, users };
  }

  #generateUniqueCode() {
    let code;
    do {
      code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }
}
