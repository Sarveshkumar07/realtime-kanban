const time = (iso) => new Date(iso).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });

export default function ActivityPanel({ items, onClose }) {
  return (
    <aside className="panel activity" aria-label="Activity log">
      <header className="panel-head">
        <h3>Activity in this branch</h3>
        <button className="btn ghost" onClick={onClose}>
          Close
        </button>
      </header>
      {!items.length && <p className="muted">Nothing has happened yet.</p>}
      <ul>
        {items.map((a) => (
          <li key={a.id}>
            <p>
              <strong>{a.userName}</strong> {a.summary}
            </p>
            <span className="muted small">{time(a.createdAt)}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
