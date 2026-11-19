import { Tenant, Board, Column, Task, ActivityLog, Membership } from '../models/index.js';
import { GAP } from './ordering.js';

export const DEFAULT_COLUMNS = ['To Do', 'In Progress', 'Done'];

export async function createBoardWithColumns(tenant, name, userId) {
  const board = await Board.create({ tenantId: tenant._id, orgId: tenant.orgId, name, createdBy: userId });
  const columns = await Column.insertMany(DEFAULT_COLUMNS.map((n, i) => ({ tenantId: tenant._id, boardId: board._id, name: n, position: (i + 1) * GAP })));
  return { board, columns };
}

export async function createTenantWithBoard(orgId, name, userId) {
  const tenant = await Tenant.create({ orgId, name });
  const { board, columns } = await createBoardWithColumns(tenant, 'Team Board', userId);
  return { tenant, board, columns };
}

export async function deleteBoardData(tenantId, boardId) {
  await Task.deleteMany({ tenantId, boardId });
  await Column.deleteMany({ tenantId, boardId });
  await Board.deleteOne({ _id: boardId, tenantId });
}

export async function deleteTenantData(tenantId) {
  await Promise.all([Task, Column, Board, ActivityLog, Membership].map((M) => M.deleteMany({ tenantId })));
  await Tenant.deleteOne({ _id: tenantId });
}
