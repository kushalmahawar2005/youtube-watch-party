import { useState } from 'react';
import { useParams } from 'react-router-dom';
import RoomSession from '../components/RoomSession.jsx';
import NameGate from '../components/NameGate.jsx';
import { getSavedName, getUserId, resetUserId, saveName } from '../lib/identity.js';

/**
 * /room/:roomId
 * Coming from the Home page -> join straight away.
 * Opening an invite link directly -> ask for a name first (that click also lets the browser autoplay video).
 */
export default function Room() {
  const { roomId } = useParams();
  const saved = getSavedName();
  const [userId, setUserId] = useState(getUserId);
  const [username, setUsername] = useState(saved);

  if (!username) {
    return (
      <NameGate
        roomId={roomId.toUpperCase()}
        initialName={saved}
        onSubmit={(name) => {
          saveName(name);
          setUsername(name);
        }}
      />
    );
  }

  return (
    <RoomSession
      key={userId}
      roomId={roomId.toUpperCase()}
      userId={userId}
      username={username}
      onJoinAsNew={() => setUserId(resetUserId())}
    />
  );
}
