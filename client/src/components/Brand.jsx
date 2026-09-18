import { Link } from 'react-router-dom';

export default function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Watch Party home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M8 5l12 7-12 7z" /></svg>
      </span>
      <span>watchparty<span className="brand-dot">.</span></span>
    </Link>
  );
}
