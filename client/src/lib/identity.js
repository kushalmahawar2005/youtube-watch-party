/**
 * Lightweight identity (no login).
 * userId lives in sessionStorage -> survives refresh, but every new tab is a new person.
 * Name lives in localStorage -> pre-filled next time.
 */
const ID_KEY = 'wp:userId';
const NAME_KEY = 'wp:name';
let memoryId = null;

function randomId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, '');
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}

export function getUserId() {
  try {
    let id = sessionStorage.getItem(ID_KEY);
    if (!id) {
      id = randomId();
      sessionStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    memoryId ??= randomId();
    return memoryId;
  }
}

export function resetUserId() {
  const id = randomId();
  memoryId = id;
  try {
    sessionStorage.setItem(ID_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

export function getSavedName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function saveName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}
