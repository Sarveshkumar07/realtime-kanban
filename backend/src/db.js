import mongoose from 'mongoose';
import { config } from './config.js';

// Connects to MONGO_URI, or falls back to an in-memory MongoDB for zero-setup development.
export async function connectDb() {
  let uri = config.mongoUri;
  let memory = false;
  if (!uri) {
    if (config.isProd) throw new Error('MONGO_URI is required in production');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mem = await MongoMemoryServer.create();
    uri = mem.getUri();
    memory = true;
    console.log('[db] No MONGO_URI set -> using in-memory MongoDB (data resets on restart)');
  }
  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // make sure indexes exist
  console.log('[db] connected');
  return { memory };
}
