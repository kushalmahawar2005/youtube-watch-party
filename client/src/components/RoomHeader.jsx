import Brand from './Brand.jsx';
import RoleChip from './RoleChip.jsx';

export default function RoomHeader({ roomId, self, status, onLeave, notify }) {
  const inviteLink = `${window.location.origin}/room/${roomId}`;

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${label} copied`, 'good');
    } catch {
      notify(text);
    }
  }

  return (
    <header className="room-top">
      <Brand />
      <div className="room-meta">
        <button className="code-ticket" onClick={() => copy(roomId, 'Room code')} title="Copy room code">
          <span className="code-label">ROOM</span>
          <span className="code-value">{roomId}</span>
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => copy(inviteLink, 'Invite link')}>
          Copy invite link
        </button>
      </div>
      <div className="room-me">
        {status === 'reconnecting' && <span className="conn-warn">Reconnecting…</span>}
        <span className="me-name">{self.username}</span>
        <RoleChip role={self.role} />
        <button className="btn btn-ghost btn-sm" onClick={onLeave}>Leave</button>
      </div>
    </header>
  );
}
