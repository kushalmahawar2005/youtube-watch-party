let apiPromise = null;

/** Loads https://www.youtube.com/iframe_api once and resolves with window.YT. */
export function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve(window.YT);
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

const ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/** Accepts a raw id or any common YouTube URL (watch, youtu.be, shorts, embed, live). */
export function extractVideoId(input) {
  const value = String(input || '').trim();
  if (ID_RE.test(value)) return value;
  try {
    const url = new URL(/^https?:\/\//.test(value) ? value : `https://${value}`);
    const host = url.hostname.replace(/^(www|m|music)\./, '');
    let id = null;
    if (host === 'youtu.be') id = url.pathname.slice(1, 12);
    else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      id = url.searchParams.get('v') || url.pathname.match(/\/(embed|shorts|live|v)\/([a-zA-Z0-9_-]{11})/)?.[2];
    }
    return id && ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export const thumbnailUrl = (videoId) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
