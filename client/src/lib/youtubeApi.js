import { apiUrl } from './socket.js';

/** Talks to our server's /api/youtube/* proxy (the Data API key lives on the server). */

let configPromise = null;
const infoCache = new Map(); // videoId -> Promise<video | null>

async function getJson(path) {
  const res = await fetch(apiUrl(path));
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

export function getConfig() {
  if (!configPromise) {
    configPromise = getJson('/api/config').catch(() => {
      configPromise = null; // retry next time
      return { youtubeSearch: false };
    });
  }
  return configPromise;
}

export async function searchVideos(query) {
  const { items } = await getJson(`/api/youtube/search?q=${encodeURIComponent(query)}`);
  items.forEach((v) => infoCache.set(v.id, Promise.resolve(v)));
  return items;
}

/** Title / channel / duration for one video. Resolves null when search is off or the call fails. */
export function getVideoInfo(videoId) {
  if (!infoCache.has(videoId)) {
    const promise = getConfig()
      .then((cfg) => (cfg.youtubeSearch ? getJson(`/api/youtube/videos?ids=${videoId}`) : { items: [] }))
      .then(({ items }) => items[0] ?? null)
      .catch(() => {
        infoCache.delete(videoId);
        return null;
      });
    infoCache.set(videoId, promise);
  }
  return infoCache.get(videoId);
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export const formatViews = (n) => `${compact.format(n)} views`;

export function timeAgo(iso) {
  if (!iso) return '';
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (days < 1) return 'today';
  if (days < 30) return `${Math.floor(days)}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
