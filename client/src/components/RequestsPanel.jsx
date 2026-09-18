import { formatTime, thumbnailUrl } from '../lib/youtube.js';
import { useVideoInfo } from '../hooks/useVideoInfo.js';

function describe(req) {
  switch (req.type) {
    case 'play': return 'wants to play';
    case 'pause': return 'wants to pause';
    case 'seek': return `wants to jump to ${formatTime(req.payload.time)}`;
    case 'change_video': return 'wants to play this video';
    default: return req.type;
  }
}

function RequestedVideo({ videoId }) {
  const info = useVideoInfo(videoId);
  return (
    <div className="req-video">
      <span className="result-thumb">
        <img src={info?.thumbnail || thumbnailUrl(videoId)} alt="" loading="lazy" />
        {info && <small>{formatTime(info.duration)}</small>}
      </span>
      {info && (
        <span className="result-body">
          <span className="result-title">{info.title}</span>
          <span className="result-meta">{info.channel}</span>
        </span>
      )}
    </div>
  );
}

export default function RequestsPanel({ room }) {
  const { requests, actions } = room;

  if (requests.length === 0) {
    return (
      <div className="empty">
        <p>No pending requests</p>
        <small>When a participant presses play, seeks or suggests a video, it shows up here for you to approve.</small>
      </div>
    );
  }

  return (
    <ul className="requests">
      {requests.map((req) => (
        <li key={req.id} className="request">
          {req.type === 'change_video' && <RequestedVideo videoId={req.payload.videoId} />}
          <p>
            <b>{req.username}</b> {describe(req)}
          </p>
          <div className="req-actions">
            <button className="btn btn-primary btn-sm" onClick={() => actions.resolveRequest(req.id, true)}>Approve</button>
            <button className="btn btn-ghost btn-sm" onClick={() => actions.resolveRequest(req.id, false)}>Decline</button>
          </div>
        </li>
      ))}
    </ul>
  );
}
