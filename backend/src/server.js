import http from 'http';
import app from './app.js';
import { config } from './config.js';
import { connectDb } from './db.js';
import { initSocket } from './realtime.js';
import { seedDemo } from './seed.js';

const { memory } = await connectDb();
if (memory || process.env.SEED === 'true') await seedDemo();

const server = http.createServer(app);
initSocket(server);
server.listen(config.port, () => console.log(`[api] http://localhost:${config.port}`));
