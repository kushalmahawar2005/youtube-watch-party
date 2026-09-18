import Brand from './Brand.jsx';
import RoleChip from './RoleChip.jsx';
import Icon from './Icon.jsx';

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

      <div className="invite" aria-label="Invite people">
        <button className="code-chip" onClick={() => copy(roomId, 'Room code')} title="Copy room code">
          <span className="code-label">Room</span>
          <span className="code-value">{roomId}</span>
          <Icon name="copy" size={16} className="code-icon" />
        </button>
        <button className="btn btn-secondary" onClick={() => copy(inviteLink, 'Invite link')}>
          <Icon name="link" size={16} />
          <span>Copy invite</span>
        </button>
      </div>

      <div className="room-me">
        {status === 'reconnecting' && (
          <span className="conn-warn" role="status">
            <i aria-hidden="true" />
            <span>Reconnecting</span>
          </span>
        )}
        <span className="me-name" title={self.username}>{self.username}</span>
        <RoleChip role={self.role} />
        <button className="btn btn-secondary btn-leave" onClick={onLeave} aria-label="Leave room">
          <Icon name="leave" size={16} />
          <span className="btn-leave-text">Leave</span>
        </button>
      </div>
    </header>
  );
}
