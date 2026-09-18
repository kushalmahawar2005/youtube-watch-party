import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../hooks/useRoom.js';
import RoomHeader from './RoomHeader.jsx';
import VideoStage from './VideoStage.jsx';
import ParticipantList from './ParticipantList.jsx';
import RequestsPanel from './RequestsPanel.jsx';
import ChatPanel from './ChatPanel.jsx';
import Toasts from './Toasts.jsx';
import StatusScreen from './StatusScreen.jsx';
import Icon from './Icon.jsx';
import RoomOnboarding from './RoomOnboarding.jsx';
import HostPanel from './HostPanel.jsx';
import { canControl } from '../lib/permissions.js';

export default function RoomSession({ roomId, userId, username, password, onJoinAsNew, onRetryJoin, startOnboarding = false }) {
  const navigate = useNavigate();
  const room = useRoom({ roomId, userId, username, password });
  const [tab, setTab] = useState('people');
  const [panelOpen, setPanelOpen] = useState(false);
  const setupStorageKey = `watch-party:setup:${roomId}:${userId}`;
  const setupCompleteKey = `${setupStorageKey}:complete`;
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    try { return !localStorage.getItem(setupCompleteKey) && (startOnboarding || Boolean(localStorage.getItem(setupStorageKey))); } catch { return startOnboarding; }
  });
  const role = room.self?.role;
  const staff = canControl(role);

  useEffect(() => room.setChatOpen(tab === 'chat'), [tab, room.setChatOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!staff && tab === 'requests') setTab('people');
  }, [staff, tab]);
  useEffect(() => {
    if (!startOnboarding) return;
    try {
      const completed = Boolean(localStorage.getItem(setupCompleteKey));
      if (completed) {
        setOnboardingOpen(false);
        return;
      }
      if (!localStorage.getItem(setupStorageKey)) {
        localStorage.setItem(setupStorageKey, JSON.stringify({ step: 1, chosen: false }));
      }
    } catch { /* optional enhancement */ }
    setOnboardingOpen(true);
  }, [startOnboarding, setupStorageKey, setupCompleteKey]);
  useEffect(() => {
    if (room.status === 'left') navigate('/');
  }, [room.status, navigate]);

  if (room.status === 'error') {
    return (
      <StatusScreen
        title={room.error?.code === 'ROOM_NOT_FOUND' ? 'Room not found' : 'Could not join'}
        text={room.error?.message}
        action={room.error?.code === 'PASSWORD_REQUIRED' ? { label: 'Try password again', onClick: onRetryJoin } : { label: 'Back home', onClick: () => navigate('/') }}
        secondary={room.error?.code === 'PASSWORD_REQUIRED' ? { label: 'Back home', onClick: () => navigate('/') } : null}
      />
    );
  }
  if (room.status === 'kicked') {
    return (
      <StatusScreen title="You were removed" text="The host removed you from this room." action={{ label: 'Back home', onClick: () => navigate('/') }} />
    );
  }
  if (room.status === 'replaced') {
    return (
      <StatusScreen
        title="Opened in another tab"
        text="This room is already open with your identity somewhere else (a duplicated tab shares it)."
        action={{ label: 'Join here as a new person', onClick: onJoinAsNew }}
        secondary={{ label: 'Back home', onClick: () => navigate('/') }}
      />
    );
  }
  if (room.status === 'connecting' || !room.self) {
    return <StatusScreen title="Joining room…" text={`Connecting to ${roomId}`} loading />;
  }

  const tabs = [
    { id: 'people', label: 'People', badge: room.participants.length },
    { id: 'chat', label: 'Chat', badge: room.unreadChat || null, hot: room.unreadChat > 0 },
    ...(staff ? [{ id: 'requests', label: 'Requests', badge: room.requests.length || null, hot: room.requests.length > 0 }] : []),
    ...(role === 'host' ? [{ id: 'manage', label: 'Manage' }] : []),
  ];

  if (onboardingOpen && role === 'host') {
    return (
      <RoomOnboarding
        roomId={roomId}
        room={room}
        storageKey={setupStorageKey}
        onComplete={() => {
          try {
            localStorage.removeItem(setupStorageKey);
            localStorage.setItem(setupCompleteKey, '1');
          } catch { /* nothing to clean up */ }
          setOnboardingOpen(false);
        }}
      />
    );
  }

  return (
    <div className="room">
      <RoomHeader roomId={roomId} self={room.self} status={room.status} onLeave={room.actions.leave} notify={room.notify} roomMeta={room.roomMeta} />

      <main className="room-grid">
        <VideoStage room={room} />

        <button className="panel-backdrop" aria-label="Close room panel" onClick={() => setPanelOpen(false)} />
        <aside className={`sidebar card tab-${tab} ${panelOpen ? 'is-open' : ''}`} aria-label="Room panel">
          <nav className="tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                role="tab"
                aria-selected={tab === t.id}
                aria-controls="tab-panel"
                className={`tab ${tab === t.id ? 'is-active' : ''}`}
                onClick={() => { setTab(t.id); setPanelOpen(true); }}
              >
                <span>{t.label}</span>
                {t.badge != null && <span className={`badge ${t.hot ? 'is-hot' : ''}`}>{t.badge}</span>}
              </button>
            ))}
          </nav>
          <div className="tab-body" id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {tab === 'people' && <ParticipantList room={room} />}
            {tab === 'chat' && <ChatPanel room={room} />}
            {tab === 'requests' && staff && <RequestsPanel room={room} />}
            {tab === 'manage' && role === 'host' && <HostPanel room={room} roomId={roomId} onManagePeople={() => setTab('people')} />}
          </div>
        </aside>
      </main>

      <button className="mobile-panel-trigger" onClick={() => setPanelOpen(true)} aria-label="Open room panel">
        <Icon name="chat" size={20} />
        <span>{room.unreadChat ? `${room.unreadChat} new message${room.unreadChat === 1 ? '' : 's'}` : 'Room panel'}</span>
      </button>

      <Toasts toasts={room.toasts} />
    </div>
  );
}
