/**
 * Role-based access control (RBAC).
 *
 * Every socket event that changes something is mapped to an ACTION.
 * Before the server processes an event it calls can(role, action).
 * This is the single source of truth for "who is allowed to do what".
 */

export const ROLES = Object.freeze({
  HOST: 'host',
  MODERATOR: 'moderator',
  PARTICIPANT: 'participant',
  VIEWER: 'viewer',
});

export const ACTIONS = Object.freeze({
  CONTROL_PLAYBACK: 'control_playback', // play / pause / seek
  CHANGE_VIDEO: 'change_video',
  ASSIGN_ROLE: 'assign_role',
  REMOVE_PARTICIPANT: 'remove_participant',
  TRANSFER_HOST: 'transfer_host',
  RESOLVE_REQUEST: 'resolve_request', // approve / reject a participant's request
  REQUEST_CHANGE: 'request_change', // ask host/mod to play, pause, seek or change video
  CHAT: 'chat', // chat + emoji reactions
  MANAGE_ROOM: 'manage_room', // title / emoji / access password
  MANAGE_PLAYLIST: 'manage_playlist',
});

const PERMISSIONS = Object.freeze({
  [ROLES.HOST]: new Set(Object.values(ACTIONS).filter((a) => a !== ACTIONS.REQUEST_CHANGE)),
  [ROLES.MODERATOR]: new Set([
    ACTIONS.CONTROL_PLAYBACK,
    ACTIONS.CHANGE_VIDEO,
    ACTIONS.RESOLVE_REQUEST,
    ACTIONS.CHAT,
  ]),
  [ROLES.PARTICIPANT]: new Set([ACTIONS.REQUEST_CHANGE, ACTIONS.CHAT]),
  // Viewer = watch + chat only (cannot even send requests)
  [ROLES.VIEWER]: new Set([ACTIONS.CHAT]),
});

/** Roles the host is allowed to hand out with assign_role (host changes only via transfer_host). */
export const ASSIGNABLE_ROLES = Object.freeze([ROLES.MODERATOR, ROLES.PARTICIPANT, ROLES.VIEWER]);

/** Roles that can manage playback and see requests ("staff"). */
export const isStaff = (role) => role === ROLES.HOST || role === ROLES.MODERATOR;

export function can(role, action) {
  return PERMISSIONS[role]?.has(action) ?? false;
}
