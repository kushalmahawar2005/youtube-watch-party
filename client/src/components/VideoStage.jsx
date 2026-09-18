import { useEffect, useState } from 'react';
import { useSyncedPlayer } from '../hooks/useSyncedPlayer.js';
import { useVideoInfo } from '../hooks/useVideoInfo.js';
import VideoPicker from './VideoPicker.jsx';
import { canControl, canRequest } from '../lib/permissions.js';
import { REACTIONS } from '../lib/events.js';
import { formatTime } from '../lib/youtube.js';
import { formatViews } from '../lib/youtubeApi.js';

const ACTION_TEXT = { play: 'played', pause: 'paused', seek: 'jumped to', change_video: 'changed the video', join: '' };

export default function VideoStage({ room }) {
  const { syncState, self, actions, reactions, notify } = room;
  const player = useSyncedPlayer(syncState);
  const role = self.role;
  const control = canControl(role);
  const request = canRequest(role);
  const isPlaying = syncState?.playState === 'playing';
  const info = useVideoInfo(syncState?.videoId);

  const [scrub, setScrub] = useState(null); // seconds while dragging

  const duration = player.duration || 0;
  const shownTime = scrub ?? player.time;

  function togglePlay() {
    const time = player.getCurrentTime();
    const type = isPlaying ? 'pause' : 'play';
    if (control) actions[type](time);
    else if (request) actions.requestAction(type, {});
  }

  function commitSeek() {
    if (scrub == null) return;
    const time = scrub;
    setScrub(null);
    if (control) actions.seek(time);
    else if (request) actions.requestAction('seek', { time });
  }

  function skip(delta) {
    const time = Math.max(0, Math.min(duration || Infinity, player.getCurrentTime() + delta));
    if (control) actions.seek(time);
    else if (request) actions.requestAction('seek', { time });
  }

  function pickVideo(videoId) {
    if (control) actions.changeVideo(videoId);
    else actions.requestAction('change_video', { videoId });
  }

  // keyboard: space = play/pause, arrows = ±10s (host/mod only)
  useEffect(() => {
    if (!control) return undefined;
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.code === 'Space' && e.target.tagName !== 'BUTTON') { e.preventDefault(); togglePlay(); }
      if (e.code === 'ArrowRight') skip(10);
      if (e.code === 'ArrowLeft') skip(-10);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const disabled = !control && !request;
  const last = syncState?.by && ACTION_TEXT[syncState.action] !== ''
    ? `${syncState.by.userId === self.userId ? 'You' : syncState.by.username} ${ACTION_TEXT[syncState.action]}${syncState.action === 'seek' ? ` ${formatTime(syncState.currentTime)}` : ''}`
    : null;

  return (
    <section className="stage">
      <div className="screen">
        <div className="player-mount" ref={player.containerRef} />
        {/* transparent shield: nobody clicks the iframe directly, all control goes through the server */}
        <div className="screen-shield" onDoubleClick={control ? togglePlay : undefined} />

        {!player.ready && <div className="screen-overlay"><div className="loader"><i /><i /><i /></div></div>}
        {player.playerError && (
          <div className="screen-overlay">
            <p>{player.playerError}</p>
          </div>
        )}
        {/* our own paused cover: hides YouTube's title bar / "Watch on YouTube" clutter */}
        {player.ready && !isPlaying && !player.blocked && !player.playerError && (
          <div className="paused-veil">
            {syncState?.videoId && (
              <img className="veil-poster" src={`https://i.ytimg.com/vi/${syncState.videoId}/hqdefault.jpg`} alt="" />
            )}
            <button
              className="veil-play"
              onClick={togglePlay}
              disabled={disabled}
              aria-label={control ? 'Play' : 'Request play'}
            >
              <svg viewBox="0 0 24 24"><path d="M8 5l12 7-12 7z" /></svg>
            </button>
            <span className="veil-label">
              {control ? 'Paused' : request ? 'Paused · tap to ask the host to play' : 'Paused by the host'}
            </span>
          </div>
        )}
        {player.blocked && !player.playerError && (
          <button className="screen-overlay screen-unlock" onClick={player.unlock}>
            <span className="unlock-icon">▶</span>
            <span>Tap to join playback</span>
            <small>Your browser blocked autoplay</small>
          </button>
        )}

        <div className="reaction-layer" aria-hidden="true">
          {reactions.map((r) => (
            <span key={r.id} className="float-reaction" style={{ left: `${r.left}%` }}>
              {r.emoji}
              <small>{r.username}</small>
            </span>
          ))}
        </div>

        {!control && (
          <div className="lock-banner">
            {request ? 'Controls send a request to the host' : 'View only'}
          </div>
        )}
      </div>

      <div className="controls panel">
        <button
          className={`play-btn ${request ? 'is-request' : ''}`}
          onClick={togglePlay}
          disabled={disabled || !player.ready}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          title={request ? 'Request' : undefined}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24"><path d="M8 5l12 7-12 7z" /></svg>
          )}
        </button>

        <div className="timeline">
          <span className="time">{formatTime(shownTime)}</span>
          <input
            type="range"
            className="seek"
            min={0}
            max={Math.max(duration, 1)}
            step={0.5}
            value={Math.min(shownTime, Math.max(duration, 1))}
            disabled={disabled || !duration}
            style={{ '--pct': `${duration ? (shownTime / duration) * 100 : 0}%` }}
            onChange={(e) => setScrub(Number(e.target.value))}
            onPointerUp={commitSeek}
            onKeyUp={commitSeek}
            onBlur={() => setScrub(null)}
            aria-label="Seek"
          />
          <span className="time muted">{formatTime(duration)}</span>
        </div>

        <div className="volume">
          <button className="icon-btn" onClick={player.toggleMute} aria-label={player.muted ? 'Unmute' : 'Mute'}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9h4l5-4v14l-5-4H4z" />
              {player.muted || player.volume === 0 ? (
                <path d="M16 9l5 6M21 9l-5 6" className="stroke" />
              ) : (
                <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" className="stroke" />
              )}
            </svg>
          </button>
          <input type="range" min={0} max={100} value={player.muted ? 0 : player.volume} onChange={(e) => player.setVolume(Number(e.target.value))} aria-label="Volume" />
        </div>
      </div>

      <div className="stage-info">
        <div className="now-playing">
          <span className={`eq ${isPlaying ? 'is-on' : ''}`} aria-hidden="true"><i /><i /><i /></span>
          <div>
            <p className="np-title">{info?.title || player.title || 'Loading video…'}</p>
            <p className="np-meta">
              {info && <span className="np-channel">{info.channel} · {formatViews(info.views)} · </span>}
              {last || (isPlaying ? 'Playing' : 'Paused')}
            </p>
          </div>
        </div>
        <div className="reaction-bar">
          {REACTIONS.map((emoji) => (
            <button key={emoji} className="reaction-btn" onClick={() => actions.react(emoji)} aria-label={`React ${emoji}`}>
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {!disabled && (
        <VideoPicker control={control} currentVideoId={syncState?.videoId} onPick={pickVideo} notify={notify} />
      )}
    </section>
  );
}
