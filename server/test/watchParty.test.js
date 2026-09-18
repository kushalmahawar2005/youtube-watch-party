import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/app.js';

let server, url;
const sockets = [];

before(async () => {
  ({ server } = createApp({ socketOptions: { disconnectGraceMs: 200 } }));
  await new Promise((r) => server.listen(0, r));
  url = `http://localhost:${server.address().port}`;
});

after(async () => {
  sockets.forEach((s) => s.disconnect());
  await new Promise((r) => server.close(r));
});

const client = () => {
  const s = connect(url, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
};
const emit = (s, event, payload) => new Promise((r) => s.emit(event, payload, r));
const once = (s, event, timeout = 1000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    s.once(event, (d) => { clearTimeout(t); resolve(d); });
  });

async function setupRoom() {
  const host = client();
  const guest = client();
  const hostId = `host_${Math.random().toString(36).slice(2, 10)}`;
  const guestId = `guest_${Math.random().toString(36).slice(2, 10)}`;
  const { roomId } = await emit(host, 'create_room', { userId: hostId });
  const hostJoin = await emit(host, 'join_room', { roomId, userId: hostId, username: 'Host' });
  const guestJoin = await emit(guest, 'join_room', { roomId, userId: guestId, username: 'Guest' });
  return { host, guest, hostId, guestId, roomId, hostJoin, guestJoin };
}

test('creator becomes host, joiner becomes participant', async () => {
  const { hostJoin, guestJoin } = await setupRoom();
  assert.equal(hostJoin.self.role, 'host');
  assert.equal(guestJoin.self.role, 'participant');
  assert.equal(guestJoin.participants.length, 2);
});

test('host play is broadcast to everyone', async () => {
  const { host, guest } = await setupRoom();
  // skip the guest's own 'join' sync_state, which can arrive just after the join ack
  const got = new Promise((resolve) => guest.on('sync_state', (d) => d.action === 'play' && resolve(d)));
  await emit(host, 'play', { time: 12 });
  const state = await got;
  assert.equal(state.playState, 'playing');
  assert.ok(state.currentTime >= 12);
});

test('participant cannot control playback or change video', async () => {
  const { guest } = await setupRoom();
  const res = await emit(guest, 'change_video', { videoId: 'dQw4w9WgXcQ' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'FORBIDDEN');
  assert.equal((await emit(guest, 'pause', {})).ok, false);
});

test('host promotes participant to moderator, who can then seek', async () => {
  const { host, guest, guestId } = await setupRoom();
  const roleEvent = once(guest, 'role_assigned');
  assert.equal((await emit(host, 'assign_role', { userId: guestId, role: 'moderator' })).ok, true);
  assert.equal((await roleEvent).role, 'moderator');

  const synced = once(host, 'sync_state');
  assert.equal((await emit(guest, 'seek', { time: 90 })).ok, true);
  assert.ok((await synced).currentTime >= 90);

  // moderator still cannot assign roles
  assert.equal((await emit(guest, 'assign_role', { userId: 'whatever123', role: 'viewer' })).error.code, 'FORBIDDEN');
});

test('participant request is approved by host and applied', async () => {
  const { host, guest } = await setupRoom();
  const created = once(host, 'request_created');
  await emit(guest, 'request_action', { type: 'change_video', payload: { videoId: 'dQw4w9WgXcQ' } });
  const request = await created;

  const resolved = once(guest, 'request_resolved');
  const synced = once(guest, 'sync_state');
  await emit(host, 'resolve_request', { requestId: request.id, approve: true });
  assert.equal((await resolved).approved, true);
  assert.equal((await synced).videoId, 'dQw4w9WgXcQ');
});

test('host removes participant; they cannot rejoin', async () => {
  const { host, guest, guestId, roomId } = await setupRoom();
  const kicked = once(guest, 'kicked');
  const removed = once(host, 'participant_removed');
  await emit(host, 'remove_participant', { userId: guestId });
  await kicked;
  assert.equal((await removed).participants.length, 1);
  const retry = await emit(guest, 'join_room', { roomId, userId: guestId, username: 'Guest' });
  assert.equal(retry.error.code, 'KICKED');
});

test('transfer host swaps roles', async () => {
  const { host, guest, guestId } = await setupRoom();
  const ev = once(guest, 'role_assigned');
  await emit(host, 'transfer_host', { userId: guestId });
  const { participants } = await ev;
  assert.equal(participants.find((p) => p.userId === guestId).role, 'host');
  assert.equal((await emit(host, 'assign_role', { userId: guestId, role: 'viewer' })).error.code, 'FORBIDDEN');
});

test('late joiner receives current state', async () => {
  const { host, roomId } = await setupRoom();
  await emit(host, 'change_video', { videoId: 'dQw4w9WgXcQ' });
  await emit(host, 'seek', { time: 30 });
  const late = client();
  const state = once(late, 'sync_state');
  await emit(late, 'join_room', { roomId, userId: 'late_user_1', username: 'Late' });
  const s = await state;
  assert.equal(s.videoId, 'dQw4w9WgXcQ');
  assert.ok(s.currentTime >= 30);
});

test('host disconnect -> after grace period someone else becomes host', async () => {
  const { host, guest, guestId } = await setupRoom();
  const ev = once(guest, 'role_assigned', 2000);
  host.disconnect();
  const data = await ev;
  assert.equal(data.userId, guestId);
  assert.equal(data.role, 'host');
});

test('chat message is broadcast', async () => {
  const { host, guest } = await setupRoom();
  const msg = once(host, 'chat_message');
  await emit(guest, 'chat_message', { text: '  hello  ' });
  assert.equal((await msg).text, 'hello');
});
