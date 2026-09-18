import Brand from './Brand.jsx';

export default function StatusScreen({ title, text, action, secondary, loading }) {
  return (
    <div className="gate">
      <Brand />
      <div className="panel status-card">
        {loading && <div className="loader" aria-hidden="true"><i /><i /><i /></div>}
        <h2>{title}</h2>
        {text && <p className="muted">{text}</p>}
        <div className="status-actions">
          {action && <button className="btn btn-primary" onClick={action.onClick}>{action.label}</button>}
          {secondary && <button className="btn btn-ghost" onClick={secondary.onClick}>{secondary.label}</button>}
        </div>
      </div>
    </div>
  );
}
