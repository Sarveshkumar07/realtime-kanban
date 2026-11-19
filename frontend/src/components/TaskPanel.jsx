import Avatar from './Avatar.jsx';

// Fields are uncontrolled and re-keyed by their saved value: when a teammate changes a field, it refreshes live here.
export default function TaskPanel({ task, columns, members, actions, onClose }) {
  const saved = (f) => (f === 'dueDate' ? (task.dueDate || '').slice(0, 10) : task[f] ?? '');
  const commit = (field, value) => {
    if (String(value) === String(saved(field))) return false;
    if (field === 'title' && !value.trim()) return false;
    actions.updateTask(task.id, { [field]: field === 'assigneeId' || field === 'dueDate' ? value || null : value });
    return true;
  };
  const assignee = members.find((m) => m.userId === task.assigneeId);

  return (
    <aside className="panel" aria-label="Task details">
      <header className="panel-head">
        <span className="muted small">Task · v{task.version}</span>
        <button className="btn ghost" onClick={onClose}>
          Close
        </button>
      </header>

      <input
        key={`t-${task.id}-${task.title}`}
        className="panel-title"
        defaultValue={task.title}
        maxLength={200}
        aria-label="Title"
        onBlur={(e) => commit('title', e.target.value) || (e.target.value = task.title)}
        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
      />

      <div className="grid2">
        <label>
          Column
          <select value={task.columnId} onChange={(e) => e.target.value !== task.columnId && actions.moveTask(task.id, e.target.value, null)}>
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select value={task.priority} onChange={(e) => commit('priority', e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          Assignee
          <select value={task.assigneeId || ''} onChange={(e) => commit('assigneeId', e.target.value)}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Due date
          <input type="date" key={`d-${task.id}-${saved('dueDate')}`} defaultValue={saved('dueDate')} onChange={(e) => commit('dueDate', e.target.value)} />
        </label>
      </div>
      {assignee && (
        <p className="muted small assignee-line">
          <Avatar user={{ name: assignee.name, color: assignee.color }} size={18} /> {assignee.name}
        </p>
      )}

      <label className="block">
        Description
        <textarea
          key={`desc-${task.id}-${task.description}`}
          rows={8}
          defaultValue={task.description}
          placeholder="Add details, links, acceptance criteria…"
          onBlur={(e) => commit('description', e.target.value)}
        />
      </label>

      <p className="muted small">Edits save when you leave a field. If a teammate changes the same field at the same moment, their version is kept and you’ll be told.</p>

      <button
        className="btn danger"
        onClick={() => {
          actions.deleteTask(task.id);
          onClose();
        }}
      >
        Delete task
      </button>
    </aside>
  );
}
