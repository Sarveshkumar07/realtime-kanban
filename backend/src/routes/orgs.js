import { Router } from 'express';
import { Organization, Tenant, Membership, User } from '../models/index.js';
import { HttpError, bad, notFound, wrap } from '../lib/http.js';
import { RANK } from '../lib/access.js';
import { createTenantWithBoard, deleteTenantData } from '../lib/provision.js';
import { emitToTenant } from '../realtime.js';

const r = Router();

const requireOrgAdmin = wrap(async (req, _res, next) => {
  const m = await Membership.findOne({ userId: req.user._id, orgId: req.params.orgId, tenantId: null, role: 'org_admin' });
  if (!m) throw notFound('Organization not found');
  next();
});

// Everything the signed-in user can see: orgs -> tenants (with the user's role in each).
async function workspaceFor(userId) {
  const ms = await Membership.find({ userId });
  const orgIds = [...new Set(ms.map((m) => String(m.orgId)))];
  const [orgs, tenants] = await Promise.all([Organization.find({ _id: { $in: orgIds } }).sort({ name: 1 }), Tenant.find({ orgId: { $in: orgIds } }).sort({ name: 1 })]);
  return orgs.map((org) => {
    const mine = ms.filter((m) => String(m.orgId) === String(org._id));
    const isAdmin = mine.some((m) => m.role === 'org_admin' && !m.tenantId);
    const role = mine.map((m) => m.role).sort((a, b) => RANK[b] - RANK[a])[0];
    const list = tenants
      .filter((t) => String(t.orgId) === String(org._id))
      .map((t) => {
        const m = mine.find((x) => String(x.tenantId) === String(t._id));
        if (isAdmin) return { ...t.toJSON(), role: 'org_admin' };
        return m ? { ...t.toJSON(), role: m.role } : null;
      })
      .filter(Boolean);
    return { ...org.toJSON(), role, tenants: list };
  });
}

r.get('/', wrap(async (req, res) => res.json(await workspaceFor(req.user._id))));

r.post('/', wrap(async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) throw bad('Organization name is required');
  const org = await Organization.create({ name, createdBy: req.user._id });
  await Membership.create({ userId: req.user._id, orgId: org._id, tenantId: null, role: 'org_admin' });
  await createTenantWithBoard(org._id, req.body.tenantName?.trim() || 'Main Branch', req.user._id);
  res.status(201).json((await workspaceFor(req.user._id)).find((o) => o.id === String(org._id)));
}));

r.patch('/:orgId', requireOrgAdmin, wrap(async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) throw bad('Name is required');
  res.json(await Organization.findByIdAndUpdate(req.params.orgId, { name }, { new: true }));
}));

r.delete('/:orgId', requireOrgAdmin, wrap(async (req, res) => {
  const tenants = await Tenant.find({ orgId: req.params.orgId });
  for (const t of tenants) {
    emitToTenant(t._id, 'access:revoked', { tenantId: String(t._id) });
    await deleteTenantData(t._id);
  }
  await Membership.deleteMany({ orgId: req.params.orgId });
  await Organization.deleteOne({ _id: req.params.orgId });
  res.status(204).end();
}));

r.post('/:orgId/tenants', requireOrgAdmin, wrap(async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) throw bad('Branch name is required');
  const { tenant } = await createTenantWithBoard(req.params.orgId, name, req.user._id);
  res.status(201).json(tenant);
}));

r.post('/:orgId/admins', requireOrgAdmin, wrap(async (req, res) => {
  const user = await User.findOne({ email: String(req.body.email || '').toLowerCase().trim() });
  if (!user) throw new HttpError(404, 'No registered user with that email');
  await Membership.findOneAndUpdate({ userId: user._id, orgId: req.params.orgId, tenantId: null }, { role: 'org_admin' }, { upsert: true });
  res.status(201).json({ ok: true });
}));

export default r;
