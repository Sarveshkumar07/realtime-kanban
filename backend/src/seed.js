import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, Organization, Membership, Task } from './models/index.js';
import { createTenantWithBoard } from './lib/provision.js';
import { GAP } from './lib/ordering.js';

export const DEMO_PASSWORD = 'password123';

async function addTasks({ tenant, board, columns }, userId, rows) {
  const counters = {};
  await Task.insertMany(
    rows.map(([col, title, priority = 'medium', description = '']) => {
      counters[col] = (counters[col] || 0) + 1;
      return { tenantId: tenant._id, boardId: board._id, columnId: columns[col]._id, title, priority, description, position: counters[col] * GAP, createdBy: userId };
    })
  );
}

// Wipes every collection, then creates two organizations so isolation is easy to see.
export async function seedDemo() {
  await Promise.all(Object.values(mongoose.models).map((m) => m.deleteMany({})));
  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const mk = (name, email, color) => User.create({ name, email, color, passwordHash });
  const [alice, bob, carol, dave, eve] = await Promise.all([
    mk('Alice Admin', 'alice@acme.com', '#e4572e'),
    mk('Bob Manager', 'bob@acme.com', '#2e86ab'),
    mk('Carol Member', 'carol@acme.com', '#6a994e'),
    mk('Dave Delhi', 'dave@acme.com', '#9b5de5'),
    mk('Eve Globex', 'eve@globex.com', '#d1495b'),
  ]);

  const acme = await Organization.create({ name: 'Acme Corp', createdBy: alice._id });
  const globex = await Organization.create({ name: 'Globex Inc', createdBy: eve._id });
  const mumbai = await createTenantWithBoard(acme._id, 'Mumbai Branch', alice._id);
  const delhi = await createTenantWithBoard(acme._id, 'Delhi Branch', alice._id);
  const hq = await createTenantWithBoard(globex._id, 'Globex HQ', eve._id);

  await Membership.insertMany([
    { userId: alice._id, orgId: acme._id, tenantId: null, role: 'org_admin' },
    { userId: eve._id, orgId: globex._id, tenantId: null, role: 'org_admin' },
    { userId: bob._id, orgId: acme._id, tenantId: mumbai.tenant._id, role: 'tenant_admin' },
    { userId: carol._id, orgId: acme._id, tenantId: mumbai.tenant._id, role: 'member' },
    { userId: dave._id, orgId: acme._id, tenantId: delhi.tenant._id, role: 'member' },
  ]);

  await addTasks(mumbai, bob._id, [
    [0, 'Plan Diwali campaign', 'high', 'Draft the offers and the schedule for the festive season.'],
    [0, 'Order new shelving', 'low'],
    [0, 'Hire a store assistant', 'medium'],
    [1, 'Update the price list', 'medium', 'Waiting on the supplier sheet.'],
    [1, 'Fix the POS printer', 'high'],
    [2, 'Monthly stock count', 'low'],
  ]);
  await addTasks(delhi, dave._id, [
    [0, 'Renew shop licence', 'high'],
    [1, 'Train new cashier', 'medium'],
    [2, 'Repaint front wall', 'low'],
    [0, 'Collect customer feedback', 'medium'],
  ]);
  await addTasks(hq, eve._id, [
    [0, 'Quarterly board report', 'high'],
    [1, 'Vendor contract review', 'medium'],
    [2, 'Office move checklist', 'low'],
  ]);
  console.log(`[seed] demo data ready. Log in with e.g. alice@acme.com / ${DEMO_PASSWORD}`);
}
