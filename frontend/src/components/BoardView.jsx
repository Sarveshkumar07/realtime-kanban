import { useEffect, useState } from 'react';
import { api, RANK } from '../api';
import { useBoard } from '../hooks/useBoard';
import Avatar from './Avatar.jsx';
import Board from './Board.jsx';
import TaskPanel from './TaskPanel.jsx';
import ActivityPanel from './ActivityPanel.jsx';

export default function BoardView({ tenant, user, toast, onAccessLost }) {
  const b = useBoard({ tenantId: tenant.id, toast, onAccessLost });
  const [members, setMembers] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [showActivity, setShowActivity] = useState(false);
  const [newBoard, setNewBoard] = useState(null); // null = closed, string = typing
  const canAdmin = RANK[tenant.role] >= 2;
  const openTask = b.tasks.find((t) => t.id === openId);

  useEffect(() => {
    api.get(`/tenants/${tenant.id}/members`).then(setMembers).catch(() => {});
  }, [tenant.id]);

  // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z = redo (ignored while typing in a field)
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      e.preventDefault();
      e.shiftKey ? b.redo() : b.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const others = b.presence.filter((p) => p.id !== user.id);

  return (
    <main className="view">
      {!b.online && <div className="banner">You are offline. Changes won’t save until the connection is back; the board refreshes itself when it returns.</div>}

      <div className="toolbar">
        <div className="board-tabs" role="tablist" aria-label="Boards">
          {b.boards.map((bd) => (
            <span key={bd.id} className={`board-tab ${bd.id === b.boardId ? 'active' : ''}`}>
              <button role="tab" aria-selected={bd.id === b.boardId} onClick={() => b.setBoardId(bd.id)}>
                {bd.name}
              </button>
              {canAdmin && bd.id === b.boardId && (
                <button className="x" title="Delete board" aria-label={`Delete board ${bd.name}`} onClick={() => window.confirm(`Delete board "${bd.name}" and all its tasks?`) && b.deleteBoard(bd.id)}>
                  ×
                </button>
              )}
            </span>
          ))}
          {canAdmin &&
            (newBoard === null ? (
              <button className="board-add" onClick={() => setNewBoard('')}>
                + Board
              </button>
            ) : (
              <form
                className="board-add-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newBoard.trim()) b.createBoard(newBoard.trim());
                  setNewBoard(null);
                }}
              >
                <input autoFocus value={newBoard} onChange={(e) => setNewBoard(e.target.value)} onBlur={() => setNewBoard(null)} placeholder="Board name" />
              </form>
            ))}
        </div>

        <span className="spacer" />
        <div className="presence" aria-label="People online in this branch">
          <span className="muted small">{b.presence.length} online</span>
          <div className="faces">
            <Avatar user={user} />
            {others.map((p) => (
              <Avatar key={p.id} user={p} />
            ))}
          </div>
        </div>
        <button className="btn ghost" disabled={!b.canUndo} onClick={b.undo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button className="btn ghost" disabled={!b.canRedo} onClick={b.redo} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
        <button className={`btn ghost ${showActivity ? 'on' : ''}`} onClick={() => setShowActivity((s) => !s)}>
          Activity
        </button>
      </div>

      <div className="stage">
        {b.loading ? (
          <p className="muted pad">Loading board…</p>
        ) : b.boardId ? (
          <Board
            columns={b.columns}
            tasks={b.tasks}
            members={members}
            canAdmin={canAdmin}
            openId={openId}
            onOpen={setOpenId}
            actions={b}
          />
        ) : (
          <div className="empty">
            <h2>No boards in {tenant.name} yet</h2>
            <p className="muted">{canAdmin ? 'Use “+ Board” above to create the first one.' : 'Ask a branch admin to create a board.'}</p>
          </div>
        )}
        {showActivity && <ActivityPanel items={b.activity} onClose={() => setShowActivity(false)} />}
        {openTask && <TaskPanel task={openTask} columns={b.columns} members={members} actions={b} onClose={() => setOpenId(null)} />}
      </div>
    </main>
  );
}
