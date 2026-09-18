import Brand from './Brand.jsx';
import RoleChip from './RoleChip.jsx';
import Icon from './Icon.jsx';

export default function RoomHeader({ roomId, self, status, onLeave, notify, roomMeta }) {
  const inviteLink = `${window.location.origin}/room/${roomId}`;

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${label} copied`, 'good');
    } catch {
      notify(text);
    }
  }

  async function shareInvite() {
    if (!navigator.share) return copy(inviteLink, 'Invite link');
    try {
      await navigator.share({
        title: 'Join my watch party',
        text: `Join my YouTube watch party. Room code: ${roomId}`,
        url: inviteLink,
      });
    } catch (err) {
      // Closing the native share sheet is not an error worth showing.
      if (err?.name !== 'AbortError') copy(inviteLink, 'Invite link');
    }
  }

  return (
    <header className="room-top">
      <Brand />

      {roomMeta && <span className="room-title" title={roomMeta.title}>{roomMeta.emoji} {roomMeta.title}{roomMeta.isPrivate && <Icon name="lock" size={14} />}</span>}

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
        {'share' in navigator && (
          <button className="icon-btn share-btn" onClick={shareInvite} aria-label="Share invite" title="Share invite">
            <Icon name="share" size={18} />
          </button>
        )}
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
