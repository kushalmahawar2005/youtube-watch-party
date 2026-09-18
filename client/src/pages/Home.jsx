import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Brand from '../components/Brand.jsx';
import { socket, emitWithAck, apiUrl } from '../lib/socket.js';
import { C2S } from '../lib/events.js';
import { getSavedName, getUserId, saveName } from '../lib/identity.js';

/** Accepts "ABC123" or a full invite link like https://site.com/room/ABC123 */
function parseRoomCode(input) {
  const value = input.trim();
  const fromLink = value.match(/\/room\/([A-Za-z0-9]{4,12})/);
  return (fromLink ? fromLink[1] : value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export default function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState(getSavedName());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const requireName = () => {
    if (!name.trim()) {
      setError('Enter your name first.');
      document.getElementById('name')?.focus();
      return false;
    }
    saveName(name.trim());
    return true;
  };

  async function createRoom() {
    setError('');
    if (!requireName()) return;
    setBusy('create');
    if (!socket.connected) socket.connect();
    const res = await emitWithAck(C2S.CREATE_ROOM, { userId: getUserId() });
    setBusy(null);
    if (!res.ok) return setError(res.error?.message || 'Could not create room.');
    navigate(`/room/${res.roomId}`, { state: { autoJoin: true } });
  }

  async function joinRoom(e) {
    e.preventDefault();
    setError('');
    if (!requireName()) return;
    const roomId = parseRoomCode(code);
    if (!roomId) return setError('Enter a room code or invite link.');
    setBusy('join');
    try {
      const res = await fetch(apiUrl(`/api/rooms/${roomId}`));
      if (res.status === 404) return setError(`Room ${roomId} not found. Check the code.`);
      if (!res.ok) throw new Error();
      navigate(`/room/${roomId}`, { state: { autoJoin: true } });
    } catch {
      setError('Server not reachable. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="home">
      <header className="home-top">
        <Brand />
        <span className="live-pill"><i /> real-time sync</span>
      </header>

      <main className="home-main">
        <section className="hero">
          <p className="eyebrow">YouTube · Watch Party</p>
          <h1>
            Press play.
            <br />
            <em>Together.</em>
          </h1>
          <p className="lede">
            One room, one video, everyone on the same second. The host runs the remote, hands it to moderators, and
            everyone else just enjoys the show.
          </p>
          <ol className="how">
            <li><b>01</b> Create a room</li>
            <li><b>02</b> Share the code</li>
            <li><b>03</b> Watch in sync</li>
          </ol>
        </section>

        <section className="panel ticket" aria-label="Create or join a room">
          <label className="field">
            <span>Your name</span>
            <input
              id="name"
              value={name}
              maxLength={24}
              autoComplete="nickname"
              placeholder="e.g. Kushal"
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <button className="btn btn-primary btn-xl" onClick={createRoom} disabled={busy !== null}>
            {busy === 'create' ? 'Creating…' : 'Create a room'}
            <span aria-hidden="true">→</span>
          </button>

          <div className="perforation" aria-hidden="true"><span>or join one</span></div>

          <form className="join-row" onSubmit={joinRoom}>
            <input
              className="code-input"
              value={code}
              placeholder="ROOM CODE / LINK"
              aria-label="Room code or invite link"
              onChange={(e) => setCode(e.target.value)}
            />
            <button className="btn btn-ghost" type="submit" disabled={busy !== null}>
              {busy === 'join' ? '…' : 'Join'}
            </button>
          </form>

          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
      </main>

      <footer className="home-foot">
        <span>React · Express · Socket.IO · YouTube IFrame API</span>
      </footer>
    </div>
  );
}
