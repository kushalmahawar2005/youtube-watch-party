/** All socket event names in one place (client has a copy in client/src/lib/events.js). */

// Client -> Server
export const C2S = Object.freeze({
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  PLAY: 'play',
  PAUSE: 'pause',
  SEEK: 'seek',
  CHANGE_VIDEO: 'change_video',
  ASSIGN_ROLE: 'assign_role',
  REMOVE_PARTICIPANT: 'remove_participant',
  TRANSFER_HOST: 'transfer_host',
  REQUEST_ACTION: 'request_action',
  RESOLVE_REQUEST: 'resolve_request',
  CHAT_MESSAGE: 'chat_message',
  REACTION: 'reaction',
  UPDATE_ROOM: 'update_room',
  CANCEL_REQUEST: 'cancel_request',
  ADD_TO_PLAYLIST: 'add_to_playlist',
  REMOVE_FROM_PLAYLIST: 'remove_from_playlist',
  PLAY_PLAYLIST_ITEM: 'play_playlist_item',
  MOVE_PLAYLIST_ITEM: 'move_playlist_item',
});

// Server -> Client
export const S2C = Object.freeze({
  SYNC_STATE: 'sync_state',
  USER_JOINED: 'user_joined',
  USER_LEFT: 'user_left',
  PRESENCE_CHANGED: 'presence_changed',
  ROLE_ASSIGNED: 'role_assigned',
  PARTICIPANT_REMOVED: 'participant_removed',
  KICKED: 'kicked',
  SESSION_REPLACED: 'session_replaced',
  REQUEST_CREATED: 'request_created',
  REQUEST_RESOLVED: 'request_resolved',
  REQUESTS_SNAPSHOT: 'requests_snapshot',
  CHAT_MESSAGE: 'chat_message',
  REACTION: 'reaction',
  ERROR: 'error_message',
  ROOM_UPDATED: 'room_updated',
  REQUEST_CANCELLED: 'request_cancelled',
  PLAYLIST_UPDATED: 'playlist_updated',
});
