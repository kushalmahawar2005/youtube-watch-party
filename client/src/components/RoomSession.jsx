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
import { canControl } from '../lib/permissions.js';

export default function RoomSession({ roomId, userId, username, onJoinAsNew }) {
  const navigate = useNavigate();
  const room = useRoom({ roomId, userId, username });
  const [tab, setTab] = useState('people');
  const role = room.self?.role;
  const staff = canControl(role);

  useEffect(() => room.setChatOpen(tab === 'chat'), [tab, room.setChatOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!staff && tab === 'requests') setTab('people');
  }, [staff, tab]);
  useEffect(() => {
    if (room.status === 'left') navigate('/');
  }, [room.status, navigate]);

  if (room.status === 'error') {
    return (
      <StatusScreen
        title={room.error?.code === 'ROOM_NOT_FOUND' ? 'Room not found' : 'Could not join'}
        text={room.error?.message}
        action={{ label: 'Back home', onClick: () => navigate('/') }}
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
  ];

  return (
    <div className="room">
      <RoomHeader roomId={roomId} self={room.self} status={room.status} onLeave={room.actions.leave} notify={room.notify} />

      <main className="room-grid">
        <VideoStage room={room} />

        <aside className={`sidebar card tab-${tab}`} aria-label="Room panel">
          <nav className="tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                role="tab"
                aria-selected={tab === t.id}
                aria-controls="tab-panel"
                className={`tab ${tab === t.id ? 'is-active' : ''}`}
                onClick={() => setTab(t.id)}
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
          </div>
        </aside>
      </main>

      <Toasts toasts={room.toasts} />
    </div>
  );
}
