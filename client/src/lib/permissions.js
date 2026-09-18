/**
 * UI-side copy of the role rules. Used ONLY to show/disable buttons.
 * The real check happens on the server (server/src/permissions.js).
 */
export const ROLE_LABEL = { host: 'Host', moderator: 'Moderator', participant: 'Participant', viewer: 'Viewer' };

export const canControl = (role) => role === 'host' || role === 'moderator';
export const canRequest = (role) => role === 'participant';
export const isHost = (role) => role === 'host';
