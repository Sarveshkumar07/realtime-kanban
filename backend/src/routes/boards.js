import { Router } from 'express';
import { Board, Column, Task } from '../models/index.js';
import { bad, notFound, wrap } from '../lib/http.js';
import { need } from '../middleware/tenant.js';
import { computePosition } from '../lib/ordering.js';
import { record } from '../lib/activity.js';
import { createBoardWithColumns, deleteBoardData } from '../lib/provision.js';
import { emitToTenant } from '../realtime.js';

const r = Router();
const nameOf = (req) => {
  const n = req.body.name?.trim();
  if (!n) throw bad('Name is required');
  return n;
};
// Every lookup carries tenantId, so an id from another tenant simply "does not exist".
const findBoard = (req) => Board.findOne({ _id: req.params.boardId, tenantId: req.tenant._id });
const findColumn = (req) => Column.findOne({ _id: req.params.columnId, tenantId: req.tenant._id });

/* ---------- boards ---------- */
r.get('/boards', wrap(async (req, res) => res.json(await Board.find({ tenantId: req.tenant._id }).sort({ createdAt: 1 }))));

r.post('/boards', need('tenant_admin'), wrap(async (req, res) => {
  const { board, columns } = await createBoardWithColumns(req.tenant, nameOf(req), req.user._id);
  await record(req, 'board:created', { board }, { action: 'board.created', entityType: 'board', entityId: board._id, summary: `created board "${board.name}"` });
  res.status(201).json({ board, columns });
}));

// Full snapshot used on load and after reconnecting (network recovery).
r.get('/boards/:boardId', wrap(async (req, res) => {
  const board = await findBoard(req);
  if (!board) throw notFound('Board not found');
  const scope = { tenantId: req.tenant._id, boardId: board._id };
  const [columns, tasks] = await Promise.all([Column.find(scope).sort({ position: 1 }), Task.find({ ...scope, deletedAt: null }).sort({ position: 1 })]);
  res.json({ board, columns, tasks });
}));

r.patch('/boards/:boardId', need('tenant_admin'), wrap(async (req, res) => {
  const board = await Board.findOneAndUpdate({ _id: req.params.boardId, tenantId: req.tenant._id }, { name: nameOf(req) }, { new: true });
  if (!board) throw notFound('Board not found');
  await record(req, 'board:updated', { board }, { action: 'board.updated', entityType: 'board', entityId: board._id, summary: `renamed board to "${board.name}"` });
  res.json(board);
}));

r.delete('/boards/:boardId', need('tenant_admin'), wrap(async (req, res) => {
  const board = await findBoard(req);
  if (!board) throw notFound('Board not found');
  await deleteBoardData(req.tenant._id, board._id);
  await record(req, 'board:deleted', { id: String(board._id) }, { action: 'board.deleted', entityType: 'board', entityId: board._id, summary: `deleted board "${board.name}"` });
  res.status(204).end();
}));

/* ---------- columns ---------- */
r.post('/boards/:boardId/columns', need('tenant_admin'), wrap(async (req, res) => {
  const board = await findBoard(req);
  if (!board) throw notFound('Board not found');
  const { position } = await computePosition(Column, { tenantId: req.tenant._id, boardId: board._id }, { afterId: req.body.afterId });
  const column = await Column.create({ tenantId: req.tenant._id, boardId: board._id, name: nameOf(req), position });
  await record(req, 'column:created', { column }, { action: 'column.created', entityType: 'column', entityId: column._id, summary: `added column "${column.name}"` });
  res.status(201).json(column);
}));

r.patch('/columns/:columnId', need('tenant_admin'), wrap(async (req, res) => {
  const column = await Column.findOneAndUpdate({ _id: req.params.columnId, tenantId: req.tenant._id }, { name: nameOf(req) }, { new: true });
  if (!column) throw notFound('Column not found');
  await record(req, 'column:updated', { column }, { action: 'column.updated', entityType: 'column', entityId: column._id, summary: `renamed column to "${column.name}"` });
  res.json(column);
}));

r.post('/columns/:columnId/move', need('tenant_admin'), wrap(async (req, res) => {
  const column = await findColumn(req);
  if (!column) throw notFound('Column not found');
  const scope = { tenantId: req.tenant._id, boardId: column.boardId };
  const { position, rebalanced } = await computePosition(Column, scope, { afterId: req.body.afterId, beforeId: req.body.beforeId, excludeId: column._id });
  column.position = position;
  await column.save();
  await record(req, 'column:moved', { column }, { action: 'column.moved', entityType: 'column', entityId: column._id, summary: `moved column "${column.name}"` });
  if (rebalanced) emitToTenant(req.tenant._id, 'board:resync', { boardId: String(column.boardId) });
  res.json(column);
}));

r.delete('/columns/:columnId', need('tenant_admin'), wrap(async (req, res) => {
  const column = await findColumn(req);
  if (!column) throw notFound('Column not found');
  await Task.deleteMany({ tenantId: req.tenant._id, columnId: column._id });
  await Column.deleteOne({ _id: column._id });
  await record(req, 'column:deleted', { id: String(column._id), boardId: String(column.boardId) }, { action: 'column.deleted', entityType: 'column', entityId: column._id, summary: `deleted column "${column.name}"` });
  res.status(204).end();
}));

export default r;
