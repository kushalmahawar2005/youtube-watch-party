import { useEffect, useState } from 'react';
import { getVideoInfo } from '../lib/youtubeApi.js';

/** Video details from the YouTube Data API (null while loading or when unavailable). */
export function useVideoInfo(videoId) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!videoId) return undefined;
    let cancelled = false;
    getVideoInfo(videoId).then((v) => {
      if (!cancelled) setInfo(v);
    });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  return info?.id === videoId ? info : null;
}
