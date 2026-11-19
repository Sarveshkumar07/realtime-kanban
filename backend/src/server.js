import http from 'http';
import app from './app.js';
import { config } from './config.js';
import { connectDb } from './db.js';
import { initSocket } from './realtime.js';
import { seedDemo } from './seed.js';

async function main() {
  const { memory } = await connectDb();
  if (memory || process.env.SEED === 'true') await seedDemo();

  const server = http.createServer(app);
  initSocket(server);
  server.listen(config.port, '0.0.0.0', () => console.log(`[api] listening on ${config.port}`));
}

main().catch((err) => {
  console.error('STARTUP FAILED:', err.message);
  console.error(err);
  process.exit(1);
});