import { useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
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
  const location = useLocation();
  const saved = getSavedName();
  const [userId, setUserId] = useState(getUserId);
  const [username, setUsername] = useState(saved);
  const [password, setPassword] = useState(location.state?.password || '');
  const [gateComplete, setGateComplete] = useState(Boolean(location.state?.autoJoin));

  if (!gateComplete) {
    return (
      <NameGate
        roomId={roomId.toUpperCase()}
        initialName={saved}
        onSubmit={(name, submittedPassword) => {
          saveName(name);
          setPassword(submittedPassword);
          setUsername(name);
          setGateComplete(true);
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
      password={password}
      startOnboarding={Boolean(location.state?.autoJoin)}
      onRetryJoin={() => {
        setPassword('');
        setGateComplete(false);
      }}
      onJoinAsNew={() => setUserId(resetUserId())}
    />
  );
}
