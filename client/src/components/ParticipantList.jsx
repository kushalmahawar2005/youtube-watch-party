import { useState } from 'react';
import RoleChip from './RoleChip.jsx';
import { isHost } from '../lib/permissions.js';

const hue = (id) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export default function ParticipantList({ room }) {
  const { participants, self, actions } = room;
  const [openId, setOpenId] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const amHost = isHost(self.role);

  return (
    <ul className="people">
      {participants.map((p) => {
        const me = p.userId === self.userId;
        const open = amHost && !me && openId === p.userId;
        return (
          <li key={p.userId} className={`person ${open ? 'is-open' : ''} ${p.online ? '' : 'is-offline'}`}>
            <div className="person-row">
              <span className="avatar" style={{ '--h': hue(p.userId) }}>
                {p.username.slice(0, 1).toUpperCase()}
                <i className="presence" title={p.online ? 'Online' : 'Reconnecting…'} />
              </span>
              <span className="person-name">
                {p.username}
                {me && <small> (you)</small>}
              </span>
              <RoleChip role={p.role} />
              {amHost && !me && (
                <button
                  className="icon-btn"
                  aria-label={`Manage ${p.username}`}
                  aria-expanded={open}
                  onClick={() => {
                    setOpenId(open ? null : p.userId);
                    setConfirmRemove(null);
                  }}
                >
                  ⋯
                </button>
              )}
            </div>

            {open && (
              <div className="person-actions">
                <div className="seg" role="group" aria-label="Assign role">
                  {['moderator', 'participant', 'viewer'].map((r) => (
                    <button
                      key={r}
                      className={`seg-btn ${p.role === r ? 'is-active' : ''}`}
                      onClick={() => actions.assignRole(p.userId, r)}
                      disabled={p.role === r}
                    >
                      {r === 'moderator' ? 'Mod' : r[0].toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="person-danger">
                  <button className="btn btn-ghost btn-sm" onClick={() => actions.transferHost(p.userId)}>
                    Make host
                  </button>
                  {confirmRemove === p.userId ? (
                    <button className="btn btn-danger btn-sm" onClick={() => actions.removeParticipant(p.userId)}>
                      Confirm remove
                    </button>
                  ) : (
                    <button className="btn btn-ghost btn-sm danger-text" onClick={() => setConfirmRemove(p.userId)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        );
      })}
      <li className="people-hint">
        {amHost
          ? 'Tap ⋯ next to someone to change their role, make them host or remove them.'
          : 'Only the host can change roles.'}
      </li>
    </ul>
  );
}
