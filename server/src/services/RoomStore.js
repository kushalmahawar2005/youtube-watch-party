import fs from 'node:fs';
import path from 'node:path';

/**
 * Small durable store with no extra infrastructure. Set ROOM_DATA_FILE to place it
 * on a mounted volume in production. Writes are atomic so a restart cannot leave a
 * half-written room file behind.
 */
export class RoomStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  load() {
    if (!this.filePath) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return Array.isArray(parsed?.rooms) ? parsed.rooms : [];
    } catch (err) {
      if (err?.code !== 'ENOENT') console.warn('[rooms] Could not read saved rooms:', err.message);
      return [];
    }
  }

  save(rooms) {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, savedAt: Date.now(), rooms }), 'utf8');
      fs.renameSync(temporary, this.filePath);
    } catch (err) {
      console.error('[rooms] Could not save rooms:', err.message);
    }
  }
}
