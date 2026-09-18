import { useEffect, useState } from 'react';
import Brand from './Brand.jsx';
import { apiUrl } from '../lib/socket.js';

export default function NameGate({ roomId, initialName, onSubmit }) {
  const [name, setName] = useState(initialName);
  const [password, setPassword] = useState('');
  const [room, setRoom] = useState({ loading: true });

  useEffect(() => {
    fetch(apiUrl(`/api/rooms/${roomId}`))
      .then((r) => (r.ok ? r.json() : { notFound: true }))
      .then(setRoom)
      .catch(() => setRoom({ notFound: true }));
  }, [roomId]);

  return (
    <div className="gate">
      <Brand />
      <form
        className="panel ticket gate-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim(), password);
        }}
      >
        <p className="eyebrow">You're invited to</p>
        <div className="room-code-big">{roomId}</div>
        <p className="muted">
          {room.loading && 'Checking room…'}
          {room.notFound && 'This room does not exist (or has ended).'}
          {room.hostName && `Hosted by ${room.hostName} · ${room.participantCount} watching`}
        </p>
        <label className="field">
          <span>Your name</span>
          <input autoFocus value={name} maxLength={24} placeholder="e.g. Rahul" onChange={(e) => setName(e.target.value)} />
        </label>
        {room.isPrivate && (
          <label className="field">
            <span>Room password</span>
            <input type="password" value={password} autoComplete="current-password" placeholder="Enter the room password" onChange={(e) => setPassword(e.target.value)} />
          </label>
        )}
        <button className="btn btn-primary btn-xl" type="submit" disabled={!name.trim() || room.notFound}>
          Enter room <span aria-hidden="true">→</span>
        </button>
      </form>
    </div>
  );
}
