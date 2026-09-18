import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { socket, emitWithAck } from '../lib/socket.js';
import { C2S, S2C } from '../lib/events.js';
import { ROLE_LABEL } from '../lib/permissions.js';

let toastSeq = 0;

/**
 * Everything about "being inside a room" lives here:
 * connecting, joining, listening to server events and exposing actions.
 * Components never touch the socket directly.
 */
export function useRoom({ roomId, userId, username, password = '' }) {
  const [status, setStatus] = useState('connecting'); // connecting | joined | reconnecting | error | kicked | replaced | left
  const [error, setError] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [syncState, setSyncState] = useState(null);
  const [chat, setChat] = useState([]);
  const [requests, setRequests] = useState([]);
  const [requestHistory, setRequestHistory] = useState([]);
  const [playlist, setPlaylist] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [unreadChat, setUnreadChat] = useState(0);
  const [myRequests, setMyRequests] = useState([]);
  const [roomMeta, setRoomMeta] = useState(null);
  const chatOpenRef = useRef(false);

  const notify = useCallback((text, tone = 'info') => {
    const id = ++toastSeq;
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const self = useMemo(() => participants.find((p) => p.userId === userId) ?? null, [participants, userId]);
  const nameOf = useCallback((p) => (p.userId === userId ? 'You' : p.username), [userId]);

  useEffect(() => {
    const join = async () => {
      const res = await emitWithAck(C2S.JOIN_ROOM, { roomId, userId, username, password });
      if (!res.ok) {
        if (res.error?.code === 'KICKED') setStatus('kicked');
        else {
          setError(res.error);
          setStatus('error');
        }
        return;
      }
      setParticipants(res.participants);
      setChat(res.chat);
      setRoomMeta(res.roomMeta);
      setMyRequests(res.myRequests || []);
      setPlaylist(res.playlist || []);
      setStatus('joined');
    };

    const handlers = {
      connect: join, // runs on first connect AND on every automatic reconnect
      disconnect: () => setStatus((s) => (s === 'joined' ? 'reconnecting' : s)),

      [S2C.SYNC_STATE]: (state) => {
        setSyncState(state);
        const who = state.by && state.by.userId !== userId ? state.by.username : null;
        if (state.fromPlaylist) notify('Up next is now playing', 'accent');
        else if (who && state.requestedBy?.userId === userId) notify(`${who} approved your ${state.action.replace('_', ' ')} request`, 'good');
        else if (who && state.action === 'change_video') notify(`${who} changed the video`);
      },
      [S2C.USER_JOINED]: (d) => {
        setParticipants(d.participants);
        notify(`${d.username} ${d.rejoined ? 'is back' : 'joined'}`);
      },
      [S2C.USER_LEFT]: (d) => {
        setParticipants(d.participants);
        notify(`${d.username} left`);
      },
      [S2C.PRESENCE_CHANGED]: (d) => setParticipants(d.participants),
      [S2C.ROLE_ASSIGNED]: (d) => {
        setParticipants(d.participants);
        const who = d.userId === userId ? 'You are' : `${d.username} is`;
        const why = d.reason === 'host_left' ? ' (previous host left)' : '';
        notify(`${who} now ${ROLE_LABEL[d.role]}${why}`, d.userId === userId ? 'good' : 'info');
      },
      [S2C.PARTICIPANT_REMOVED]: (d) => {
        setParticipants(d.participants);
        notify(`${d.username} was removed`);
      },
      [S2C.KICKED]: () => setStatus('kicked'),
      [S2C.SESSION_REPLACED]: () => setStatus('replaced'),

      [S2C.REQUESTS_SNAPSHOT]: (d) => {
        setRequests(d.requests);
        setRequestHistory(d.history || []);
      },
      [S2C.REQUEST_CREATED]: (req) => {
        setRequests((r) => [...r.filter((x) => x.id !== req.id && !(x.userId === req.userId && x.type === req.type)), req]);
        notify(`${req.username} sent a request`, 'accent');
      },
      [S2C.REQUEST_RESOLVED]: (d) => {
        setRequests((r) => r.filter((x) => x.id !== d.requestId));
        if (d.userId === userId) setMyRequests((r) => r.filter((x) => x.id !== d.requestId));
        if (d.userId === userId && !d.approved) notify(`${d.by.username} declined your request`, 'bad');
      },
      [S2C.REQUEST_CANCELLED]: (d) => {
        setRequests((r) => r.filter((x) => x.id !== d.requestId));
        if (d.userId === userId) {
          setMyRequests((r) => r.filter((x) => x.id !== d.requestId));
          notify('Request cancelled');
        }
      },
      [S2C.ROOM_UPDATED]: (meta) => setRoomMeta(meta),
      [S2C.PLAYLIST_UPDATED]: (data) => setPlaylist(data.playlist || []),

      [S2C.CHAT_MESSAGE]: (msg) => {
        setChat((c) => [...c.slice(-99), msg]);
        if (!chatOpenRef.current && msg.userId !== userId) setUnreadChat((n) => n + 1);
      },
      [S2C.REACTION]: (r) => {
        setReactions((list) => [...list.slice(-20), { ...r, left: 8 + Math.random() * 84 }]);
        setTimeout(() => setReactions((list) => list.filter((x) => x.id !== r.id)), 2600);
      },
      [S2C.ERROR]: (e) => {
        if (e.event !== C2S.JOIN_ROOM) notify(e.message, 'bad');
      },
    };

    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn);
    if (socket.connected) join();
    else socket.connect();

    return () => {
      for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn);
      socket.disconnect(); // server keeps our seat for a grace period
    };
  }, [roomId, userId, username, password, notify]);

  const actions = useMemo(
    () => ({
      play: (time) => emitWithAck(C2S.PLAY, { time }),
      pause: (time) => emitWithAck(C2S.PAUSE, { time }),
      seek: (time) => emitWithAck(C2S.SEEK, { time }),
      changeVideo: (videoId) => emitWithAck(C2S.CHANGE_VIDEO, { videoId }),
      assignRole: (targetId, role) => emitWithAck(C2S.ASSIGN_ROLE, { userId: targetId, role }),
      transferHost: (targetId) => emitWithAck(C2S.TRANSFER_HOST, { userId: targetId }),
      removeParticipant: (targetId) => emitWithAck(C2S.REMOVE_PARTICIPANT, { userId: targetId }),
      requestAction: async (type, payload) => {
        const res = await emitWithAck(C2S.REQUEST_ACTION, { type, payload });
        if (res.ok) {
          setMyRequests((r) => [...r.filter((x) => x.type !== type), { id: res.requestId, type, createdAt: Date.now() }]);
          notify('Request sent to host & moderators', 'accent');
        }
        return res;
      },
      resolveRequest: (requestId, approve) => emitWithAck(C2S.RESOLVE_REQUEST, { requestId, approve }),
      sendChat: (text) => emitWithAck(C2S.CHAT_MESSAGE, { text }),
      react: (emoji) => emitWithAck(C2S.REACTION, { emoji }),
      updateRoom: (payload) => emitWithAck(C2S.UPDATE_ROOM, payload),
      cancelRequest: (requestId) => emitWithAck(C2S.CANCEL_REQUEST, { requestId }),
      addToPlaylist: (videoId) => emitWithAck(C2S.ADD_TO_PLAYLIST, { videoId }),
      removeFromPlaylist: (itemId) => emitWithAck(C2S.REMOVE_FROM_PLAYLIST, { itemId }),
      playPlaylistItem: (itemId) => emitWithAck(C2S.PLAY_PLAYLIST_ITEM, { itemId }),
      movePlaylistItem: (itemId, direction) => emitWithAck(C2S.MOVE_PLAYLIST_ITEM, { itemId, direction }),
      leave: async () => {
        await emitWithAck(C2S.LEAVE_ROOM, {}, 2000);
        setStatus('left');
      },
    }),
    [notify],
  );

  const setChatOpen = useCallback((open) => {
    chatOpenRef.current = open;
    if (open) setUnreadChat(0);
  }, []);

  return {
    status,
    error,
    self,
    participants,
    syncState,
    roomMeta,
    chat,
    requests,
    requestHistory,
    playlist,
    toasts,
    reactions,
    unreadChat,
    myRequests,
    setChatOpen,
    nameOf,
    notify,
    actions,
  };
}
