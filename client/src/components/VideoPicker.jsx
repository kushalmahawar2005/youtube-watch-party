import { useEffect, useRef, useState } from 'react';
import { extractVideoId, formatTime } from '../lib/youtube.js';
import { formatViews, getConfig, searchVideos, timeAgo } from '../lib/youtubeApi.js';

/**
 * One box for both: paste a YouTube link, or type words and press Enter to search.
 * Search runs on Enter only (each search costs 100 units of the daily API quota).
 */
export default function VideoPicker({ control, currentVideoId, onPick, notify }) {
  const [text, setText] = useState('');
  const [searchOn, setSearchOn] = useState(false);
  const [results, setResults] = useState(null); // null = closed
  const [lastQuery, setLastQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    getConfig().then((cfg) => setSearchOn(cfg.youtubeSearch));
  }, []);

  const open = results !== null || loading || Boolean(error);
  const close = () => {
    setResults(null);
    setError('');
  };

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !rootRef.current?.contains(e.target) && close();
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(videoId) {
    onPick(videoId);
    setText('');
    close();
  }

  async function submit(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;

    const linkId = extractVideoId(value);
    if (linkId) return pick(linkId);
    if (!searchOn) return notify('That does not look like a YouTube link', 'bad');

    setLoading(true);
    setError('');
    setLastQuery(value);
    try {
      setResults(await searchVideos(value));
    } catch (err) {
      setResults(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const verb = control ? 'Play' : 'Request';

  return (
    <div className="picker" ref={rootRef}>
      {open && (
        <div className="picker-pop panel" role="dialog" aria-label="Search results">
          <div className="picker-head">
            <span>{loading ? 'Searching YouTube…' : error ? 'Search failed' : `Results for “${lastQuery}”`}</span>
            <button className="icon-btn" onClick={close} aria-label="Close results">✕</button>
          </div>

          {error && <p className="picker-note">{error}</p>}
          {loading && (
            <ul className="results" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => <li key={i} className="result is-skeleton"><span className="result-thumb" /><span className="sk-lines"><i /><i /></span></li>)}
            </ul>
          )}
          {!loading && results?.length === 0 && <p className="picker-note">No embeddable videos found. Try other words.</p>}
          {!loading && results?.length > 0 && (
            <ul className="results">
              {results.map((v) => {
                const playing = v.id === currentVideoId;
                return (
                  <li key={v.id}>
                    <button className="result" onClick={() => pick(v.id)} disabled={playing}>
                      <span className="result-thumb">
                        <img src={v.thumbnail} alt="" loading="lazy" />
                        <small>{v.isLive ? 'LIVE' : formatTime(v.duration)}</small>
                      </span>
                      <span className="result-body">
                        <span className="result-title">{v.title}</span>
                        <span className="result-meta">
                          {v.channel} · {formatViews(v.views)} · {timeAgo(v.publishedAt)}
                        </span>
                      </span>
                      <span className={`result-cta ${control ? '' : 'is-request'}`}>{playing ? 'Now playing' : verb}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <form className="changer panel" onSubmit={submit}>
        <span className="changer-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        </span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={searchOn ? 'Search YouTube or paste a link…' : 'Paste a YouTube link…'}
          aria-label={searchOn ? 'Search YouTube or paste a link' : 'YouTube link'}
        />
        <button className="btn btn-primary" type="submit" disabled={!text.trim() || loading}>
          {extractVideoId(text) || !searchOn ? (control ? 'Play for everyone' : 'Request video') : 'Search'}
        </button>
      </form>
    </div>
  );
}
