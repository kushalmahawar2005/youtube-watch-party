import { useEffect, useRef, useState } from 'react';
import { extractVideoId, formatTime } from '../lib/youtube.js';
import { formatViews, getConfig, searchVideos, timeAgo } from '../lib/youtubeApi.js';
import Icon from './Icon.jsx';

/**
 * One box for both: paste a YouTube link, or type words for debounced YouTube suggestions.
 */
export default function VideoPicker({ control, currentVideoId, onPick, notify }) {
  const [text, setText] = useState('');
  const [searchOn, setSearchOn] = useState(false);
  const [results, setResults] = useState(null); // null = closed
  const [lastQuery, setLastQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef(null);
  const searchSeq = useRef(0);
  const suggestionTimer = useRef(null);

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

  async function search(query) {
    const seq = ++searchSeq.current;
    setLoading(true);
    setError('');
    setLastQuery(query);
    try {
      const items = await searchVideos(query);
      if (seq === searchSeq.current) setResults(items);
    } catch (err) {
      if (seq === searchSeq.current) {
        setResults(null);
        setError(err.message);
      }
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }

  // Suggestions appear shortly after typing stops. The debounce avoids burning the
  // YouTube API quota for every keystroke while still feeling instant.
  useEffect(() => {
    const value = text.trim();
    if (!searchOn || value.length < 2 || extractVideoId(value)) return undefined;
    const timer = setTimeout(() => {
      suggestionTimer.current = null;
      search(value);
    }, 450);
    suggestionTimer.current = timer;
    return () => {
      clearTimeout(timer);
      if (suggestionTimer.current === timer) suggestionTimer.current = null;
    };
  }, [text, searchOn]); // search intentionally reads the newest request sequence

  async function submit(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;

    if (suggestionTimer.current) {
      clearTimeout(suggestionTimer.current);
      suggestionTimer.current = null;
    }

    const linkId = extractVideoId(value);
    if (linkId) return pick(linkId);
    if (!searchOn) return notify('That does not look like a YouTube link', 'bad');

    search(value);
  }

  const verb = control ? 'Play' : 'Request';

  return (
    <div className="picker" ref={rootRef}>
      {open && (
        <div className="picker-pop card" role="dialog" aria-label="Search results">
          <div className="picker-head">
            <span>{loading ? 'Searching YouTube…' : error ? 'Search failed' : `Results for “${lastQuery}”`}</span>
            <button className="icon-btn" onClick={close} aria-label="Close results"><Icon name="close" size={18} /></button>
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

      <form className="changer card" onSubmit={submit}>
        <div className="changer-head">
          <h2>{control ? 'Change video' : 'Suggest a video'}</h2>
          <p>{control ? 'Suggestions appear as you type · plays for everyone' : 'Suggestions appear as you type · host approval is needed'}</p>
        </div>
        <div className="changer-row">
          <label className="changer-field">
            <Icon name="search" size={18} className="changer-icon" />
            <input
              value={text}
              onChange={(e) => {
                searchSeq.current += 1; // ignore any in-flight result for the previous words
                setText(e.target.value);
                setResults(null);
                setError('');
              }}
              placeholder={searchOn ? 'Search YouTube or paste a link' : 'Paste a YouTube link'}
              aria-label={searchOn ? 'Search YouTube or paste a link' : 'YouTube link'}
              enterKeyHint={extractVideoId(text) || !searchOn ? 'go' : 'search'}
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={!text.trim() || loading}>
            {extractVideoId(text) || !searchOn ? (control ? 'Play for everyone' : 'Request video') : 'Search now'}
          </button>
        </div>
      </form>
    </div>
  );
}
