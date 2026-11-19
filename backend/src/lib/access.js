import { Tenant, Membership } from '../models/index.js';

export const RANK = { member: 1, tenant_admin: 2, org_admin: 3 };

// The single source of truth for "can this user touch this tenant, and as what?".
// An org-level membership (tenantId null) grants access to every tenant of that org,
// a tenant-level membership only to that tenant. Anything else -> null (treated as 404).
export async function getAccess(userId, tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) return null;
  const ms = await Membership.find({
    userId,
    orgId: tenant.orgId,
    $or: [{ tenantId: null }, { tenantId: tenant._id }],
  });
  if (!ms.length) return null;
  const role = ms.map((m) => m.role).sort((a, b) => RANK[b] - RANK[a])[0];
  return { tenant, orgId: tenant.orgId, role };
}
