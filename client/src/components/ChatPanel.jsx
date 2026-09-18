import { useEffect, useRef, useState } from 'react';

const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function ChatPanel({ room }) {
  const { chat, self, actions } = room;
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  async function send(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    const res = await actions.sendChat(value);
    if (!res.ok) setText(value);
  }

  return (
    <div className="chat">
      <ul className="messages" ref={listRef}>
        {chat.length === 0 && <li className="empty"><p>Say hi 👋</p><small>Messages are visible to everyone in the room.</small></li>}
        {chat.map((m) =>
          m.system ? (
            <li key={m.id} className="msg-system">{m.text}</li>
          ) : (
            <li key={m.id} className={`msg ${m.userId === self.userId ? 'is-mine' : ''}`}>
              <div className="msg-head">
                <b className={`name-${m.role}`}>{m.userId === self.userId ? 'You' : m.username}</b>
                <time>{clock(m.sentAt)}</time>
              </div>
              <p>{m.text}</p>
            </li>
          ),
        )}
      </ul>
      <form className="chat-form" onSubmit={send}>
        <input value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Message the room…" aria-label="Chat message" />
        <button className="btn btn-primary btn-sm" type="submit" disabled={!text.trim()}>Send</button>
      </form>
    </div>
  );
}
