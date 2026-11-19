import mongoose from 'mongoose';
const { Schema, model } = mongoose;

// Every document is serialised with `id` instead of `_id`, and never leaks the password hash.
mongoose.plugin((schema) => {
  schema.set('toJSON', {
    transform: (_doc, ret) => {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.__v;
      delete ret.passwordHash;
      return ret;
    },
  });
});

export const ROLES = ['org_admin', 'tenant_admin', 'member'];
const ref = (to, extra = {}) => ({ type: Schema.Types.ObjectId, ref: to, ...extra });
const name = { type: String, required: true, trim: true, maxlength: 120 };

export const Organization = model('Organization', new Schema({ name, createdBy: ref('User') }, { timestamps: true }));

export const Tenant = model('Tenant', new Schema({ orgId: ref('Organization', { required: true, index: true }), name }, { timestamps: true }));

export const User = model(
  'User',
  new Schema(
    {
      name,
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      passwordHash: { type: String, required: true },
      color: { type: String, default: '#2e86ab' },
    },
    { timestamps: true }
  )
);

// tenantId === null  -> organization-level membership (only used for role "org_admin")
// tenantId !== null  -> branch-level membership ("tenant_admin" | "member")
const membershipSchema = new Schema(
  {
    userId: ref('User', { required: true }),
    orgId: ref('Organization', { required: true }),
    tenantId: ref('Tenant', { default: null }),
    role: { type: String, enum: ROLES, required: true },
  },
  { timestamps: true }
);
membershipSchema.index({ userId: 1, orgId: 1, tenantId: 1 }, { unique: true });
membershipSchema.index({ tenantId: 1 });
export const Membership = model('Membership', membershipSchema);

export const Board = model(
  'Board',
  new Schema({ tenantId: ref('Tenant', { required: true, index: true }), orgId: ref('Organization', { required: true }), name, createdBy: ref('User') }, { timestamps: true })
);

const columnSchema = new Schema(
  {
    tenantId: ref('Tenant', { required: true }),
    boardId: ref('Board', { required: true }),
    name,
    position: { type: Number, required: true },
  },
  { timestamps: true }
);
columnSchema.index({ tenantId: 1, boardId: 1, position: 1 });
export const Column = model('Column', columnSchema);

const taskSchema = new Schema(
  {
    tenantId: ref('Tenant', { required: true }),
    boardId: ref('Board', { required: true }),
    columnId: ref('Column', { required: true }),
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    assigneeId: ref('User', { default: null }),
    dueDate: { type: Date, default: null },
    position: { type: Number, required: true }, // fractional index, see lib/ordering.js
    version: { type: Number, default: 1 }, // bumped on every change (optimistic concurrency)
    deletedAt: { type: Date, default: null }, // soft delete => enables undo
    createdBy: ref('User'),
  },
  { timestamps: true }
);
taskSchema.index({ tenantId: 1, boardId: 1, deletedAt: 1 });
taskSchema.index({ tenantId: 1, columnId: 1, position: 1 });
export const Task = model('Task', taskSchema);

const activitySchema = new Schema(
  {
    tenantId: ref('Tenant', { required: true }),
    orgId: ref('Organization', { required: true }),
    userId: ref('User', { required: true }),
    userName: String,
    action: String,
    entityType: String,
    entityId: String,
    summary: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
activitySchema.index({ tenantId: 1, createdAt: -1 });
export const ActivityLog = model('ActivityLog', activitySchema);
