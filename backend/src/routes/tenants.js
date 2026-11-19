import { Router } from 'express';
import { Membership, User, ActivityLog } from '../models/index.js';
import { HttpError, bad, wrap } from '../lib/http.js';
import { getAccess } from '../lib/access.js';
import { need } from '../middleware/tenant.js';
import { deleteTenantData } from '../lib/provision.js';
import { emitToTenant, kickUser } from '../realtime.js';

const r = Router();

r.patch('/', need('tenant_admin'), wrap(async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) throw bad('Name is required');
  req.tenant.name = name;
  await req.tenant.save();
  res.json(req.tenant);
}));

r.delete('/', need('org_admin'), wrap(async (req, res) => {
  emitToTenant(req.tenant._id, 'access:revoked', { tenantId: String(req.tenant._id) });
  await deleteTenantData(req.tenant._id);
  res.status(204).end();
}));

// People who can work in this tenant: branch members + organization admins.
r.get('/members', wrap(async (req, res) => {
  const ms = await Membership.find({ orgId: req.orgId, $or: [{ tenantId: null }, { tenantId: req.tenant._id }] }).populate('userId', 'name email color');
  res.json(
    ms.filter((m) => m.userId).map((m) => ({
      userId: String(m.userId._id),
      name: m.userId.name,
      email: m.userId.email,
      color: m.userId.color,
      role: m.role,
      scope: m.tenantId ? 'branch' : 'organization',
    }))
  );
}));

r.post('/members', need('tenant_admin'), wrap(async (req, res) => {
  const { email, role = 'member' } = req.body;
  if (!['member', 'tenant_admin'].includes(role)) throw bad('Role must be member or tenant_admin');
  const user = await User.findOne({ email: String(email || '').toLowerCase().trim() });
  if (!user) throw new HttpError(404, 'No registered user with that email. Ask them to sign up first.');
  await Membership.findOneAndUpdate({ userId: user._id, orgId: req.orgId, tenantId: req.tenant._id }, { role }, { upsert: true });
  res.status(201).json({ ok: true });
}));

r.delete('/members/:userId', need('tenant_admin'), wrap(async (req, res) => {
  await Membership.deleteOne({ userId: req.params.userId, orgId: req.orgId, tenantId: req.tenant._id });
  if (!(await getAccess(req.params.userId, req.tenant._id))) kickUser(req.tenant._id, req.params.userId);
  res.status(204).end();
}));

r.get('/activity', wrap(async (req, res) => {
  res.json(await ActivityLog.find({ tenantId: req.tenant._id }).sort({ createdAt: -1 }).limit(100));
}));

export default r;
