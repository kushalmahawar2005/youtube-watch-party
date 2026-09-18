/** An expected, user-facing error (bad input, missing permission, ...). */
export class RoomError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RoomError';
    this.code = code;
  }
}
