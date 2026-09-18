/** Small input validators. Never trust what the client sends. */

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const MAX_TIME_SECONDS = 24 * 60 * 60;

export const isValidVideoId = (id) => typeof id === 'string' && VIDEO_ID_RE.test(id);

export const isValidTime = (t) =>
  typeof t === 'number' && Number.isFinite(t) && t >= 0 && t <= MAX_TIME_SECONDS;

export const isValidUserId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(id);

export function cleanUsername(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, 24);
  return trimmed.length > 0 ? trimmed : null;
}

export function cleanChatText(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim().slice(0, 500);
  return trimmed.length > 0 ? trimmed : null;
}

export function cleanRoomTitle(title) {
  if (typeof title !== 'string') return null;
  const trimmed = title.replace(/\s+/g, ' ').trim().slice(0, 48);
  return trimmed.length > 0 ? trimmed : null;
}

export function cleanRoomPassword(password) {
  if (typeof password !== 'string') return null;
  return password.length >= 4 && password.length <= 64 ? password : null;
}

export const normalizeRoomId = (id) => (typeof id === 'string' ? id.trim().toUpperCase() : '');
