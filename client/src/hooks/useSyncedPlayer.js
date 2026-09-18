import { useCallback, useEffect, useRef, useState } from 'react';
import { loadYouTubeApi } from '../lib/youtube.js';

const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
const SEEK_TOLERANCE = 0.75; // seconds: ignore tiny differences when applying an update
const DRIFT_TOLERANCE = 1.5; // seconds: periodic correction threshold
const EMBED_ERRORS = { 2: 'Invalid video id.', 5: 'HTML5 player error.', 100: 'Video not found or private.', 101: 'The owner does not allow embedding this video.', 150: 'The owner does not allow embedding this video.' };

/**
 * Drives a YouTube IFrame player from the server's sync_state.
 *
 * Important design choice: the player NEVER emits events by itself.
 * Buttons emit to the server, the server broadcasts sync_state, and every
 * client (including the one who clicked) applies it here. Because we never
 * emit from onStateChange there is no echo loop.
 */
export function useSyncedPlayer(syncState, { onEnded, onNativePlaybackChange } = {}) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const readyRef = useRef(false);
  const syncRef = useRef(null); // { state, receivedAt }
  const stuckSinceRef = useRef(null);
  const onEndedRef = useRef(onEnded);
  const onNativePlaybackChangeRef = useRef(onNativePlaybackChange);
  const applyingUntilRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [title, setTitle] = useState('');
  const [blocked, setBlocked] = useState(false); // browser blocked autoplay
  const [playerError, setPlayerError] = useState(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolumeState] = useState(80);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const hasState = Boolean(syncState);

  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { onNativePlaybackChangeRef.current = onNativePlaybackChange; }, [onNativePlaybackChange]);

  /** Where the video SHOULD be right now, based on the last server update. */
  const expectedTime = useCallback(() => {
    const s = syncRef.current;
    if (!s) return 0;
    const elapsed = (performance.now() - s.receivedAt) / 1000;
    return s.state.playState === 'playing' ? s.state.currentTime + elapsed : s.state.currentTime;
  }, []);

  const applySync = useCallback(() => {
    const player = playerRef.current;
    const state = syncRef.current?.state;
    if (!player || !readyRef.current || !state) return;

    const target = expectedTime();
    const loadedId = player.getVideoData?.()?.video_id;

    if (loadedId !== state.videoId) {
      setPlayerError(null);
      if (state.playState === 'playing') player.loadVideoById({ videoId: state.videoId, startSeconds: target });
      else player.cueVideoById({ videoId: state.videoId, startSeconds: target });
      return;
    }

    if (Math.abs((player.getCurrentTime?.() ?? 0) - target) > SEEK_TOLERANCE) player.seekTo(target, true);
    player.setPlaybackRate?.(playbackRate);
    // State changes caused by our own server update must not be treated as a
    // viewer clicking YouTube's built-in play/pause button.
    applyingUntilRef.current = performance.now() + 900;
    if (state.playState === 'playing') player.playVideo();
    else player.pauseVideo();
  }, [expectedTime, playbackRate]);

  // 1) every new sync_state from the server
  useEffect(() => {
    if (!syncState) return;
    syncRef.current = { state: syncState, receivedAt: performance.now() };
    stuckSinceRef.current = null;
    applySync();
  }, [syncState, applySync]);

  // 2) create the player once we know which video to show
  useEffect(() => {
    if (!hasState) return undefined;
    let cancelled = false;
    let player = null;
    const container = containerRef.current;

    loadYouTubeApi().then((YT) => {
      if (cancelled || !container) return;
      const mount = document.createElement('div'); // YT replaces this node, React never owns it
      container.appendChild(mount);
      const { videoId } = syncRef.current.state;
      player = new YT.Player(mount, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          start: Math.floor(expectedTime()),
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            player.setVolume(80);
            player.setPlaybackRate(playbackRate);
            setTitle(player.getVideoData?.()?.title || '');
            setReady(true);
            applySync();
          },
          onStateChange: (e) => {
            if (e.data === YT_STATE.PLAYING) {
              setBlocked(false);
              stuckSinceRef.current = null;
            }
            if (e.data === YT_STATE.ENDED) onEndedRef.current?.();
            if (
              (e.data === YT_STATE.PLAYING || e.data === YT_STATE.PAUSED)
              && performance.now() > applyingUntilRef.current
            ) {
              const nativeIsPlaying = e.data === YT_STATE.PLAYING;
              const serverIsPlaying = syncRef.current?.state?.playState === 'playing';
              if (nativeIsPlaying !== serverIsPlaying) {
                onNativePlaybackChangeRef.current?.({
                  isPlaying: nativeIsPlaying,
                  time: player.getCurrentTime?.() ?? 0,
                });
              }
            }
            setTitle(player.getVideoData?.()?.title || '');
          },
          onError: (e) => setPlayerError(EMBED_ERRORS[e.data] || 'This video cannot be played.'),
        },
      });
      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      readyRef.current = false;
      try {
        player?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      if (container) container.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasState]);

  // 3) ticker: update the progress bar + fix drift + detect blocked autoplay
  useEffect(() => {
    const id = setInterval(() => {
      const player = playerRef.current;
      const state = syncRef.current?.state;
      if (!player || !readyRef.current || !state) return;

      const current = player.getCurrentTime?.() ?? 0;
      const dur = player.getDuration?.() ?? 0;
      setTime(current);
      setDuration(dur);
      if (player.getVideoData?.()?.video_id !== state.videoId) return;

      const playerState = player.getPlayerState?.();
      const target = expectedTime();

      if (state.playState === 'playing') {
        if (dur > 0 && target >= dur - 0.5) return; // video finished
        if (playerState === YT_STATE.PLAYING) {
          if (Math.abs(current - target) > DRIFT_TOLERANCE) player.seekTo(target, true);
        } else if (playerState !== YT_STATE.BUFFERING) {
          if (!stuckSinceRef.current) {
            stuckSinceRef.current = performance.now();
            player.playVideo();
          } else if (performance.now() - stuckSinceRef.current > 2500) {
            setBlocked(true);
          }
        }
      } else if (playerState === YT_STATE.PLAYING) {
        player.pauseVideo();
      }
    }, 500);
    return () => clearInterval(id);
  }, [expectedTime]);

  const unlock = useCallback(() => {
    stuckSinceRef.current = null;
    setBlocked(false);
    playerRef.current?.playVideo();
    applySync();
  }, [applySync]);

  const toggleMute = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isMuted()) player.unMute();
    else player.mute();
    setMuted(!muted);
  }, [muted]);

  const setVolume = useCallback((v) => {
    const player = playerRef.current;
    setVolumeState(v);
    if (!player) return;
    player.setVolume(v);
    if (v > 0 && player.isMuted()) {
      player.unMute();
      setMuted(false);
    }
  }, []);

  const setPlaybackRate = useCallback((rate) => {
    const nextRate = Number(rate);
    if (!Number.isFinite(nextRate)) return;
    setPlaybackRateState(nextRate);
    playerRef.current?.setPlaybackRate?.(nextRate);
  }, []);

  const getCurrentTime = useCallback(() => playerRef.current?.getCurrentTime?.() ?? expectedTime(), [expectedTime]);

  return {
    containerRef,
    ready,
    time,
    duration,
    title,
    blocked,
    playerError,
    unlock,
    muted,
    toggleMute,
    volume,
    setVolume,
    playbackRate,
    setPlaybackRate,
    getCurrentTime,
  };
}
