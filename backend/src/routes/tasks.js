import { Router } from 'express';
import { Task, Column } from '../models/index.js';
import { HttpError, bad, notFound, wrap } from '../lib/http.js';
import { computePosition } from '../lib/ordering.js';
import { record } from '../lib/activity.js';
import { getAccess } from '../lib/access.js';
import { emitToTenant } from '../realtime.js';

const r = Router();
const PRIORITIES = ['low', 'medium', 'high'];
const EDITABLE = ['title', 'description', 'priority', 'assigneeId', 'dueDate'];

const findTask = (req) => Task.findOne({ _id: req.params.taskId, tenantId: req.tenant._id, deletedAt: null });

function clean(field, v) {
  switch (field) {
    case 'title': {
      const t = String(v ?? '').trim();
      if (!t) throw bad('Title is required');
      if (t.length > 200) throw bad('Title is too long (200 characters max)');
      return t;
    }
    case 'description':
      return String(v ?? '').slice(0, 5000);
    case 'priority':
      if (!PRIORITIES.includes(v)) throw bad('Priority must be low, medium or high');
      return v;
    case 'assigneeId':
      return v || null;
    case 'dueDate': {
      if (!v) return null;
      const d = new Date(v);
      if (isNaN(d)) throw bad('Invalid due date');
      return d;
    }
    default:
      throw bad(`Unknown field ${field}`);
  }
}
// Normalised form used only to compare "what the client saw" with "what is stored now".
const comparable = (f, v) => (f === 'dueDate' ? (v ? new Date(v).toISOString().slice(0, 10) : '') : f === 'assigneeId' ? (v ? String(v) : '') : String(v ?? ''));

async function assertAssignee(req, assigneeId) {
  if (assigneeId && !(await getAccess(assigneeId, req.tenant._id))) throw bad('Assignee does not belong to this tenant');
}

/* ---------- create ---------- */
r.post('/boards/:boardId/tasks', wrap(async (req, res) => {
  const { columnId, afterId, beforeId } = req.body;
  if (!columnId) throw bad('columnId is required');
  const column = await Column.findOne({ _id: columnId, tenantId: req.tenant._id, boardId: req.params.boardId });
  if (!column) throw notFound('Column not found');

  const fields = { title: clean('title', req.body.title) };
  for (const f of ['description', 'priority', 'assigneeId', 'dueDate']) if (req.body[f] !== undefined) fields[f] = clean(f, req.body[f]);
  await assertAssignee(req, fields.assigneeId);

  const scope = { tenantId: req.tenant._id, columnId: column._id, deletedAt: null };
  const { position, rebalanced } = await computePosition(Task, scope, { afterId, beforeId });
  const task = await Task.create({ ...fields, tenantId: req.tenant._id, boardId: column.boardId, columnId: column._id, position, createdBy: req.user._id });
  await record(req, 'task:created', { task }, { action: 'task.created', entityType: 'task', entityId: task._id, summary: `created "${task.title}" in ${column.name}` });
  if (rebalanced) emitToTenant(req.tenant._id, 'board:resync', { boardId: String(column.boardId) });
  res.status(201).json(task);
}));

/* ---------- update: field-level optimistic concurrency ----------
   Body: { changes: {field: newValue}, base: {field: valueTheEditorSawBefore} }
   - If someone else changed a field we are about to write (current != base) -> 409 + latest task.
   - If they changed OTHER fields, both edits are merged (no conflict).
   - The write itself is guarded by the current values, so two simultaneous requests can't both win. */
r.patch('/tasks/:taskId', wrap(async (req, res) => {
  const { changes = {}, base = {} } = req.body;
  const task = await findTask(req);
  if (!task) throw notFound('Task not found');

  const set = {};
  const conflicts = [];
  for (const f of EDITABLE) {
    if (!(f in changes)) continue;
    if (f in base && comparable(f, base[f]) !== comparable(f, task[f])) conflicts.push(f);
    else set[f] = clean(f, changes[f]);
  }
  if (conflicts.length) throw new HttpError(409, 'Someone else just changed this task', { code: 'CONFLICT', fields: conflicts, current: task });
  if (!Object.keys(set).length) return res.json(task);
  await assertAssignee(req, set.assigneeId);

  const guard = Object.fromEntries(Object.keys(set).map((f) => [f, task[f] ?? null]));
  const updated = await Task.findOneAndUpdate(
    { _id: task._id, tenantId: req.tenant._id, deletedAt: null, ...guard },
    { $set: set, $inc: { version: 1 } },
    { new: true }
  );
  if (!updated) {
    // lost a race between our read and write: report the latest state as a conflict
    const latest = await findTask(req);
    if (!latest) throw notFound('Task not found');
    throw new HttpError(409, 'Someone else just changed this task', { code: 'CONFLICT', fields: Object.keys(set), current: latest });
  }
  await record(req, 'task:updated', { task: updated }, { action: 'task.updated', entityType: 'task', entityId: updated._id, summary: `edited "${updated.title}" (${Object.keys(set).join(', ')})` });
  res.json(updated);
}));

/* ---------- move (drag & drop) ----------
   Body: { columnId, afterId?, beforeId? }  -> position computed server-side from neighbours. */
r.post('/tasks/:taskId/move', wrap(async (req, res) => {
  const { columnId, afterId, beforeId } = req.body;
  if (!columnId) throw bad('columnId is required');
  const task = await findTask(req);
  if (!task) throw notFound('Task not found');
  const column = await Column.findOne({ _id: columnId, tenantId: req.tenant._id, boardId: task.boardId });
  if (!column) throw notFound('Column not found');

  const fromColumnId = String(task.columnId);
  const scope = { tenantId: req.tenant._id, columnId: column._id, deletedAt: null };
  const { position, rebalanced } = await computePosition(Task, scope, { afterId, beforeId, excludeId: task._id });
  const updated = await Task.findOneAndUpdate(
    { _id: task._id, tenantId: req.tenant._id, deletedAt: null },
    { $set: { columnId: column._id, position }, $inc: { version: 1 } },
    { new: true }
  );
  if (!updated) throw notFound('Task was deleted');

  let summary = `reordered "${updated.title}" in ${column.name}`;
  if (fromColumnId !== String(column._id)) {
    const from = await Column.findById(fromColumnId);
    summary = `moved "${updated.title}" from ${from?.name ?? 'another column'} to ${column.name}`;
  }
  await record(req, 'task:moved', { task: updated, fromColumnId }, { action: 'task.moved', entityType: 'task', entityId: updated._id, summary });
  if (rebalanced) emitToTenant(req.tenant._id, 'board:resync', { boardId: String(updated.boardId) });
  res.json(updated);
}));

/* ---------- delete (soft) + restore: this is what makes undo/redo possible ---------- */
r.delete('/tasks/:taskId', wrap(async (req, res) => {
  const task = await Task.findOneAndUpdate(
    { _id: req.params.taskId, tenantId: req.tenant._id, deletedAt: null },
    { $set: { deletedAt: new Date() }, $inc: { version: 1 } },
    { new: true }
  );
  if (!task) throw notFound('Task not found');
  await record(req, 'task:deleted', { id: String(task._id), columnId: String(task.columnId), boardId: String(task.boardId) }, { action: 'task.deleted', entityType: 'task', entityId: task._id, summary: `deleted "${task.title}"` });
  res.status(204).end();
}));

r.post('/tasks/:taskId/restore', wrap(async (req, res) => {
  const found = await Task.findOne({ _id: req.params.taskId, tenantId: req.tenant._id, deletedAt: { $ne: null } });
  if (!found) throw notFound('Nothing to restore');
  if (!(await Column.exists({ _id: found.columnId, tenantId: req.tenant._id }))) throw new HttpError(409, 'Its column no longer exists');
  const task = await Task.findOneAndUpdate({ _id: found._id, tenantId: req.tenant._id }, { $set: { deletedAt: null }, $inc: { version: 1 } }, { new: true });
  await record(req, 'task:restored', { task }, { action: 'task.restored', entityType: 'task', entityId: task._id, summary: `restored "${task.title}"` });
  res.json(task);
}));

export default r;
