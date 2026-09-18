import { useEffect, useState } from 'react';
import { useSyncedPlayer } from '../hooks/useSyncedPlayer.js';
import { useVideoInfo } from '../hooks/useVideoInfo.js';
import VideoPicker from './VideoPicker.jsx';
import Icon from './Icon.jsx';
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

  const status = isPlaying ? 'Playing' : 'Paused';

  return (
    <section className="stage" aria-label="Video">
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
              <Icon name="play" size={30} />
            </button>
            <span className="veil-label">
              {control ? 'Paused' : request ? 'Paused · tap to ask the host to play' : 'Paused by the host'}
            </span>
          </div>
        )}
        {player.blocked && !player.playerError && (
          <button className="screen-overlay screen-unlock" onClick={player.unlock}>
            <span className="unlock-icon"><Icon name="play" size={28} /></span>
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
            <Icon name="lock" size={13} />
            {request ? 'Controls send a request to the host' : 'View only'}
          </div>
        )}
      </div>

      <div className="controls card">
        <button
          className={`play-btn ${request ? 'is-request' : ''}`}
          onClick={togglePlay}
          disabled={disabled || !player.ready}
          aria-label={isPlaying ? (request ? 'Request pause' : 'Pause') : request ? 'Request play' : 'Play'}
          title={request ? 'Sends a request' : undefined}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={20} />
        </button>

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
          aria-valuetext={`${formatTime(shownTime)} of ${formatTime(duration)}`}
        />

        <span className="time">
          {formatTime(shownTime)}
          <span className="time-total"> / {formatTime(duration)}</span>
        </span>

        <div className="volume">
          <button className="icon-btn" onClick={player.toggleMute} aria-label={player.muted ? 'Unmute' : 'Mute'}>
            <Icon name={player.muted || player.volume === 0 ? 'mute' : 'volume'} size={20} />
          </button>
          <input
            type="range"
            className="volume-range"
            min={0}
            max={100}
            value={player.muted ? 0 : player.volume}
            style={{ '--pct': `${player.muted ? 0 : player.volume}%` }}
            onChange={(e) => player.setVolume(Number(e.target.value))}
            aria-label="Volume"
          />
        </div>
      </div>

      <div className="stage-info">
        <div className="now-playing">
          <h1 className="np-title">{info?.title || player.title || 'Loading video…'}</h1>
          <p className="np-meta">
            <span className={`status-pill ${isPlaying ? 'is-on' : ''}`}>
              <span className="eq" aria-hidden="true"><i /><i /><i /></span>
              {status}
            </span>
            {info && (
              <>
                <span className="np-channel">{info.channel}</span>
                <span className="np-views">{formatViews(info.views)}</span>
              </>
            )}
            {last && <span className="np-last">{last}</span>}
          </p>
        </div>
        <div className="reaction-bar" role="group" aria-label="Send a reaction">
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
