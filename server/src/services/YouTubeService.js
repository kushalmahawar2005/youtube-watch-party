const API = 'https://www.googleapis.com/youtube/v3';
const SEARCH_TTL_MS = 30 * 60_000; // search.list costs 100 quota units, so cache results
const VIDEO_TTL_MS = 6 * 60 * 60_000; // videos.list costs 1 unit
const MAX_CACHE_ENTRIES = 500;
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export class YouTubeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** "PT1H2M10S" -> 3730 */
export function parseIsoDuration(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return 0;
  const [, d = 0, h = 0, min = 0, s = 0] = m.map((v) => Number(v) || 0);
  return d * 86400 + h * 3600 + min * 60 + s;
}

/** Small TTL cache (Map keeps insertion order, so the first key is the oldest). */
class TtlCache {
  #map = new Map();

  get(key) {
    const hit = this.#map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.#map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value, ttlMs) {
    this.#map.delete(key);
    this.#map.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (this.#map.size > MAX_CACHE_ENTRIES) this.#map.delete(this.#map.keys().next().value);
  }
}

/**
 * Wraps the YouTube Data API v3. The API key stays on the server;
 * the browser only talks to /api/youtube/*.
 */
export class YouTubeService {
  constructor(apiKey, fetchImpl = globalThis.fetch) {
    this.apiKey = apiKey || '';
    this.fetch = fetchImpl;
    this.searchCache = new TtlCache();
    this.videoCache = new TtlCache();
  }

  get enabled() {
    return Boolean(this.apiKey);
  }

  async #call(endpoint, params) {
    if (!this.enabled) throw new YouTubeError(503, 'YouTube search is not configured on the server.');
    const url = new URL(`${API}/${endpoint}`);
    for (const [k, v] of Object.entries({ ...params, key: this.apiKey })) url.searchParams.set(k, v);

    let res;
    try {
      res = await this.fetch(url, { signal: AbortSignal.timeout(8000) });
    } catch {
      throw new YouTubeError(502, 'Could not reach YouTube. Try again.');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = body?.error?.errors?.[0]?.reason;
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
        throw new YouTubeError(429, 'YouTube search limit reached for today. Paste a link instead.');
      }
      console.error('[youtube]', res.status, body?.error?.message);
      throw new YouTubeError(502, 'YouTube request failed.');
    }
    return body;
  }

  static #toVideo(item) {
    const { snippet = {}, contentDetails = {}, statistics = {}, status = {} } = item;
    const thumbs = snippet.thumbnails || {};
    return {
      id: item.id,
      title: snippet.title || '',
      channel: snippet.channelTitle || '',
      thumbnail: (thumbs.medium || thumbs.high || thumbs.default)?.url || `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`,
      duration: parseIsoDuration(contentDetails.duration),
      views: Number(statistics.viewCount) || 0,
      publishedAt: snippet.publishedAt || null,
      isLive: snippet.liveBroadcastContent === 'live',
      embeddable: status.embeddable !== false,
    };
  }

  /** Details for up to 50 ids, served from cache where possible. Order follows `ids`. */
  async getVideos(ids) {
    const unique = [...new Set(ids)].filter((id) => VIDEO_ID_RE.test(id)).slice(0, 50);
    const missing = unique.filter((id) => this.videoCache.get(id) === undefined);

    if (missing.length) {
      const body = await this.#call('videos', {
        part: 'snippet,contentDetails,statistics,status',
        id: missing.join(','),
        maxResults: 50,
      });
      const found = new Map((body.items || []).map((item) => [item.id, YouTubeService.#toVideo(item)]));
      // cache misses too (null) so a deleted video doesn't cost a request every time
      for (const id of missing) this.videoCache.set(id, found.get(id) ?? null, VIDEO_TTL_MS);
    }
    return unique.map((id) => this.videoCache.get(id)).filter(Boolean);
  }

  /** Embeddable videos only, enriched with duration + views. */
  async search(query) {
    const q = String(query || '').trim().slice(0, 100);
    if (!q) return [];
    const key = q.toLowerCase();
    const cached = this.searchCache.get(key);
    if (cached) return cached;

    const body = await this.#call('search', {
      part: 'snippet',
      type: 'video',
      videoEmbeddable: 'true',
      safeSearch: 'moderate',
      maxResults: 15,
      q,
    });
    const ids = (body.items || []).map((item) => item.id?.videoId).filter(Boolean);
    const videos = (await this.getVideos(ids)).filter((v) => v.embeddable);
    this.searchCache.set(key, videos, SEARCH_TTL_MS);
    return videos;
  }
}
