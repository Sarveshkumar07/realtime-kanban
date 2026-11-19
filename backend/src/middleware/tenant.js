import { getAccess, RANK } from '../lib/access.js';
import { HttpError, notFound, wrap } from '../lib/http.js';

// Mounted on /api/tenants/:tenantId. Every route below it is therefore tenant-scoped by construction:
// the tenant comes from a verified membership, never from the request body.
export const tenantScope = wrap(async (req, _res, next) => {
  const access = await getAccess(req.user._id, req.params.tenantId);
  if (!access) throw notFound('Tenant not found'); // 404 (not 403) so tenant ids can't be probed
  req.tenant = access.tenant;
  req.orgId = access.orgId;
  req.role = access.role;
  next();
});

export const need = (min) => (req, _res, next) => (RANK[req.role] >= RANK[min] ? next() : next(new HttpError(403, `This needs the ${min.replace('_', ' ')} role`)));
