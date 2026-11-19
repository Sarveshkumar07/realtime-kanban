import { useMemo, useState } from 'react';
import Avatar from './Avatar.jsx';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

function AddCard({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const submit = () => {
    if (text.trim()) onAdd(text.trim());
    setText('');
  };
  if (!open)
    return (
      <button className="add-card" onClick={() => setOpen(true)}>
        + Add a task
      </button>
    );
  return (
    <div className="add-form">
      <textarea
        autoFocus
        rows={2}
        value={text}
        placeholder="What needs doing?"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      <div className="row">
        <button className="btn primary" onClick={submit}>
          Add
        </button>
        <button className="btn ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ColumnHead({ column, count, canAdmin, actions }) {
  const [editing, setEditing] = useState(false);
  const save = (value) => {
    setEditing(false);
    if (value.trim() && value.trim() !== column.name) actions.renameColumn(column.id, value.trim());
  };
  return (
    <header className="col-head">
      {editing ? (
        <input
          className="col-edit"
          autoFocus
          defaultValue={column.name}
          onBlur={(e) => save(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.target.blur();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <h3>{column.name}</h3>
      )}
      <span className="count">{count}</span>
      {canAdmin && !editing && (
        <span className="col-tools">
          <button title="Rename column" aria-label={`Rename column ${column.name}`} onClick={() => setEditing(true)}>
            ✎
          </button>
          <button
            title="Delete column"
            aria-label={`Delete column ${column.name}`}
            onClick={() => window.confirm(`Delete column "${column.name}" and its ${count} task(s)?`) && actions.deleteColumn(column.id)}
          >
            ×
          </button>
        </span>
      )}
    </header>
  );
}

function AddColumn({ onAdd }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button className="add-column" onClick={() => setOpen(true)}>
        + Add column
      </button>
    );
  return (
    <form
      className="add-column-form"
      onSubmit={(e) => {
        e.preventDefault();
        const v = e.target.elements.name.value.trim();
        if (v) onAdd(v);
        setOpen(false);
      }}
    >
      <input name="name" autoFocus placeholder="Column name" onBlur={() => setOpen(false)} />
    </form>
  );
}

export default function Board({ columns, tasks, members, canAdmin, openId, onOpen, actions }) {
  const [dragId, setDragId] = useState(null);
  const [drop, setDrop] = useState(null); // { columnId, beforeId|null }
  const people = useMemo(() => Object.fromEntries(members.map((m) => [m.userId, { id: m.userId, name: m.name, color: m.color }])), [members]);
  const grouped = useMemo(() => {
    const g = Object.fromEntries(columns.map((c) => [c.id, []]));
    for (const t of tasks) (g[t.columnId] ||= []).push(t);
    Object.values(g).forEach((list) => list.sort((a, b) => a.position - b.position));
    return g;
  }, [columns, tasks]);

  const endDrag = () => {
    setDragId(null);
    setDrop(null);
  };

  // Work out where the pointer is relative to the cards in this column -> "insert before card X" (or at the end).
  function onDragOver(e, columnId) {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    let beforeId = null;
    for (const el of e.currentTarget.querySelectorAll('[data-task-id]')) {
      if (el.dataset.taskId === dragId) continue;
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        beforeId = el.dataset.taskId;
        break;
      }
    }
    setDrop((d) => (d && d.columnId === columnId && d.beforeId === beforeId ? d : { columnId, beforeId }));
  }

  function onDrop(e, columnId) {
    e.preventDefault();
    if (dragId) actions.moveTask(dragId, columnId, drop?.columnId === columnId ? drop.beforeId : null);
    endDrag();
  }

  return (
    <div className="board">
      {columns.map((col) => {
        const list = grouped[col.id] || [];
        const overHere = drop?.columnId === col.id;
        return (
          <section
            key={col.id}
            className={`column ${overHere ? 'is-over' : ''}`}
            onDragOver={(e) => onDragOver(e, col.id)}
            onDrop={(e) => onDrop(e, col.id)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setDrop((d) => (d?.columnId === col.id ? null : d));
            }}
          >
            <ColumnHead column={col} count={list.length} canAdmin={canAdmin} actions={actions} />
            <div className="cards">
              {list.map((t) => {
                const overdue = t.dueDate && new Date(t.dueDate) < startOfToday();
                return (
                  <div key={t.id}>
                    {overHere && drop.beforeId === t.id && <div className="drop-line" />}
                    <article
                      className={`note p-${t.priority} ${openId === t.id ? 'is-open' : ''} ${dragId === t.id ? 'is-dragging' : ''} ${t.pending ? 'is-pending' : ''}`}
                      data-task-id={t.id}
                      draggable={!t.pending}
                      tabIndex={0}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', t.id);
                        setDragId(t.id);
                      }}
                      onDragEnd={endDrag}
                      onClick={() => !t.pending && onOpen(t.id)}
                      onKeyDown={(e) => e.key === 'Enter' && !t.pending && onOpen(t.id)}
                    >
                      <p className="note-title">{t.title}</p>
                      <footer>
                        <span className={`prio-dot ${t.priority}`} title={`${t.priority} priority`}>
                          {t.priority}
                        </span>
                        {t.dueDate && <span className={`due ${overdue ? 'late' : ''}`}>{new Date(t.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>}
                        <span className="spacer" />
                        <Avatar user={people[t.assigneeId]} size={22} />
                      </footer>
                    </article>
                  </div>
                );
              })}
              {overHere && drop.beforeId === null && <div className="drop-line" />}
              {!list.length && !overHere && <p className="col-empty">Drop a task here</p>}
            </div>
            <AddCard onAdd={(title) => actions.createTask(col.id, title)} />
          </section>
        );
      })}
      {canAdmin && <AddColumn onAdd={actions.createColumn} />}
    </div>
  );
}
