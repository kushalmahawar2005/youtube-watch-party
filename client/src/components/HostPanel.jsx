import { useState } from 'react';
import Icon from './Icon.jsx';
import { extractVideoId, thumbnailUrl } from '../lib/youtube.js';
import { useVideoInfo } from '../hooks/useVideoInfo.js';

const EMOJIS = ['🎬', '🍿', '🎮', '⚽', '🎵', '🎉'];

function QueueItem({ item, index, total, onPlay, onRemove, onMove }) {
  const info = useVideoInfo(item.videoId);
  return (
    <li className="playlist-item">
      <img src={info?.thumbnail || thumbnailUrl(item.videoId)} alt="" />
      <span><b>{info?.title || 'Loading video…'}</b><small>Added by {item.addedBy.username}</small></span>
      <div><button type="button" onClick={() => onMove(item.id, 'up')} disabled={index === 0} aria-label="Move up">↑</button><button type="button" onClick={() => onMove(item.id, 'down')} disabled={index === total - 1} aria-label="Move down">↓</button><button type="button" onClick={() => onPlay(item.id)}>Play</button><button type="button" onClick={() => onRemove(item.id)} aria-label="Remove from playlist"><Icon name="close" size={15} /></button></div>
    </li>
  );
}

export default function HostPanel({ room, roomId, onManagePeople }) {
  const meta = room.roomMeta || { title: 'My watch party', emoji: '🎬', isPrivate: false };
  const [title, setTitle] = useState(meta.title);
  const [emoji, setEmoji] = useState(meta.emoji);
  const [privateRoom, setPrivateRoom] = useState(meta.isPrivate);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [queueInput, setQueueInput] = useState('');

  async function save(e) {
    e.preventDefault();
    if (privateRoom && !meta.isPrivate && password.length < 4) {
      room.notify('Use a password with at least 4 characters.', 'bad');
      return;
    }
    setSaving(true);
    const res = await room.actions.updateRoom({
      title,
      emoji,
      password: password || undefined,
      removePassword: !privateRoom,
    });
    setSaving(false);
    if (res.ok) {
      setPassword('');
      room.notify('Room settings saved', 'good');
    } else room.notify(res.error?.message || 'Could not save room settings.', 'bad');
  }

  const online = room.participants.filter((p) => p.online).length;
  const invite = `${window.location.origin}/room/${roomId}`;

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(invite);
      room.notify('Invite link copied', 'good');
    } catch {
      room.notify(invite);
    }
  }

  async function addVideo(e) {
    e.preventDefault();
    const videoId = extractVideoId(queueInput);
    if (!videoId) return room.notify('Paste a valid YouTube link or video ID.', 'bad');
    const res = await room.actions.addToPlaylist(videoId);
    if (res.ok) {
      setQueueInput('');
      room.notify('Added to Up Next', 'good');
    } else room.notify(res.error?.message || 'Could not add this video.', 'bad');
  }

  async function playItem(itemId) {
    const res = await room.actions.playPlaylistItem(itemId);
    if (!res.ok) room.notify(res.error?.message || 'Could not play this video.', 'bad');
  }

  async function removeItem(itemId) {
    const res = await room.actions.removeFromPlaylist(itemId);
    if (!res.ok) room.notify(res.error?.message || 'Could not remove this video.', 'bad');
  }

  async function moveItem(itemId, direction) {
    const res = await room.actions.movePlaylistItem(itemId, direction);
    if (!res.ok) room.notify(res.error?.message || 'Could not reorder this video.', 'bad');
  }

  return (
    <div className="host-panel">
      <section className="host-summary">
        <div className="host-summary-icon">{meta.emoji}</div>
        <div><p className="eyebrow">Host dashboard</p><h2>{meta.title}</h2><span>{online} online · {room.requests.length} pending request{room.requests.length === 1 ? '' : 's'}</span></div>
      </section>

      <div className="host-shortcuts">
        <button type="button" onClick={copyInvite}><Icon name="link" size={17} /> Copy invite</button>
        <button type="button" onClick={onManagePeople}><Icon name="more" size={17} /> Manage people</button>
      </div>

      <form className="host-settings" onSubmit={save}>
        <p className="queue-label">Room settings</p>
        <label className="field"><span>Party name</span><input value={title} maxLength={48} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="emoji-picker" role="group" aria-label="Choose room emoji">
          {EMOJIS.map((item) => <button type="button" key={item} className={emoji === item ? 'is-selected' : ''} onClick={() => setEmoji(item)}>{item}</button>)}
        </div>
        <label className="privacy-toggle"><input type="checkbox" checked={privateRoom} onChange={(e) => setPrivateRoom(e.target.checked)} /><span><b>Private room</b><small>{privateRoom ? 'A password is required for new people.' : 'Anyone with the link can enter.'}</small></span></label>
        {privateRoom && <label className="field"><span>{meta.isPrivate ? 'New password (optional)' : 'Room password'}</span><input type="password" minLength={4} value={password} autoComplete="new-password" placeholder={meta.isPrivate ? 'Keep the existing password' : 'At least 4 characters'} onChange={(e) => setPassword(e.target.value)} /></label>}
        <button className="btn btn-primary" disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Save settings'}</button>
      </form>

      <section className="playlist-manager">
        <div className="playlist-head"><p className="queue-label">Up next</p><span>{room.playlist.length} queued · auto-play on</span></div>
        <form className="playlist-add" onSubmit={addVideo}>
          <input value={queueInput} placeholder="Paste a YouTube link" aria-label="YouTube link to add to playlist" onChange={(e) => setQueueInput(e.target.value)} />
          <button className="btn btn-secondary btn-sm" disabled={!queueInput.trim()}>Add</button>
        </form>
        {room.playlist.length === 0 ? <p className="playlist-empty">No videos queued. Add the next one before this ends.</p> : <ol className="playlist-list">{room.playlist.map((item, index) => <QueueItem key={item.id} item={item} index={index} total={room.playlist.length} onPlay={playItem} onRemove={removeItem} onMove={moveItem} />)}</ol>}
      </section>
    </div>
  );
}
