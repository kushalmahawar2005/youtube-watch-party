import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import RoleChip from './RoleChip.jsx';
import Icon from './Icon.jsx';
import { isHost, ROLE_LABEL } from '../lib/permissions.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';

const hue = (id) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const ASSIGNABLE = ['moderator', 'participant', 'viewer'];
const ROLE_HINT = { moderator: 'Controls playback', participant: 'Can request changes', viewer: 'Watch only' };

function Avatar({ person }) {
  return (
    <span className="avatar" style={{ '--h': hue(person.userId) }}>
      {person.username.slice(0, 1).toUpperCase()}
      <i className="presence" title={person.online ? 'Online' : 'Reconnecting…'} />
    </span>
  );
}

/** Host-only actions for one person. Same content, shown inline (desktop) or as a bottom sheet (mobile). */
function PersonMenu({ person, actions, onClose }) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div className="menu" role="menu" aria-label={`Manage ${person.username}`}>
      <p className="menu-label">Role</p>
      {ASSIGNABLE.map((r) => {
        const active = person.role === r;
        return (
          <button
            key={r}
            role="menuitemradio"
            aria-checked={active}
            className={`menu-item ${active ? 'is-active' : ''}`}
            onClick={() => !active && actions.assignRole(person.userId, r)}
          >
            <span className="menu-text">
              <span>{ROLE_LABEL[r]}</span>
              <small>{ROLE_HINT[r]}</small>
            </span>
            {active && <Icon name="check" size={18} className="menu-check" />}
          </button>
        );
      })}
      <div className="menu-sep" role="separator" />
      <button
        role="menuitem"
        className="menu-item"
        onClick={() => {
          actions.transferHost(person.userId);
          onClose();
        }}
      >
        <Icon name="crown" size={18} />
        <span className="menu-text"><span>Make host</span></span>
      </button>
      {confirmRemove ? (
        <div className="menu-confirm">
          <span>Remove {person.username}? They can't rejoin.</span>
          <div>
            <button className="btn btn-secondary btn-sm" onClick={() => setConfirmRemove(false)}>Cancel</button>
            <button className="btn btn-danger btn-sm" onClick={() => actions.removeParticipant(person.userId)}>Remove</button>
          </div>
        </div>
      ) : (
        <button role="menuitem" className="menu-item is-danger" onClick={() => setConfirmRemove(true)}>
          <Icon name="trash" size={18} />
          <span className="menu-text"><span>Remove from room</span></span>
        </button>
      )}
    </div>
  );
}

function Sheet({ person, children, onClose }) {
  return createPortal(
    <div className="sheet-root">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`Manage ${person.username}`}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <Avatar person={person} />
          <div className="sheet-title">
            <strong>{person.username}</strong>
            <RoleChip role={person.role} />
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export default function ParticipantList({ room }) {
  const { participants, self, actions } = room;
  const [openId, setOpenId] = useState(null);
  const amHost = isHost(self.role);
  const mobile = useMediaQuery('(max-width: 767px)');
  const openPerson = amHost ? participants.find((p) => p.userId === openId && p.userId !== self.userId) : null;
  const close = () => setOpenId(null);

  useEffect(() => {
    if (!openPerson) return undefined;
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openPerson]);

  const online = participants.filter((p) => p.online).length;

  return (
    <div className="people-wrap">
      <p className="people-count">
        {participants.length} in room{online !== participants.length && ` · ${online} online`}
      </p>
      <ul className="people">
        {participants.map((p) => {
          const me = p.userId === self.userId;
          const manageable = amHost && !me;
          const open = openPerson?.userId === p.userId;
          return (
            <li key={p.userId} className={`person ${open ? 'is-open' : ''} ${p.online ? '' : 'is-offline'}`}>
              <div className="person-row">
                <Avatar person={p} />
                <span className="person-name">
                  <span className="person-name-text">{p.username}</span>
                  {me && <small>You</small>}
                </span>
                <RoleChip role={p.role} />
                {manageable && (
                  <button
                    className="icon-btn person-more"
                    aria-label={`Manage ${p.username}`}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : p.userId)}
                  >
                    <Icon name="more" size={20} />
                  </button>
                )}
              </div>
              {open && !mobile && <PersonMenu person={p} actions={actions} onClose={close} />}
            </li>
          );
        })}
      </ul>
      <p className="people-hint">
        {amHost ? 'Use ⋯ next to someone to change their role, make them host or remove them.' : 'Only the host can change roles.'}
      </p>

      {openPerson && mobile && (
        <Sheet person={openPerson} onClose={close}>
          <PersonMenu person={openPerson} actions={actions} onClose={close} />
        </Sheet>
      )}
    </div>
  );
}
