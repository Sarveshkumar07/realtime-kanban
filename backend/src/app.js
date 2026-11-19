import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { requireAuth } from './middleware/auth.js';
import { tenantScope } from './middleware/tenant.js';
import { errorHandler } from './lib/http.js';
import authRoutes from './routes/auth.js';
import orgRoutes from './routes/orgs.js';
import tenantRoutes from './routes/tenants.js';
import boardRoutes from './routes/boards.js';
import taskRoutes from './routes/tasks.js';

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/orgs', requireAuth, orgRoutes);
// All business data lives below a tenant. tenantScope verifies membership once for the whole subtree.
app.use('/api/tenants/:tenantId', requireAuth, tenantScope, tenantRoutes, boardRoutes, taskRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

export default app;
