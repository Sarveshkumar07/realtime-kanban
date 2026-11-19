import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { connectSocket } from '../socket';

const GAP = 1024;
const byPos = (a, b) => a.position - b.position;

// Same neighbour-based rule as the server (backend/src/lib/ordering.js), used for instant optimistic placement.
export function placeBetween(list, { afterId, beforeId } = {}) {
  let prev = null;
  let next = null;
  if (afterId) {
    const i = list.findIndex((t) => t.id === afterId);
    if (i >= 0) {
      prev = list[i];
      next = list[i + 1] || null;
    }
  }
  if (!prev && beforeId) {
    const i = list.findIndex((t) => t.id === beforeId);
    if (i >= 0) {
      next = list[i];
      prev = list[i - 1] || null;
    }
  }
  if (!prev && !next) prev = list[list.length - 1] || null;
  if (prev && next) return (prev.position + next.position) / 2;
  if (prev) return prev.position + GAP;
  if (next) return next.position - GAP;
  return GAP;
}

/**
 * All board state + actions for ONE tenant (BoardView is re-mounted with key=tenant.id, so nothing leaks between tenants).
 * - Optimistic UI: local state changes first, the server confirms or we roll back.
 * - Real-time: Socket.IO room per tenant; incoming events are merged idempotently (higher version wins).
 * - Network recovery: on reconnect we re-join the room and re-fetch the board.
 * - Undo/redo: a stack of {undo, redo} commands that call the same API (soft delete + restore make this possible).
 */
export function useBoard({ tenantId, toast, onAccessLost }) {
  const root = `/tenants/${tenantId}`;
  const [boards, setBoards] = useState([]);
  const [boardId, setBoardId] = useState(null);
  const [columns, setColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [presence, setPresence] = useState([]);
  const [activity, setActivity] = useState([]);
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);
  const tick = () => setTick((n) => n + 1);

  const live = useRef({});
  live.current = { boardId, tasks, columns };
  const lost = useRef(onAccessLost);
  lost.current = onAccessLost;
  const history = useRef({ undo: [], redo: [] });

  const fail = useCallback((e) => toast(e instanceof ApiError ? e.message : 'Something went wrong', 'error'), [toast]);

  /* ---------- state merge helpers ---------- */
  const upsertTask = useCallback(
    (task) =>
      setTasks((prev) => {
        const i = prev.findIndex((t) => t.id === task.id);
        if (i < 0) return [...prev, task];
        if (prev[i].version > task.version) return prev; // stale event, ignore
        const next = prev.slice();
        next[i] = task;
        return next;
      }),
    []
  );
  const forceTask = useCallback((task) => setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev.map((t) => (t.id === task.id ? task : t)) : [...prev, task])), []);
  const upsertColumn = useCallback((col) => setColumns((prev) => [...prev.filter((c) => c.id !== col.id), col].sort(byPos)), []);

  /* ---------- loading ---------- */
  const loadBoards = useCallback(async () => {
    const list = await api.get(`${root}/boards`);
    setBoards(list);
    setBoardId((cur) => (list.some((b) => b.id === cur) ? cur : list[0]?.id ?? null));
  }, [root]);

  const loadSnapshot = useCallback(
    async (id) => {
      if (!id) {
        setColumns([]);
        setTasks([]);
        return;
      }
      const snap = await api.get(`${root}/boards/${id}`);
      if (live.current.boardId !== id) return;
      setColumns(snap.columns);
      setTasks(snap.tasks);
    },
    [root]
  );

  const loadActivity = useCallback(async () => setActivity(await api.get(`${root}/activity`)), [root]);

  useEffect(() => {
    let alive = true;
    Promise.all([loadBoards(), loadActivity()])
      .catch(fail)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [loadBoards, loadActivity, fail]);

  useEffect(() => {
    loadSnapshot(boardId).catch(fail);
  }, [boardId, loadSnapshot, fail]);

  useEffect(() => {
    if (!boardId && boards.length) setBoardId(boards[0].id);
  }, [boards, boardId]);

  /* ---------- real-time ---------- */
  useEffect(() => {
    const socket = connectSocket();
    let dropped = false;
    const inBoard = (id) => id === live.current.boardId;
    const join = () =>
      socket.emit('tenant:join', tenantId, (res) => {
        if (!res?.ok) lost.current?.();
        else setPresence(res.users);
      });
    const resync = () => {
      loadBoards().catch(() => {});
      loadSnapshot(live.current.boardId).catch(() => {});
      loadActivity().catch(() => {});
    };
    const onConnect = () => {
      setOnline(true);
      join();
      if (dropped) {
        dropped = false;
        resync(); // network recovery: catch up on everything missed while offline
      }
    };
    const onDrop = () => {
      dropped = true;
      setOnline(false);
    };
    const taskEvent = ({ task }) => inBoard(task.boardId) && upsertTask(task);
    const colEvent = ({ column }) => inBoard(column.boardId) && upsertColumn(column);
    const handlers = {
      'task:created': taskEvent,
      'task:updated': taskEvent,
      'task:moved': taskEvent,
      'task:restored': taskEvent,
      'task:deleted': ({ id }) => setTasks((p) => p.filter((t) => t.id !== id)),
      'column:created': colEvent,
      'column:updated': colEvent,
      'column:moved': colEvent,
      'column:deleted': ({ id }) => {
        setColumns((p) => p.filter((c) => c.id !== id));
        setTasks((p) => p.filter((t) => t.columnId !== id));
      },
      'board:created': ({ board }) => setBoards((p) => (p.some((b) => b.id === board.id) ? p : [...p, board])),
      'board:updated': ({ board }) => setBoards((p) => p.map((b) => (b.id === board.id ? board : b))),
      'board:deleted': ({ id }) => {
        setBoards((p) => p.filter((b) => b.id !== id));
        setBoardId((cur) => (cur === id ? null : cur));
      },
      'board:resync': ({ boardId: id }) => inBoard(id) && loadSnapshot(id).catch(() => {}),
      presence: ({ tenantId: t, users }) => t === tenantId && setPresence(users),
      activity: (log) => setActivity((p) => [log, ...p].slice(0, 100)),
      'access:revoked': ({ tenantId: t }) => t === tenantId && lost.current?.(),
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDrop);
    socket.on('connect_error', onDrop);
    Object.entries(handlers).forEach(([ev, fn]) => socket.on(ev, fn));
    if (socket.connected) join();
    return () => {
      socket.emit('tenant:leave');
      socket.off('connect', onConnect);
      socket.off('disconnect', onDrop);
      socket.off('connect_error', onDrop);
      Object.entries(handlers).forEach(([ev, fn]) => socket.off(ev, fn));
    };
  }, [tenantId, loadBoards, loadSnapshot, loadActivity, upsertTask, upsertColumn]);

  /* ---------- history (undo / redo) ---------- */
  const pushHistory = (entry) => {
    history.current.undo.push(entry);
    if (history.current.undo.length > 50) history.current.undo.shift();
    history.current.redo = [];
    tick();
  };
  const undo = async () => {
    const e = history.current.undo.pop();
    if (!e) return;
    tick();
    if (await e.undo()) history.current.redo.push(e);
    tick();
  };
  const redo = async () => {
    const e = history.current.redo.pop();
    if (!e) return;
    tick();
    if (await e.redo()) history.current.undo.push(e);
    tick();
  };

  /* ---------- task commands (each returns true on success) ---------- */
  const doUpdate = async (id, changes, baseValues) => {
    const cur = live.current.tasks.find((t) => t.id === id);
    if (!cur) return false;
    const base = baseValues || Object.fromEntries(Object.keys(changes).map((k) => [k, cur[k] ?? null]));
    forceTask({ ...cur, ...changes }); // optimistic
    try {
      upsertTask(await api.patch(`${root}/tasks/${id}`, { changes, base }));
      return true;
    } catch (e) {
      if (e.status === 409 && e.body.current) {
        forceTask(e.body.current); // conflict resolution: server copy wins, tell the user why
        toast(`Someone else just changed this task (${(e.body.fields || []).join(', ')}). Your edit was not applied.`, 'error');
      } else {
        forceTask(cur); // roll back
        fail(e);
      }
      return false;
    }
  };

  const doMove = async (id, columnId, pos) => {
    const cur = live.current.tasks.find((t) => t.id === id);
    if (!cur) return false;
    const target = live.current.tasks.filter((t) => t.columnId === columnId && t.id !== id).sort(byPos);
    forceTask({ ...cur, columnId, position: placeBetween(target, pos) }); // optimistic
    try {
      upsertTask(await api.post(`${root}/tasks/${id}/move`, { columnId, ...pos }));
      return true;
    } catch (e) {
      forceTask(cur);
      fail(e);
      if (e.status === 404) loadSnapshot(live.current.boardId).catch(() => {});
      return false;
    }
  };

  const doDelete = async (id) => {
    const cur = live.current.tasks.find((t) => t.id === id);
    setTasks((p) => p.filter((t) => t.id !== id)); // optimistic
    try {
      await api.del(`${root}/tasks/${id}`);
      return true;
    } catch (e) {
      if (e.status === 404) return true; // someone else already deleted it
      if (cur) forceTask(cur);
      fail(e);
      return false;
    }
  };

  const doRestore = async (id) => {
    try {
      upsertTask(await api.post(`${root}/tasks/${id}/restore`));
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };

  /* ---------- public actions ---------- */
  const createTask = async (columnId, title) => {
    const { boardId: bid, tasks: all } = live.current;
    const list = all.filter((t) => t.columnId === columnId).sort(byPos);
    const tempId = `tmp-${Math.random().toString(36).slice(2)}`;
    setTasks((p) => [...p, { id: tempId, boardId: bid, columnId, title, description: '', priority: 'medium', assigneeId: null, dueDate: null, position: placeBetween(list), version: 0, pending: true }]);
    try {
      const task = await api.post(`${root}/boards/${bid}/tasks`, { columnId, title });
      setTasks((p) => p.filter((t) => t.id !== tempId));
      upsertTask(task);
      pushHistory({ undo: () => doDelete(task.id), redo: () => doRestore(task.id) });
    } catch (e) {
      setTasks((p) => p.filter((t) => t.id !== tempId));
      fail(e);
    }
  };

  const updateTask = async (id, changes) => {
    const cur = live.current.tasks.find((t) => t.id === id);
    if (!cur) return;
    const prev = Object.fromEntries(Object.keys(changes).map((k) => [k, cur[k] ?? null]));
    if (await doUpdate(id, changes)) pushHistory({ undo: () => doUpdate(id, prev, changes), redo: () => doUpdate(id, changes, prev) });
  };

  const moveTask = async (id, columnId, beforeId = null) => {
    const cur = live.current.tasks.find((t) => t.id === id);
    if (!cur) return;
    const oldCol = cur.columnId;
    const oldList = live.current.tasks.filter((t) => t.columnId === oldCol).sort(byPos);
    const idx = oldList.findIndex((t) => t.id === id);
    const above = oldList[idx - 1]?.id || null;
    const below = oldList[idx + 1]?.id || null;
    if (oldCol === columnId) {
      const rest = oldList.filter((t) => t.id !== id);
      const target = beforeId ? rest.findIndex((t) => t.id === beforeId) : rest.length;
      if (target === idx) return; // dropped where it already is
    }
    if (await doMove(id, columnId, { beforeId })) {
      pushHistory({ undo: () => doMove(id, oldCol, { afterId: above, beforeId: below }), redo: () => doMove(id, columnId, { beforeId }) });
    }
  };

  const deleteTask = async (id) => {
    if (await doDelete(id)) pushHistory({ undo: () => doRestore(id), redo: () => doDelete(id) });
  };

  /* ---------- board / column admin actions ---------- */
  const guard = async (fn) => {
    try {
      await fn();
    } catch (e) {
      fail(e);
    }
  };
  const createBoard = (name) =>
    guard(async () => {
      const { board } = await api.post(`${root}/boards`, { name });
      setBoards((p) => (p.some((b) => b.id === board.id) ? p : [...p, board]));
      setBoardId(board.id);
    });
  const deleteBoard = (id) =>
    guard(async () => {
      await api.del(`${root}/boards/${id}`);
      setBoards((p) => p.filter((b) => b.id !== id));
      setBoardId((cur) => (cur === id ? null : cur));
    });
  const createColumn = (name) => guard(async () => upsertColumn(await api.post(`${root}/boards/${live.current.boardId}/columns`, { name })));
  const renameColumn = (id, name) => guard(async () => upsertColumn(await api.patch(`${root}/columns/${id}`, { name })));
  const deleteColumn = (id) =>
    guard(async () => {
      await api.del(`${root}/columns/${id}`);
      setColumns((p) => p.filter((c) => c.id !== id));
      setTasks((p) => p.filter((t) => t.columnId !== id));
    });

  return {
    boards, boardId, setBoardId, columns, tasks, presence, activity, online, loading,
    canUndo: history.current.undo.length > 0,
    canRedo: history.current.redo.length > 0,
    undo, redo,
    createTask, updateTask, moveTask, deleteTask,
    createBoard, deleteBoard, createColumn, renameColumn, deleteColumn,
  };
}
