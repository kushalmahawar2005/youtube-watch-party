import { useEffect, useState } from 'react';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';
import VideoPicker from './VideoPicker.jsx';

const PARTY_EMOJIS = ['🎬', '🍿', '🎮', '⚽', '🎵', '🎉'];

export default function RoomOnboarding({ roomId, room, storageKey, onComplete }) {
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { return null; }
  })();
  const [step, setStep] = useState(saved?.step >= 1 && saved?.step <= 3 ? saved.step : 1);
  const [chosen, setChosen] = useState(Boolean(saved?.chosen));
  const [title, setTitle] = useState(room.roomMeta?.title || 'My watch party');
  const [emoji, setEmoji] = useState(room.roomMeta?.emoji || '🎬');
  const [privateRoom, setPrivateRoom] = useState(Boolean(room.roomMeta?.isPrivate));
  const [password, setPassword] = useState('');
  const inviteLink = `${window.location.origin}/room/${roomId}`;

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ step, chosen })); } catch { /* setup still works without storage */ }
  }, [storageKey, step, chosen]);

  async function chooseVideo(videoId) {
    const res = await room.actions.changeVideo(videoId);
    if (!res.ok) return room.notify(res.error?.message || 'Could not choose this video.', 'bad');
    setChosen(true);
    setStep(2);
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      room.notify('Invite link copied', 'good');
    } catch {
      room.notify(inviteLink);
    }
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(roomId);
      room.notify('Room code copied', 'good');
    } catch {
      room.notify(roomId);
    }
  }

  async function shareInvite() {
    if (!navigator.share) return copyInvite();
    try {
      await navigator.share({
        title: 'Join my watch party',
        text: `Join my YouTube watch party. Room code: ${roomId}`,
        url: inviteLink,
      });
    } catch (err) {
      if (err?.name !== 'AbortError') copyInvite();
    }
  }

  async function saveRoomDetails() {
    if (privateRoom && password.length < 4) {
      room.notify('Use a password with at least 4 characters.', 'bad');
      return;
    }
    const res = await room.actions.updateRoom({
      title,
      emoji,
      password: privateRoom ? password : undefined,
      removePassword: !privateRoom,
    });
    if (!res.ok) return room.notify(res.error?.message || 'Could not save room settings.', 'bad');
    setStep(3);
  }

  return (
    <main className="onboarding-shell">
      <header className="onboarding-top"><Brand /><span>Set up your watch party</span></header>
      <section className="onboarding-card card">
        <div className="onboarding-progress" aria-label={`Step ${step} of 3`}>
          {[1, 2, 3].map((n) => <span key={n} className={n <= step ? 'is-done' : ''}>{n}</span>)}
        </div>

        {step === 1 && (
          <div className="onboarding-step">
            <p className="eyebrow">Step 1 of 3</p>
            <h1>What are we watching?</h1>
            <p className="muted">Search YouTube or paste a link. You can always change it later.</p>
            <VideoPicker control currentVideoId={room.syncState?.videoId} onPick={chooseVideo} notify={room.notify} />
            <button className="setup-skip" onClick={() => setStep(2)}>Keep the demo video for now</button>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-step">
            <p className="eyebrow">Step 2 of 3</p>
            <h1>Make the room yours.</h1>
            <p className="muted">Give your party a name and protect it before you send the invite.</p>
            <label className="field">
              <span>Party name</span>
              <input value={title} maxLength={48} placeholder="e.g. Friday movie night" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <div className="emoji-picker" role="group" aria-label="Choose room emoji">
              {PARTY_EMOJIS.map((item) => <button key={item} className={emoji === item ? 'is-selected' : ''} onClick={() => setEmoji(item)} aria-label={`Use ${item} as room emoji`}>{item}</button>)}
            </div>
            <label className="privacy-toggle">
              <input type="checkbox" checked={privateRoom} onChange={(e) => setPrivateRoom(e.target.checked)} />
              <span><b>Private room</b><small>People need a password before they can join.</small></span>
            </label>
            {privateRoom && <label className="field"><span>Room password</span><input type="password" value={password} minLength={4} autoComplete="new-password" placeholder="At least 4 characters" onChange={(e) => setPassword(e.target.value)} /></label>}
            <div className="setup-nav"><button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button><button className="btn btn-primary" onClick={saveRoomDetails}>Next <span aria-hidden="true">→</span></button></div>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-step setup-ready">
            <p className="eyebrow">Step 3 of 3</p>
            <span className="setup-ready-icon"><Icon name="check" size={30} /></span>
            <h1>Invite your people.</h1>
            <p className="muted">{chosen ? 'Your video is selected.' : 'Your demo video is ready.'} Share the room once, then enter when you’re ready.</p>
            <div className="setup-invite">
              <span className="setup-code-label">Room code</span>
              <strong>{roomId}</strong>
              <button className="icon-btn" onClick={copyRoomCode} aria-label="Copy room code"><Icon name="copy" size={18} /></button>
            </div>
            <div className="setup-actions">
              <button className="btn btn-secondary" onClick={copyInvite}><Icon name="link" size={16} /> Copy invite</button>
              {'share' in navigator && <button className="btn btn-primary" onClick={shareInvite}><Icon name="share" size={16} /> Share invite</button>}
            </div>
            <button className="btn btn-primary btn-xl" onClick={onComplete}>Enter the room <span aria-hidden="true">→</span></button>
            <button className="setup-skip" onClick={() => setStep(2)}>Back to room details</button>
          </div>
        )}
      </section>
    </main>
  );
}
