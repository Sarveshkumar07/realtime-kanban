import { ActivityLog } from '../models/index.js';
import { emitToTenant } from '../realtime.js';

// One call = broadcast the domain event to the tenant room + persist/broadcast an activity log entry.
export async function record(req, event, payload, { action, entityType, entityId, summary }) {
  const tenantId = req.tenant._id;
  if (event) emitToTenant(tenantId, event, { ...payload, actorId: String(req.user._id) });
  const log = await ActivityLog.create({
    tenantId,
    orgId: req.orgId,
    userId: req.user._id,
    userName: req.user.name,
    action,
    entityType,
    entityId: String(entityId),
    summary,
  });
  emitToTenant(tenantId, 'activity', log);
}
